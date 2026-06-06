
-- ============================================================
-- GROUPS: add invite code, cover, kicker
-- ============================================================
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS kicker text;

-- Backfill an invite code for existing rows
UPDATE public.groups
SET invite_code = upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))
WHERE invite_code IS NULL;

-- ============================================================
-- JOIN REQUESTS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.join_request_status AS ENUM ('pending','approved','declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  user_id uuid,                    -- set when a logged-in user requested via code
  invited_email text,
  invited_name text,
  invited_by uuid,                 -- the existing member who invited (null for self-request)
  status public.join_request_status NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid
);

CREATE INDEX IF NOT EXISTS idx_gjr_group ON public.group_join_requests(group_id, status);
CREATE INDEX IF NOT EXISTS idx_gjr_user  ON public.group_join_requests(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_join_requests TO authenticated;
GRANT ALL ON public.group_join_requests TO service_role;

ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

-- Admins see all requests for their groups; users see their own requests
CREATE POLICY gjr_admin_select ON public.group_join_requests
  FOR SELECT TO authenticated
  USING (public.is_group_admin(group_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY gjr_user_insert ON public.group_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_group_member(group_id, auth.uid()));

CREATE POLICY gjr_admin_update ON public.group_join_requests
  FOR UPDATE TO authenticated
  USING (public.is_group_admin(group_id, auth.uid()));

CREATE POLICY gjr_admin_delete ON public.group_join_requests
  FOR DELETE TO authenticated
  USING (public.is_group_admin(group_id, auth.uid()) OR user_id = auth.uid());

-- ============================================================
-- FIND GROUP BY INVITE CODE (security definer to bypass groups RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_group_by_code(_code text)
RETURNS TABLE(id uuid, name text, kicker text, cover_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name, kicker, cover_url
  FROM public.groups
  WHERE invite_code = upper(trim(_code))
  LIMIT 1;
$$;

-- Request to join a group via invite code (creates a pending request)
CREATE OR REPLACE FUNCTION public.request_join_by_code(_code text, _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _gid uuid;
  _req uuid;
BEGIN
  SELECT id INTO _gid FROM public.groups WHERE invite_code = upper(trim(_code));
  IF _gid IS NULL THEN RAISE EXCEPTION 'Invalid invite code'; END IF;

  -- Already a member?
  IF EXISTS (SELECT 1 FROM public.group_members WHERE group_id = _gid AND user_id = auth.uid()) THEN
    RETURN NULL;
  END IF;

  -- Existing pending request?
  SELECT id INTO _req FROM public.group_join_requests
   WHERE group_id = _gid AND user_id = auth.uid() AND status = 'pending';
  IF _req IS NOT NULL THEN RETURN _req; END IF;

  INSERT INTO public.group_join_requests(group_id, user_id, note, status)
  VALUES (_gid, auth.uid(), _note, 'pending')
  RETURNING id INTO _req;
  RETURN _req;
END;
$$;

-- Approve a pending request: insert as member, mark approved
CREATE OR REPLACE FUNCTION public.approve_join_request(_req_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.group_join_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.group_join_requests WHERE id = _req_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.is_group_admin(r.group_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not an admin';
  END IF;
  IF r.user_id IS NOT NULL THEN
    INSERT INTO public.group_members(group_id, user_id, role)
    VALUES (r.group_id, r.user_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.group_join_requests
    SET status = 'approved', decided_at = now(), decided_by = auth.uid()
  WHERE id = _req_id;
END;
$$;

-- ============================================================
-- TEE TIME GROUPINGS / FOURBALLS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tee_time_groupings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_time_id uuid NOT NULL,
  label text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tee_time_grouping_players (
  grouping_id uuid NOT NULL REFERENCES public.tee_time_groupings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  position int NOT NULL DEFAULT 0,
  PRIMARY KEY (grouping_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ttg_tee ON public.tee_time_groupings(tee_time_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tee_time_groupings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tee_time_grouping_players TO authenticated;
GRANT ALL ON public.tee_time_groupings TO service_role;
GRANT ALL ON public.tee_time_grouping_players TO service_role;

ALTER TABLE public.tee_time_groupings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tee_time_grouping_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY ttg_member_select ON public.tee_time_groupings
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_member(t.group_id, auth.uid()))
  );
CREATE POLICY ttg_admin_write ON public.tee_time_groupings
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_admin(t.group_id, auth.uid()))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_admin(t.group_id, auth.uid()))
  );

CREATE POLICY ttgp_member_select ON public.tee_time_grouping_players
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.tee_time_groupings g
      JOIN public.tee_times t ON t.id = g.tee_time_id
      WHERE g.id = grouping_id AND public.is_group_member(t.group_id, auth.uid())
    )
  );
CREATE POLICY ttgp_admin_write ON public.tee_time_grouping_players
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.tee_time_groupings g
      JOIN public.tee_times t ON t.id = g.tee_time_id
      WHERE g.id = grouping_id AND public.is_group_admin(t.group_id, auth.uid())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tee_time_groupings g
      JOIN public.tee_times t ON t.id = g.tee_time_id
      WHERE g.id = grouping_id AND public.is_group_admin(t.group_id, auth.uid())
    )
  );

-- Randomize fourballs server-side
CREATE OR REPLACE FUNCTION public.randomize_fourballs(_tee_time_id uuid, _group_size int DEFAULT 4)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _gid uuid;
  _players uuid[];
  _count int;
  _num_groups int;
  _i int;
  _grouping_id uuid;
  _pos int;
BEGIN
  SELECT group_id INTO _gid FROM public.tee_times WHERE id = _tee_time_id;
  IF NOT public.is_group_admin(_gid, auth.uid()) THEN RAISE EXCEPTION 'Not an admin'; END IF;

  -- Clear existing groupings
  DELETE FROM public.tee_time_groupings WHERE tee_time_id = _tee_time_id;

  -- Confirmed players, randomized
  SELECT array_agg(user_id ORDER BY random())
    INTO _players
  FROM public.rsvps WHERE tee_time_id = _tee_time_id AND status = 'in';

  IF _players IS NULL THEN RETURN; END IF;
  _count := array_length(_players,1);
  _num_groups := GREATEST(1, ceil(_count::numeric / GREATEST(_group_size,2))::int);

  FOR _i IN 1.._num_groups LOOP
    INSERT INTO public.tee_time_groupings(tee_time_id, label, position)
    VALUES (_tee_time_id, 'Group ' || _i, _i)
    RETURNING id INTO _grouping_id;
  END LOOP;

  _pos := 0;
  FOR _i IN 1.._count LOOP
    SELECT id INTO _grouping_id FROM public.tee_time_groupings
      WHERE tee_time_id = _tee_time_id
      ORDER BY position
      OFFSET ((_i-1) % _num_groups) LIMIT 1;
    INSERT INTO public.tee_time_grouping_players(grouping_id, user_id, position)
    VALUES (_grouping_id, _players[_i], _i);
  END LOOP;
END;
$$;

-- ============================================================
-- HOLES, SCORES, ROUND RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.holes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_time_id uuid NOT NULL,
  number int NOT NULL CHECK (number BETWEEN 1 AND 18),
  par int NOT NULL DEFAULT 4,
  stroke_index int,
  yards int,
  UNIQUE (tee_time_id, number)
);

CREATE TABLE IF NOT EXISTS public.scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_time_id uuid NOT NULL,
  user_id uuid NOT NULL,
  hole int NOT NULL CHECK (hole BETWEEN 1 AND 18),
  strokes int,
  points int,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tee_time_id, user_id, hole)
);

CREATE TABLE IF NOT EXISTS public.round_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_time_id uuid NOT NULL,
  user_id uuid NOT NULL,
  game_format text NOT NULL,
  gross int,
  net int,
  stableford int,
  team_id text,
  position int,
  points_awarded int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tee_time_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.holes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_results TO authenticated;
GRANT ALL ON public.holes, public.scores, public.round_results TO service_role;

ALTER TABLE public.holes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY holes_member_select ON public.holes FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_member(t.group_id, auth.uid()))
);
CREATE POLICY holes_admin_write ON public.holes FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_admin(t.group_id, auth.uid()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_admin(t.group_id, auth.uid()))
);

CREATE POLICY scores_member_select ON public.scores FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_member(t.group_id, auth.uid()))
);
CREATE POLICY scores_self_write ON public.scores FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY scores_self_update ON public.scores FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY scores_self_delete ON public.scores FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_admin(t.group_id, auth.uid()))
);
CREATE POLICY scores_admin_write ON public.scores FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_admin(t.group_id, auth.uid()))
);
CREATE POLICY scores_admin_update ON public.scores FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_admin(t.group_id, auth.uid()))
);

CREATE POLICY rr_member_select ON public.round_results FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_member(t.group_id, auth.uid()))
);
CREATE POLICY rr_admin_write ON public.round_results FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_admin(t.group_id, auth.uid()))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.tee_times t WHERE t.id = tee_time_id AND public.is_group_admin(t.group_id, auth.uid()))
);

-- ============================================================
-- MESSAGES: add kind, reply_to, reactions
-- ============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'message' CHECK (kind IN ('message','announcement')),
  ADD COLUMN IF NOT EXISTS reply_to uuid,
  ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allow members to update reactions on any message in their group (self-only otherwise)
DROP POLICY IF EXISTS msg_member_react ON public.messages;
CREATE POLICY msg_member_react ON public.messages FOR UPDATE TO authenticated
  USING (public.is_group_member(group_id, auth.uid()))
  WITH CHECK (public.is_group_member(group_id, auth.uid()));

-- ============================================================
-- MESSAGE MUTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.message_mutes (
  user_id uuid NOT NULL,
  group_id uuid NOT NULL,
  muted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

GRANT SELECT, INSERT, DELETE ON public.message_mutes TO authenticated;
GRANT ALL ON public.message_mutes TO service_role;

ALTER TABLE public.message_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY mm_self_all ON public.message_mutes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- Realtime for chat
-- ============================================================
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
