-- Helper: admin OR coadmin
CREATE OR REPLACE FUNCTION public.is_group_staff(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id AND role IN ('admin','coadmin')
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_group_staff(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_staff(uuid, uuid) TO authenticated;

-- Tee times: any member can create; staff or creator can edit/delete
DROP POLICY IF EXISTS tt_admin_insert ON public.tee_times;
CREATE POLICY tt_member_insert ON public.tee_times
  FOR INSERT TO authenticated
  WITH CHECK (is_group_member(group_id, auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS tt_admin_update ON public.tee_times;
CREATE POLICY tt_staff_or_creator_update ON public.tee_times
  FOR UPDATE TO authenticated
  USING (is_group_staff(group_id, auth.uid()) OR created_by = auth.uid());

DROP POLICY IF EXISTS tt_admin_delete ON public.tee_times;
CREATE POLICY tt_staff_or_creator_delete ON public.tee_times
  FOR DELETE TO authenticated
  USING (is_group_staff(group_id, auth.uid()) OR created_by = auth.uid());

-- Scores: any group member can enter for anyone in the round
DROP POLICY IF EXISTS scores_self_write ON public.scores;
DROP POLICY IF EXISTS scores_admin_write ON public.scores;
DROP POLICY IF EXISTS scores_self_update ON public.scores;
DROP POLICY IF EXISTS scores_admin_update ON public.scores;
DROP POLICY IF EXISTS scores_self_delete ON public.scores;

CREATE POLICY scores_member_insert ON public.scores
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tee_times t
    WHERE t.id = scores.tee_time_id AND is_group_member(t.group_id, auth.uid())
  ));
CREATE POLICY scores_member_update ON public.scores
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tee_times t
    WHERE t.id = scores.tee_time_id AND is_group_member(t.group_id, auth.uid())
  ));
CREATE POLICY scores_member_delete ON public.scores
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tee_times t
    WHERE t.id = scores.tee_time_id AND is_group_member(t.group_id, auth.uid())
  ));

ALTER TABLE public.scores
  ADD CONSTRAINT scores_tt_user_hole_uniq UNIQUE (tee_time_id, user_id, hole);

-- Round results: published flag + open writes to members for live calc
ALTER TABLE public.round_results
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid;

ALTER TABLE public.round_results
  ADD CONSTRAINT round_results_tt_user_uniq UNIQUE (tee_time_id, user_id);

DROP POLICY IF EXISTS rr_admin_write ON public.round_results;
CREATE POLICY rr_member_write ON public.round_results
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tee_times t
    WHERE t.id = round_results.tee_time_id AND is_group_member(t.group_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tee_times t
    WHERE t.id = round_results.tee_time_id AND is_group_member(t.group_id, auth.uid())
  ));

-- Season scores unique key + member insert via publish flow
ALTER TABLE public.season_scores
  ADD CONSTRAINT season_scores_tt_user_uniq UNIQUE (tee_time_id, user_id);

-- Tee times: last_reminded_at
ALTER TABLE public.tee_times
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

-- Admin-only: change member role
CREATE OR REPLACE FUNCTION public.set_member_role(_group_id uuid, _user_id uuid, _role public.member_role)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_group_admin(_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only admin can change roles';
  END IF;
  IF _role NOT IN ('member','coadmin') THEN
    RAISE EXCEPTION 'Use group ownership transfer to assign admin';
  END IF;
  UPDATE public.group_members SET role = _role
    WHERE group_id = _group_id AND user_id = _user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_member_role(uuid, uuid, public.member_role) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_role(uuid, uuid, public.member_role) TO authenticated;

-- Admin-only: rotate invite code
CREATE OR REPLACE FUNCTION public.rotate_invite_code(_group_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _code text;
BEGIN
  IF NOT public.is_group_admin(_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only admin can rotate invite code';
  END IF;
  _code := upper(substring(md5(random()::text || clock_timestamp()::text) for 6));
  UPDATE public.groups SET invite_code = _code WHERE id = _group_id;
  RETURN _code;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rotate_invite_code(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_invite_code(uuid) TO authenticated;

-- Staff: publish round results -> season leaderboard
CREATE OR REPLACE FUNCTION public.publish_round_results(_tee_time_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _gid uuid; _year int;
BEGIN
  SELECT group_id INTO _gid FROM public.tee_times WHERE id = _tee_time_id;
  IF _gid IS NULL THEN RAISE EXCEPTION 'Tee time not found'; END IF;
  IF NOT public.is_group_staff(_gid, auth.uid()) THEN
    RAISE EXCEPTION 'Only admin or co-admin can publish results';
  END IF;
  _year := extract(year from now())::int;

  UPDATE public.round_results
    SET published_at = now(), published_by = auth.uid()
  WHERE tee_time_id = _tee_time_id;

  INSERT INTO public.season_scores
    (group_id, user_id, tee_time_id, season_year, points, gross_score, stableford_points)
  SELECT _gid, rr.user_id, _tee_time_id, _year,
         COALESCE(rr.stableford,0), rr.gross, rr.stableford
  FROM public.round_results rr
  WHERE rr.tee_time_id = _tee_time_id
  ON CONFLICT (tee_time_id, user_id) DO UPDATE SET
    points = EXCLUDED.points,
    gross_score = EXCLUDED.gross_score,
    stableford_points = EXCLUDED.stableford_points;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.publish_round_results(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_round_results(uuid) TO authenticated;

-- Staff: send reminder
CREATE OR REPLACE FUNCTION public.send_reminder(_tee_time_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _gid uuid;
BEGIN
  SELECT group_id INTO _gid FROM public.tee_times WHERE id = _tee_time_id;
  IF NOT public.is_group_staff(_gid, auth.uid()) THEN
    RAISE EXCEPTION 'Only admin or co-admin can send reminders';
  END IF;
  UPDATE public.tee_times SET last_reminded_at = now() WHERE id = _tee_time_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_reminder(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_reminder(uuid) TO authenticated;

-- Open randomize_fourballs to coadmin
CREATE OR REPLACE FUNCTION public.randomize_fourballs(_tee_time_id uuid, _group_size integer DEFAULT 4)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _gid uuid; _players uuid[]; _count int; _num_groups int; _i int; _grouping_id uuid;
BEGIN
  SELECT group_id INTO _gid FROM public.tee_times WHERE id = _tee_time_id;
  IF NOT public.is_group_staff(_gid, auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.tee_time_groupings WHERE tee_time_id = _tee_time_id;
  SELECT array_agg(user_id ORDER BY random()) INTO _players
    FROM public.rsvps WHERE tee_time_id = _tee_time_id AND status = 'in';
  IF _players IS NULL THEN RETURN; END IF;
  _count := array_length(_players,1);
  _num_groups := GREATEST(1, ceil(_count::numeric / GREATEST(_group_size,2))::int);
  FOR _i IN 1.._num_groups LOOP
    INSERT INTO public.tee_time_groupings(tee_time_id, label, position)
    VALUES (_tee_time_id, 'Group ' || _i, _i)
    RETURNING id INTO _grouping_id;
  END LOOP;
  FOR _i IN 1.._count LOOP
    SELECT id INTO _grouping_id FROM public.tee_time_groupings
      WHERE tee_time_id = _tee_time_id
      ORDER BY position OFFSET ((_i-1) % _num_groups) LIMIT 1;
    INSERT INTO public.tee_time_grouping_players(grouping_id, user_id, position)
    VALUES (_grouping_id, _players[_i], _i);
  END LOOP;
END;
$$;