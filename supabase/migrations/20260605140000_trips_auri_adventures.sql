-- Extend trips table for Auri Adventures travel packages
alter table public.trips
  add column if not exists status        text          not null default 'open',
  add column if not exists max_spots     int           not null default 20,
  add column if not exists booking_deadline date,
  add column if not exists inclusions    text,
  add column if not exists highlights    jsonb         not null default '[]',
  add column if not exists itinerary     jsonb         not null default '[]',
  add column if not exists golf_courses  text,
  add column if not exists agency_name   text          not null default 'Auri Adventures',
  add column if not exists agency_contact text;

-- status values: 'open' | 'closed' | 'confirmed' | 'cancelled'
-- highlights: array of strings, e.g. ["5 rounds of golf", "Private transfers"]
-- itinerary:  array of {day: number, title: string, description: string}

-- Add note + timestamp to trip_members so members can attach a message when registering interest
alter table public.trip_members
  add column if not exists note       text,
  add column if not exists created_at timestamptz not null default now();

-- Allow members to express interest themselves (insert/update their own row)
-- (existing tm_self_manage policy covers insert; add update via status below)
drop policy if exists "tm_self_update" on public.trip_members;
create policy "tm_self_update" on public.trip_members
  for update to authenticated using (user_id = auth.uid());

-- Admins can update any trip_member row (e.g. to confirm a booking)
drop policy if exists "tm_admin_update" on public.trip_members;
create policy "tm_admin_update" on public.trip_members
  for update to authenticated using (
    exists (
      select 1 from public.trips t
      join public.group_members gm on gm.group_id = t.group_id
      where t.id = trip_id and gm.user_id = auth.uid() and gm.role = 'admin'
    )
  );
