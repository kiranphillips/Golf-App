
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  handicap numeric(4,1),
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_all" on public.profiles for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Groups
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.groups to authenticated;
grant all on public.groups to service_role;
alter table public.groups enable row level security;

-- Group members
create type public.member_role as enum ('admin', 'member');
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
grant select, insert, update, delete on public.group_members to authenticated;
grant all on public.group_members to service_role;
alter table public.group_members enable row level security;

-- Membership helper (security definer to avoid RLS recursion)
create or replace function public.is_group_member(_group_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = _group_id and user_id = _user_id);
$$;
create or replace function public.is_group_admin(_group_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = _group_id and user_id = _user_id and role = 'admin');
$$;

create policy "groups_member_select" on public.groups for select to authenticated using (public.is_group_member(id, auth.uid()));
create policy "groups_insert_self" on public.groups for insert to authenticated with check (auth.uid() = owner_id);
create policy "groups_admin_update" on public.groups for update to authenticated using (public.is_group_admin(id, auth.uid()));
create policy "groups_owner_delete" on public.groups for delete to authenticated using (owner_id = auth.uid());

create policy "members_select_same_group" on public.group_members for select to authenticated using (public.is_group_member(group_id, auth.uid()));
create policy "members_admin_manage" on public.group_members for insert to authenticated with check (public.is_group_admin(group_id, auth.uid()) or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy "members_admin_update" on public.group_members for update to authenticated using (public.is_group_admin(group_id, auth.uid()));
create policy "members_admin_delete" on public.group_members for delete to authenticated using (public.is_group_admin(group_id, auth.uid()) or user_id = auth.uid());

-- Owner auto-joins as admin
create or replace function public.add_owner_as_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.group_members (group_id, user_id, role) values (new.id, new.owner_id, 'admin');
  return new;
end;
$$;
create trigger groups_add_owner_admin after insert on public.groups for each row execute function public.add_owner_as_admin();

-- Tee times
create type public.game_format as enum ('stableford', 'best_ball', 'four_ball_alliance', 'match_play', 'stroke_play', 'skins', 'custom');
create table public.tee_times (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  course_name text not null,
  tee_at timestamptz not null,
  spots int not null default 4,
  format public.game_format not null default 'stableford',
  notes text,
  cost numeric(10,2),
  dress_code text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tee_times to authenticated;
grant all on public.tee_times to service_role;
alter table public.tee_times enable row level security;
create policy "tt_member_select" on public.tee_times for select to authenticated using (public.is_group_member(group_id, auth.uid()));
create policy "tt_admin_insert" on public.tee_times for insert to authenticated with check (public.is_group_admin(group_id, auth.uid()));
create policy "tt_admin_update" on public.tee_times for update to authenticated using (public.is_group_admin(group_id, auth.uid()));
create policy "tt_admin_delete" on public.tee_times for delete to authenticated using (public.is_group_admin(group_id, auth.uid()));

-- RSVPs
create type public.rsvp_status as enum ('in', 'out', 'maybe');
create table public.rsvps (
  tee_time_id uuid not null references public.tee_times(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.rsvp_status not null,
  updated_at timestamptz not null default now(),
  primary key (tee_time_id, user_id)
);
grant select, insert, update, delete on public.rsvps to authenticated;
grant all on public.rsvps to service_role;
alter table public.rsvps enable row level security;
create policy "rsvp_member_select" on public.rsvps for select to authenticated using (
  exists (select 1 from public.tee_times t where t.id = tee_time_id and public.is_group_member(t.group_id, auth.uid()))
);
create policy "rsvp_self_upsert" on public.rsvps for insert to authenticated with check (user_id = auth.uid());
create policy "rsvp_self_update" on public.rsvps for update to authenticated using (user_id = auth.uid());
create policy "rsvp_self_delete" on public.rsvps for delete to authenticated using (user_id = auth.uid());

-- Trips
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  destination text not null,
  start_date date not null,
  end_date date not null,
  cover_url text,
  notes text,
  cost numeric(10,2),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.trips to authenticated;
grant all on public.trips to service_role;
alter table public.trips enable row level security;
create policy "trips_member_select" on public.trips for select to authenticated using (public.is_group_member(group_id, auth.uid()));
create policy "trips_admin_insert" on public.trips for insert to authenticated with check (public.is_group_admin(group_id, auth.uid()));
create policy "trips_admin_update" on public.trips for update to authenticated using (public.is_group_admin(group_id, auth.uid()));
create policy "trips_admin_delete" on public.trips for delete to authenticated using (public.is_group_admin(group_id, auth.uid()));

create table public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.rsvp_status not null default 'in',
  primary key (trip_id, user_id)
);
grant select, insert, update, delete on public.trip_members to authenticated;
grant all on public.trip_members to service_role;
alter table public.trip_members enable row level security;
create policy "tm_member_select" on public.trip_members for select to authenticated using (
  exists (select 1 from public.trips t where t.id = trip_id and public.is_group_member(t.group_id, auth.uid()))
);
create policy "tm_self_manage" on public.trip_members for insert to authenticated with check (user_id = auth.uid());
create policy "tm_self_update" on public.trip_members for update to authenticated using (user_id = auth.uid());
create policy "tm_self_delete" on public.trip_members for delete to authenticated using (user_id = auth.uid());

-- Messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "msg_member_select" on public.messages for select to authenticated using (public.is_group_member(group_id, auth.uid()));
create policy "msg_member_insert" on public.messages for insert to authenticated with check (public.is_group_member(group_id, auth.uid()) and user_id = auth.uid());
create policy "msg_self_delete" on public.messages for delete to authenticated using (user_id = auth.uid());

-- Season scores (round-level points for leaderboard)
create table public.season_scores (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  tee_time_id uuid references public.tee_times(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  season_year int not null,
  points int not null default 0,
  gross_score int,
  stableford_points int,
  position int,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.season_scores to authenticated;
grant all on public.season_scores to service_role;
alter table public.season_scores enable row level security;
create policy "ss_member_select" on public.season_scores for select to authenticated using (public.is_group_member(group_id, auth.uid()));
create policy "ss_admin_manage" on public.season_scores for insert to authenticated with check (public.is_group_admin(group_id, auth.uid()));
create policy "ss_admin_update" on public.season_scores for update to authenticated using (public.is_group_admin(group_id, auth.uid()));
create policy "ss_admin_delete" on public.season_scores for delete to authenticated using (public.is_group_admin(group_id, auth.uid()));

create index on public.group_members (user_id);
create index on public.tee_times (group_id, tee_at);
create index on public.messages (group_id, created_at);
create index on public.season_scores (group_id, season_year, points);
