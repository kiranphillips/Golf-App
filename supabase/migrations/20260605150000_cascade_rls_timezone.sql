-- ─── 1. Cascade deletes on all tee-time child tables ─────────────────────────
-- Allows deleting a tee_time without needing the service role key to manually
-- clean up child rows first.

-- holes
ALTER TABLE public.holes
  DROP CONSTRAINT IF EXISTS holes_tee_time_id_fkey;
ALTER TABLE public.holes
  ADD CONSTRAINT holes_tee_time_id_fkey
  FOREIGN KEY (tee_time_id) REFERENCES public.tee_times(id) ON DELETE CASCADE;

-- scores
ALTER TABLE public.scores
  DROP CONSTRAINT IF EXISTS scores_tee_time_id_fkey;
ALTER TABLE public.scores
  ADD CONSTRAINT scores_tee_time_id_fkey
  FOREIGN KEY (tee_time_id) REFERENCES public.tee_times(id) ON DELETE CASCADE;

-- round_results
ALTER TABLE public.round_results
  DROP CONSTRAINT IF EXISTS round_results_tee_time_id_fkey;
ALTER TABLE public.round_results
  ADD CONSTRAINT round_results_tee_time_id_fkey
  FOREIGN KEY (tee_time_id) REFERENCES public.tee_times(id) ON DELETE CASCADE;

-- tee_time_groupings (previously had no FK at all)
ALTER TABLE public.tee_time_groupings
  DROP CONSTRAINT IF EXISTS tee_time_groupings_tee_time_id_fkey;
ALTER TABLE public.tee_time_groupings
  ADD CONSTRAINT tee_time_groupings_tee_time_id_fkey
  FOREIGN KEY (tee_time_id) REFERENCES public.tee_times(id) ON DELETE CASCADE;

-- ─── 2. Allow the tee-time CREATOR to delete (not just group admin) ───────────
DROP POLICY IF EXISTS "tt_admin_delete" ON public.tee_times;
CREATE POLICY "tt_delete" ON public.tee_times
  FOR DELETE TO authenticated
  USING (public.is_group_admin(group_id, auth.uid()) OR created_by = auth.uid());

-- ─── 3. Allow the tee-time CREATOR (not just admin) to write holes ───────────
-- Previously only group admins could insert/update holes, which meant casual
-- rounds (created by regular members) failed when trying to seed hole data.
DROP POLICY IF EXISTS "holes_admin_write" ON public.holes;
CREATE POLICY "holes_write" ON public.holes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tee_times t
      WHERE t.id = tee_time_id
        AND (t.created_by = auth.uid() OR public.is_group_admin(t.group_id, auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tee_times t
      WHERE t.id = tee_time_id
        AND (t.created_by = auth.uid() OR public.is_group_admin(t.group_id, auth.uid()))
    )
  );

-- ─── 4. Allow anyone in the group to insert round_results (needed for submit) ─
DROP POLICY IF EXISTS "rr_admin_write" ON public.round_results;
CREATE POLICY "rr_member_write" ON public.round_results
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tee_times t
      JOIN public.group_members gm ON gm.group_id = t.group_id
      WHERE t.id = tee_time_id AND gm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tee_times t
      JOIN public.group_members gm ON gm.group_id = t.group_id
      WHERE t.id = tee_time_id AND gm.user_id = auth.uid()
    )
  );

-- ─── 5. Timezone column on tee_times ─────────────────────────────────────────
ALTER TABLE public.tee_times
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';
