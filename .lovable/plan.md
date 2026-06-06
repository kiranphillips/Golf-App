# Fairway Club — v2 Completion Plan

This is a large, multi-area change. I'll ship it in 5 phases on the existing Private Club Heritage design system. The login/signup flow already lands on the group picker home — that part is correct; I'll just polish copy and add a "Pending invites" section.

## Phase 1 — Data model (one migration)

Schema additions:
- `group_members.role` enum extended: `admin | coadmin | member`
- `tee_times`: drop admin-only INSERT policy → any group member can create; add `created_by`, ensure RLS allows admin/coadmin edit, creator edit
- `scores` RLS: any group member can insert/update scores for any player in the tee time (not just self)
- `round_results`: add `published_at`, `published_by`; only admin/coadmin can update/publish
- `profiles.handicap` already exists — surface it in UI
- Helper SQL functions:
  - `is_group_coadmin_or_admin(_group_id, _user_id)`
  - `promote_to_coadmin(_group_id, _user_id)` / `demote_coadmin(...)`
  - `rotate_invite_code(_group_id)` (admin only)
  - `calculate_round_results(_tee_time_id)` — computes gross, net (handicap + SI), Stableford, Best Ball, Four Ball Alliance; writes to `round_results`
  - `publish_round_results(_tee_time_id)` — admin/coadmin only; copies to `season_scores`
- `holes` table already exists — seed default 18-hole par-72 SI template when a tee time is created with no holes
- Index `round_results.tee_time_id`, `scores(tee_time_id, user_id, hole)` unique

## Phase 2 — Server functions (`src/lib/api.functions.ts`)

New / updated:
- `listMyGroups` → also returns counts (next tee time time, pending requests for admins)
- `listMyPendingRequests` (for "your pending invites" section on home)
- `getGroupDashboard(groupId)` → upcoming tee times, leaderboard top 5, latest chat preview, member count, my role
- `createTeeTime(groupId, { courseName, teeAt, format, spots, notes })` — any member
- `setRsvp(teeTimeId, status)`
- `sendReminder(teeTimeId)` — admin/coadmin marks a reminder (in-app only for v1)
- `randomizeFourballs(teeTimeId)` / `updateGrouping(...)` (admin/coadmin)
- `listMembers(groupId)` with role; `promoteCoadmin` / `demoteCoadmin` (admin only)
- `rotateInviteCode(groupId)` (admin only)
- `listJoinRequests(groupId)` / `approveJoinRequest` / `declineJoinRequest`
- `enterHoleScore(teeTimeId, userId, hole, strokes)` — any member of the group
- `recalculateResults(teeTimeId)` — anyone, recompute live
- `publishResults(teeTimeId)` — admin/coadmin only; writes season points
- `listMessages(groupId, { limit, before })` / `postMessage(groupId, body, { kind })` — `announcement` kind restricted to admin/coadmin
- `getLeaderboard(groupId, { season })` — sums season_scores per user

## Phase 3 — Routes

Replace mock-driven routes; keep `/auth`, `/profile`.

```
/                                       → group picker + pending invites + create/join (already exists, add pending invites + polish)
/groups/$gid                            → group dashboard (next tee time, leaderboard top 5, chat preview, "create tee time" CTA)
/groups/$gid/tee-times                  → list of upcoming + past tee times, "+ New tee time" for any member
/groups/$gid/tee-times/new              → simple form: course, date/time, format, spots, notes
/groups/$gid/tee-times/$ttid            → details: In/Maybe/Out/No Reply sections, RSVP buttons, Send Reminder (admin/coadmin), Randomize Fourballs, Fourball cards (editable for admin/coadmin), "Enter scores" CTA, Results preview
/groups/$gid/tee-times/$ttid/scorecard  → hole-by-hole entry for every player in the active tee time; toggle Gross/Net/Game; live calc; Publish button (admin/coadmin)
/groups/$gid/leaderboard                → season standings table + podium
/groups/$gid/chat                       → simple chat with member messages + admin/coadmin announcements styled distinctly
/groups/$gid/members                    → roster + promote/demote (admin), invite code + rotate
/groups/$gid/admin                      → join requests, group settings (rename, kicker, default format), only admin/coadmin
/profile                                → display name, handicap (editable), sign out
```

Bottom-nav inside a group: Dashboard · Tee Times · Leaderboard · Chat · More.

## Phase 4 — Scoring & handicap math

`src/lib/scoring.ts` (already partially scaffolded) finalized with:
- **Net stroke per hole** = `gross - strokesReceived(hole)` where `strokesReceived = floor(handicap/18) + (SI(hole) <= (handicap mod 18) ? 1 : 0)` (USGA-style)
- **Stableford** points off net: ≤−2 → 4, −1 → 3, 0 → 2, +1 → 1, ≥+2 → 0 (configurable)
- **Best Ball** (team of 2): per hole take the lower net of the 2 players; sum
- **Four Ball Alliance**: per hole take the 2 lowest Stableford points of the team (configurable count). Default `[2,2,3,3]` counted scores by hole rotation, exposed as setting
- Used in both the live scorecard (client preview) and `calculate_round_results` SQL (server truth)

Season points (Publish):
- Stableford: total points
- Best Ball / Four Ball: 10/7/5/3 per team placement, distributed to members
- Stroke: 10/7/5/3 per player placement

## Phase 5 — Auth & polish

- Confirm `/auth` lands on `/` (already does).
- Add "Pending invites/requests" panel to `/` (groups you've requested to join).
- Migrate the legacy `/tee-times`, `/leaderboard`, `/scorecard`, `/messages`, `/trips*` routes to redirect into the group picker if no group context (or delete; they reference `mock.ts`).
- Remove dead `mock.ts` references from routes (keep file only for dev seed).
- `MobileShell` shows current group name + "Switch group" affordance.
- `/profile` becomes real (handicap editable).

## Technical notes (for me, not the user)

- Single migration runs first; per project conventions every CREATE TABLE has GRANT + RLS + policies. No new tables actually needed — only column additions, RLS changes, and SQL functions.
- All score-entry endpoints validate that `auth.uid()` is a member of the tee time's group (via existing `is_group_member`).
- Publish endpoint enforces admin/coadmin via new `is_group_coadmin_or_admin`.
- Co-admin remains a player: scoring/RSVP code paths key off membership, not role; role only gates publish/randomize/reminders/announcements/settings.

## Order of work

1. Migration (Phase 1)
2. Server fns (Phase 2)
3. Scoring engine finalization (Phase 4 — pure TS, no DB)
4. Routes & UI (Phase 3)
5. Polish + dead route cleanup (Phase 5)

I'll stop after the migration for your approval, then ship the rest in one pass.

Reply **go** to proceed, or tell me what to cut (e.g. defer co-admin, defer net scoring, skip chat for now).