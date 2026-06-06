-- ─── Global trips (Auri Adventures catalog) ──────────────────────────────────
-- Trips are now global — created by the app owner and visible to every
-- authenticated user. Ownership is enforced server-side via APP_OWNER_EMAIL
-- env var (no DB column needed).

-- 1. Make group_id nullable on trips
ALTER TABLE public.trips ALTER COLUMN group_id DROP NOT NULL;

-- 2. Add is_global flag
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

-- Mark any existing orphan trips as global
UPDATE public.trips SET is_global = true WHERE group_id IS NULL;

-- 3. Update RLS ─────────────────────────────────────────────────────────────

-- SELECT: global trips visible to ALL authenticated users
DROP POLICY IF EXISTS "trips_member_select" ON public.trips;
CREATE POLICY "trips_select" ON public.trips FOR SELECT TO authenticated USING (
  is_global = true
  OR (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
);

-- INSERT / UPDATE / DELETE: server functions enforce owner-only via
-- APP_OWNER_EMAIL env check. RLS allows any authenticated user through
-- because authorization is already validated server-side before any DB call.
DROP POLICY IF EXISTS "trips_admin_insert" ON public.trips;
CREATE POLICY "trips_insert" ON public.trips FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "trips_admin_update" ON public.trips;
CREATE POLICY "trips_update" ON public.trips FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "trips_admin_delete" ON public.trips;
CREATE POLICY "trips_delete" ON public.trips FOR DELETE TO authenticated USING (true);

-- 4. trip_members: all auth users can read interest for global trips
DROP POLICY IF EXISTS "tm_member_select" ON public.trip_members;
CREATE POLICY "tm_select" ON public.trip_members FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = trip_id
      AND (
        t.is_global = true
        OR (t.group_id IS NOT NULL AND public.is_group_member(t.group_id, auth.uid()))
      )
  )
);

-- Any authenticated user can insert/update their own trip_member row
DROP POLICY IF EXISTS "tm_self_manage" ON public.trip_members;
CREATE POLICY "tm_self_insert" ON public.trip_members
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
