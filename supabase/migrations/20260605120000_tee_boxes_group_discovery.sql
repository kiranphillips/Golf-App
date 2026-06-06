-- ============================================================
-- Migration: Tee Boxes + Group Discovery
-- ============================================================

-- 1. Tee box columns on tee_times
--    Stores a single selected tee for the whole round.
ALTER TABLE public.tee_times
  ADD COLUMN IF NOT EXISTS tee_box_name    text,
  ADD COLUMN IF NOT EXISTS course_rating   numeric(4,1) DEFAULT 72.0,
  ADD COLUMN IF NOT EXISTS slope_rating    integer      DEFAULT 113,
  ADD COLUMN IF NOT EXISTS course_par      integer      DEFAULT 72;

-- 2. Group discoverability columns
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS location  text;

-- 3. search_groups RPC
--    Any authenticated user can call this.
--    Returns all groups whose name matches the query.
--    Also returns whether the caller is a member / has a pending request.
CREATE OR REPLACE FUNCTION public.search_groups(
  _query      text    DEFAULT NULL,
  _limit      integer DEFAULT 30
)
RETURNS TABLE (
  id               uuid,
  name             text,
  kicker           text,
  description      text,
  is_public        boolean,
  location         text,
  member_count     bigint,
  user_is_member   boolean,
  has_pending_req  boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    g.id,
    g.name,
    g.kicker,
    g.description,
    COALESCE(g.is_public, false) AS is_public,
    g.location,
    COUNT(gm.user_id)            AS member_count,
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = g.id AND user_id = _uid
    )                            AS user_is_member,
    EXISTS (
      SELECT 1 FROM public.group_join_requests
      WHERE group_id = g.id AND user_id = _uid AND status = 'pending'
    )                            AS has_pending_req
  FROM public.groups g
  LEFT JOIN public.group_members gm ON gm.group_id = g.id
  WHERE
    _query IS NULL
    OR g.name ILIKE '%' || _query || '%'
  GROUP BY g.id
  ORDER BY member_count DESC, g.name
  LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_groups(text, integer) TO authenticated;

-- 4. requestJoinById RPC
--    Lets a user request to join a group by its UUID (no invite code needed).
CREATE OR REPLACE FUNCTION public.request_join_by_id(_group_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Already a member?
  IF EXISTS (
    SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _uid
  ) THEN
    RAISE EXCEPTION 'You are already a member of this group';
  END IF;

  -- Already pending?
  IF EXISTS (
    SELECT 1 FROM public.group_join_requests
    WHERE group_id = _group_id AND user_id = _uid AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a pending request for this group';
  END IF;

  INSERT INTO public.group_join_requests (group_id, user_id, note)
  VALUES (_group_id, _uid, _note);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_join_by_id(uuid, text) TO authenticated;

-- 5. updateGroupVisibility RPC
CREATE OR REPLACE FUNCTION public.update_group_visibility(
  _group_id uuid,
  _is_public boolean,
  _location  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _uid AND role IN ('admin', 'coadmin')
  ) THEN
    RAISE EXCEPTION 'Only admins can update group settings';
  END IF;

  UPDATE public.groups
  SET is_public = _is_public, location = _location
  WHERE id = _group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_group_visibility(uuid, boolean, text) TO authenticated;
