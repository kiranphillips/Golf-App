import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculate, courseHandicap, strokesOnHole, type GameFormat, type Hole, type PlayerRound } from "@/lib/scoring";

// App owners are identified by emails in APP_OWNER_EMAILS (comma-separated).
// No database column or SQL needed — just sign in with one of these emails.
function checkIsOwner(context: { claims?: any }): boolean {
  const raw = process.env.APP_OWNER_EMAILS ?? "";
  if (!raw) return false;
  const owners = raw.split(",").map(e => e.trim().toLowerCase());
  const email = (context.claims?.email ?? "").toLowerCase();
  return owners.includes(email);
}

// -------- GROUPS --------

export const listMyGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships, error } = await supabase
      .from("group_members")
      .select("role, group_id, groups(id, name, kicker, cover_url, invite_code, owner_id)")
      .eq("user_id", userId);
    if (error) throw error;
    return (memberships ?? []).map((m: any) => ({
      id: m.groups.id as string,
      name: m.groups.name as string,
      kicker: (m.groups.kicker ?? null) as string | null,
      coverUrl: (m.groups.cover_url ?? null) as string | null,
      inviteCode: (m.role === "admin" ? m.groups.invite_code ?? null : null) as string | null,
      role: m.role as string,
      isOwner: m.groups.owner_id === userId,
    }));
  });

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; kicker?: string }) =>
    z.object({ name: z.string().min(2).max(80), kicker: z.string().max(80).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    // Prevent duplicate group names within the user's own groups (RLS scopes this to their groups only).
    const { data: existing } = await supabase
      .from("groups")
      .select("id")
      .ilike("name", data.name)
      .limit(1);
    if (existing?.length) {
      throw new Error(`You already have a group called "${data.name}". Please choose a different name.`);
    }
    const { data: rows, error } = await supabase.rpc("create_group_safe", {
      _name: data.name,
      _kicker: data.kicker ?? undefined,
    });
    if (error) throw error;
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { id: row.id as string, invite_code: row.invite_code as string };
  });

export const lookupGroupByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) =>
    z.object({ code: z.string().min(3).max(40) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("find_group_by_code", {
      _code: data.code,
    });
    if (error) throw error;
    return rows?.[0] ?? null;
  });

export const requestJoinByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; note?: string }) =>
    z.object({ code: z.string().min(3).max(40), note: z.string().max(280).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: reqId, error } = await supabase.rpc("request_join_by_code", {
      _code: data.code,
      _note: data.note ?? undefined,
    });
    if (error) throw error;
    return { requestId: reqId };
  });

export const setInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; code: string }) =>
    z.object({ groupId: z.string().uuid(), code: z.string().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("groups")
      .update({ invite_code: data.code.toUpperCase() })
      .eq("id", data.groupId);
    if (error) throw error;
    return { ok: true };
  });

export const inviteToGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; name: string; email: string }) =>
    z.object({
      groupId: z.string().uuid(),
      name: z.string().min(1).max(120),
      email: z.string().email(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", data.groupId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member || (member.role !== "admin" && member.role !== "coadmin")) {
      throw new Error("Only group admins can invite members.");
    }
    const { error } = await supabase.from("group_join_requests").insert({
      group_id: data.groupId,
      invited_email: data.email,
      invited_name: data.name,
      invited_by: userId,
      status: "pending",
    });
    if (error) throw error;
    return { ok: true };
  });

export const listJoinRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string }) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("group_join_requests")
      .select("id, invited_email, invited_name, invited_by, user_id, note, status, created_at")
      .eq("group_id", data.groupId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    // Fetch profiles for invited_by and user_id
    const ids = Array.from(
      new Set(rows?.flatMap((r) => [r.invited_by, r.user_id].filter(Boolean) as string[]) ?? []),
    );
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]));
    }
    return (rows ?? []).map((r) => ({
      ...r,
      invited_by_name: r.invited_by ? names[r.invited_by] : null,
      requester_name: r.user_id ? names[r.user_id] : null,
    }));
  });

export const decideJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string; approve: boolean }) =>
    z.object({ requestId: z.string().uuid(), approve: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    if (data.approve) {
      const { error } = await supabase.rpc("approve_join_request", { _req_id: data.requestId });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("group_join_requests")
        .update({ status: "declined", decided_at: new Date().toISOString() })
        .eq("id", data.requestId);
      if (error) throw error;
    }
    return { ok: true };
  });

export const listGroupMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string }) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: m, error } = await supabase
      .from("group_members")
      .select("user_id, role, joined_at")
      .eq("group_id", data.groupId);
    if (error) throw error;
    const userIds = (m ?? []).map((x: any) => x.user_id);
    const profileMap = new Map<string, any>();
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, handicap, avatar_url")
        .in("id", userIds);
      (profs ?? []).forEach((p: any) => profileMap.set(p.id, p));
    }
    return (m ?? []).map((x: any) => {
      const p = profileMap.get(x.user_id);
      return {
        userId: x.user_id,
        role: x.role,
        name: p?.display_name ?? "Member",
        handicap: p?.handicap,
        avatarUrl: p?.avatar_url,
      };
    });
  });

// -------- TEE TIMES --------

export const listTeeTimes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string }) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", data.groupId)
      .eq("user_id", userId)
      .maybeSingle();
    const { data: rows, error } = await supabase
      .from("tee_times")
      .select("id, course_name, tee_at, spots, format, notes, dress_code, cost, created_by")
      .eq("group_id", data.groupId)
      .order("tee_at", { ascending: true });
    if (error) throw error;
    if (!rows?.length) return [];
    const ids = rows.map((r) => r.id);
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("tee_time_id, status, user_id")
      .in("tee_time_id", ids);
    const counts = new Map<string, { in: number; out: number; maybe: number }>();
    (rsvps ?? []).forEach((r) => {
      const c = counts.get(r.tee_time_id) ?? { in: 0, out: 0, maybe: 0 };
      if (r.status === "in") c.in++;
      else if (r.status === "out") c.out++;
      else if (r.status === "maybe") c.maybe++;
      counts.set(r.tee_time_id, c);
    });
    return rows.map((r) => ({
      ...r,
      counts: counts.get(r.id) ?? { in: 0, out: 0, maybe: 0 },
      canEdit: r.created_by === userId || member?.role === "admin" || member?.role === "coadmin",
    }));
  });

export const createTeeTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      groupId: z.string().uuid(),
      courseName: z.string().min(2).max(120),
      teeAt: z.string(),
      spots: z.number().int().min(2).max(40),
      format: z.enum(["stableford", "stroke_play", "best_ball", "four_ball_alliance", "match_play", "skins", "custom"]),
      notes: z.string().max(500).optional(),
      timezone: z.string().max(60).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: tt, error } = await supabase
      .from("tee_times")
      .insert({
        group_id: data.groupId,
        course_name: data.courseName,
        tee_at: data.teeAt,
        spots: data.spots,
        format: data.format as any,
        notes: data.notes ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    const whenStr = new Date(data.teeAt).toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
    await supabase.from("messages").insert({
      group_id: data.groupId, user_id: userId, kind: "announcement",
      body: `New tee time scheduled: ${data.courseName} — ${whenStr}. Please RSVP.`,
    });
    return tt;
  });

export const updateTeeTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      teeTimeId: z.string().uuid(),
      courseName: z.string().min(2).max(120),
      teeAt: z.string(),
      spots: z.number().int().min(2).max(40),
      format: z.enum(["stableford", "stroke_play", "best_ball", "four_ball_alliance", "match_play", "skins", "custom"]),
      notes: z.string().max(500).optional(),
      announce: z.boolean().optional(),
      timezone: z.string().max(60).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: prev, error: pErr } = await supabase
      .from("tee_times")
      .select("group_id, tee_at, course_name, created_by")
      .eq("id", data.teeTimeId)
      .single();
    if (pErr) throw pErr;
    const { data: member } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", prev.group_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (prev.created_by !== userId && member?.role !== "admin" && member?.role !== "coadmin") {
      throw new Error("You can only edit tee times you created.");
    }
    const { error } = await supabase
      .from("tee_times")
      .update({
        course_name: data.courseName,
        tee_at: data.teeAt,
        spots: data.spots,
        format: data.format as any,
        notes: data.notes ?? null,
      })
      .eq("id", data.teeTimeId);
    if (error) throw error;
    if (data.announce !== false) {
      const changed: string[] = [];
      if (prev.course_name !== data.courseName) changed.push(`course → ${data.courseName}`);
      if (new Date(prev.tee_at).getTime() !== new Date(data.teeAt).getTime()) {
        const whenStr = new Date(data.teeAt).toLocaleString(undefined, {
          weekday: "short", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit",
        });
        changed.push(`time → ${whenStr}`);
      }
      const body = changed.length
        ? `Tee time updated: ${changed.join(", ")}. Please confirm your RSVP.`
        : `Tee time details updated for ${data.courseName}. Please confirm your RSVP.`;
      await supabase.from("messages").insert({
        group_id: prev.group_id, user_id: userId, kind: "announcement", body,
      });
    }
    return { ok: true };
  });

export const deleteTeeTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teeTimeId: string }) => z.object({ teeTimeId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: tt, error: tErr } = await supabase
      .from("tee_times")
      .select("group_id, course_name, created_by")
      .eq("id", data.teeTimeId)
      .single();
    if (tErr) throw tErr;
    const { data: member } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", tt.group_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (tt.created_by !== userId && member?.role !== "admin" && member?.role !== "coadmin") {
      throw new Error("You can only cancel tee times you created.");
    }
    // Cascade deletes on holes, scores, round_results, rsvps, tee_time_groupings handle cleanup.
    const { error } = await supabase.from("tee_times").delete().eq("id", data.teeTimeId);
    if (error) throw error;
    await supabase.from("messages").insert({
      group_id: tt.group_id, user_id: userId, kind: "announcement",
      body: `Tee time cancelled: ${tt.course_name}.`,
    });
    return { ok: true };
  });


export const nudgeTeeTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teeTimeId: string; message?: string }) =>
    z.object({
      teeTimeId: z.string().uuid(),
      message: z.string().max(280).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: tt, error } = await supabase
      .from("tee_times")
      .select("group_id, course_name, tee_at")
      .eq("id", data.teeTimeId)
      .single();
    if (error) throw error;
    const whenStr = new Date(tt.tee_at).toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
    const body = data.message?.trim()
      ? data.message.trim()
      : `Friendly reminder: RSVP for ${tt.course_name} on ${whenStr}.`;
    const { error: mErr } = await supabase.from("messages").insert({
      group_id: tt.group_id, user_id: userId, kind: "announcement", body,
    });
    if (mErr) throw mErr;
    return { ok: true };
  });

export const startCasualRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      groupId: z.string().uuid(),
      courseName: z.string().min(2).max(120).optional(),
      timezone: z.string().max(60).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const teeAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: tt, error } = await supabase
      .from("tee_times")
      .insert({
        group_id: data.groupId,
        course_name: data.courseName ?? "Casual round",
        tee_at: teeAt,
        spots: 4,
        format: "stableford" as any,
        notes: "Casual round",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    await supabase.from("rsvps").upsert(
      { tee_time_id: tt.id, user_id: userId, status: "in", updated_at: new Date().toISOString() },
      { onConflict: "tee_time_id,user_id" },
    );
    await ensureTeeTimeHoles(supabase, tt.id);
    return tt;
  });

export const startScheduledRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teeTimeId: string }) => z.object({ teeTimeId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: tt, error: ttError } = await supabase
      .from("tee_times")
      .select("id, group_id")
      .eq("id", data.teeTimeId)
      .single();
    if (ttError) throw ttError;
    const { data: member } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", tt.group_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) throw new Error("You must be a group member to start this round.");
    const { error: rsvpError } = await supabase.from("rsvps").upsert(
      { tee_time_id: data.teeTimeId, user_id: userId, status: "in", updated_at: new Date().toISOString() },
      { onConflict: "tee_time_id,user_id" },
    );
    if (rsvpError) throw rsvpError;
    await ensureTeeTimeHoles(supabase, data.teeTimeId);
    return { id: data.teeTimeId };
  });

export const getTeeTime = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teeTimeId: string }) => z.object({ teeTimeId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: tt, error } = await supabase
      .from("tee_times")
      .select("id, group_id, course_name, tee_at, spots, format, notes, dress_code, cost, created_by")
      .eq("id", data.teeTimeId)
      .single();
    if (error) throw error;

    const { data: members } = await supabase
      .from("group_members")
      .select("user_id, role")
      .eq("group_id", tt.group_id);

    const memberIds = (members ?? []).map((m: any) => m.user_id);
    const { data: profiles } = memberIds.length
      ? await supabase.from("profiles").select("id, display_name, handicap").in("id", memberIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("user_id, status")
      .eq("tee_time_id", tt.id);

    const rsvpMap = new Map((rsvps ?? []).map((r) => [r.user_id, r.status]));
    const sections = { in: [] as any[], maybe: [] as any[], out: [] as any[], no_reply: [] as any[] };
    (members ?? []).forEach((m: any) => {
      const status = rsvpMap.get(m.user_id) ?? null;
      const profile = profileMap.get(m.user_id);
      const row = { userId: m.user_id, name: profile?.display_name ?? "Member", handicap: profile?.handicap };
      if (status === "in") sections.in.push(row);
      else if (status === "maybe") sections.maybe.push(row);
      else if (status === "out") sections.out.push(row);
      else sections.no_reply.push(row);
    });

    const { data: groupings } = await supabase
      .from("tee_time_groupings")
      .select("id, label, position, tee_time_grouping_players(user_id, position)")
      .eq("tee_time_id", tt.id)
      .order("position");

    const mNames = new Map((members ?? []).map((m: any) => [m.user_id, profileMap.get(m.user_id)?.display_name ?? "Member"]));
    const fourballs = (groupings ?? []).map((g: any) => ({
      id: g.id,
      label: g.label,
      players: (g.tee_time_grouping_players ?? [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((p: any) => ({ userId: p.user_id, name: mNames.get(p.user_id) ?? "Player" })),
    }));

    const { data: adminRow } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", tt.group_id)
      .eq("user_id", userId)
      .maybeSingle();

    const { data: closedRow } = await supabase
      .from("round_results")
      .select("id")
      .eq("tee_time_id", tt.id)
      .not("published_at", "is", null)
      .limit(1)
      .maybeSingle();

    const { data: holes } = await supabase
      .from("holes")
      .select("number, par, stroke_index, yards")
      .eq("tee_time_id", tt.id)
      .order("number");
    const scorecardMissing = (holes ?? []).length < 18;
    const scorecardHoles = scorecardMissing
      ? DEFAULT_HOLES.map((h) => ({ number: h.number, par: h.par, strokeIndex: h.strokeIndex, yards: null }))
      : (holes ?? []).map((h: any) => ({ number: h.number, par: h.par, strokeIndex: h.stroke_index ?? null, yards: h.yards ?? null }));

    const { data: savedScores } = await supabase
      .from("scores")
      .select("user_id, hole, strokes")
      .eq("tee_time_id", tt.id);
    const scoresByUser: Record<string, Record<number, number>> = {};
    (savedScores ?? []).forEach((s: any) => {
      scoresByUser[s.user_id] = scoresByUser[s.user_id] ?? {};
      if (s.strokes != null) scoresByUser[s.user_id][s.hole] = s.strokes;
    });

    return {
      teeTime: tt,
      sections,
      fourballs,
      holes: scorecardHoles,
      scoresByUser,
      scorecardMissing,
      myRsvp: rsvpMap.get(userId) ?? null,
      isAdmin: adminRow?.role === "admin",
      canEdit: tt.created_by === userId || adminRow?.role === "admin" || adminRow?.role === "coadmin",
      isClosed: !!closedRow,
    };
  });

export const setRsvp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teeTimeId: string; status: "in" | "out" | "maybe" }) =>
    z.object({ teeTimeId: z.string().uuid(), status: z.enum(["in", "out", "maybe"]) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("rsvps").upsert(
      { tee_time_id: data.teeTimeId, user_id: userId, status: data.status, updated_at: new Date().toISOString() },
      { onConflict: "tee_time_id,user_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const randomizeFourballs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teeTimeId: string; groupSize?: number }) =>
    z.object({ teeTimeId: z.string().uuid(), groupSize: z.number().int().min(2).max(5).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("randomize_fourballs", {
      _tee_time_id: data.teeTimeId,
      _group_size: data.groupSize ?? 4,
    });
    if (error) throw error;
    return { ok: true };
  });

// -------- SCORES --------

// Default 18-hole par-72 SI template
const DEFAULT_HOLES = [
  { number: 1, par: 4, strokeIndex: 7 },
  { number: 2, par: 4, strokeIndex: 13 },
  { number: 3, par: 3, strokeIndex: 15 },
  { number: 4, par: 5, strokeIndex: 1 },
  { number: 5, par: 4, strokeIndex: 11 },
  { number: 6, par: 4, strokeIndex: 5 },
  { number: 7, par: 3, strokeIndex: 17 },
  { number: 8, par: 4, strokeIndex: 3 },
  { number: 9, par: 5, strokeIndex: 9 },
  { number: 10, par: 4, strokeIndex: 8 },
  { number: 11, par: 4, strokeIndex: 14 },
  { number: 12, par: 3, strokeIndex: 16 },
  { number: 13, par: 5, strokeIndex: 2 },
  { number: 14, par: 4, strokeIndex: 12 },
  { number: 15, par: 4, strokeIndex: 6 },
  { number: 16, par: 3, strokeIndex: 18 },
  { number: 17, par: 4, strokeIndex: 4 },
  { number: 18, par: 5, strokeIndex: 10 },
];

async function ensureTeeTimeHoles(
  client: any,
  teeTimeId: string,
  holes: Array<{ number: number; par: number; strokeIndex?: number }> = DEFAULT_HOLES,
) {
  try {
    const { data: existing } = await client
      .from("holes")
      .select("number")
      .eq("tee_time_id", teeTimeId);
    if ((existing ?? []).length >= 18) return;
    await client.from("holes").delete().eq("tee_time_id", teeTimeId);
    await client.from("holes").insert(
      holes.map((h) => ({
        tee_time_id: teeTimeId,
        number: h.number,
        par: h.par,
        stroke_index: h.strokeIndex ?? null,
      })),
    );
  } catch {
    // Holes are optional — the scorecard page falls back to DEFAULT_HOLES when none
    // exist in the DB. Don't let a permission or network failure block navigation.
  }
}

const scoreSchema = z.object({
  teeTimeId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  holes: z.array(z.object({ number: z.number().int().min(1).max(18), par: z.number().int().min(3).max(6), strokeIndex: z.number().int().min(1).max(18).optional() })).length(18).optional(),
  myScores: z.array(z.object({ hole: z.number().int().min(1).max(18), strokes: z.number().int().min(1).max(20) })).max(18),
});

export const submitMyScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => scoreSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const scoredUserId = data.userId ?? userId;
    const { data: tt, error: ttError } = await supabase
      .from("tee_times")
      .select("*")
      .eq("id", data.teeTimeId)
      .single();
    if (ttError) throw ttError;
    const { data: member } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", tt.group_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) throw new Error("You must be a group member to score this round.");
    await ensureTeeTimeHoles(supabase, data.teeTimeId, data.holes && data.holes.length ? data.holes : DEFAULT_HOLES);

    const { data: holes } = await supabase
      .from("holes").select("number, par, stroke_index").eq("tee_time_id", data.teeTimeId).order("number");
    const holeMap = new Map((holes ?? []).map((h) => [h.number, h]));
    const { data: profile } = await supabase
      .from("profiles").select("handicap").eq("id", scoredUserId).single();

    // Convert handicap index to course handicap using tee box rating/slope if available.
    const hcpIndex = Number(profile?.handicap ?? 0);
    const hcp = (tt.slope_rating && tt.course_rating && tt.course_par)
      ? courseHandicap(hcpIndex, tt.slope_rating, tt.course_rating, tt.course_par)
      : Math.round(hcpIndex);

    const rows = data.myScores.map((s) => {
      const h = holeMap.get(s.hole);
      const par = h?.par ?? 4;
      const si = h?.stroke_index ?? 0;
      const received = strokesOnHole(hcp, si);
      const net = s.strokes - received;
      const diff = par - net;
      let pts = 0;
      if (diff >= 2) pts = 4 + (diff - 2);
      else if (diff === 1) pts = 3;
      else if (diff === 0) pts = 2;
      else if (diff === -1) pts = 1;
      return {
        tee_time_id: data.teeTimeId, user_id: scoredUserId, hole: s.hole,
        strokes: s.strokes, points: pts, updated_at: new Date().toISOString(),
      };
    });
    const { error } = await supabase
      .from("scores").upsert(rows, { onConflict: "tee_time_id,user_id,hole" });
    if (error) throw error;

    const gross = rows.reduce((a, r) => a + r.strokes, 0);
    const stbl = rows.reduce((a, r) => a + (r.points ?? 0), 0);
    const net = rows.reduce((a, r) => {
      const h = holeMap.get(r.hole);
      const si = h?.stroke_index ?? 0;
      return a + (r.strokes - strokesOnHole(hcp, si));
    }, 0);
    await supabase.from("round_results").upsert(
      {
        tee_time_id: data.teeTimeId, user_id: scoredUserId,
        game_format: tt?.format ?? "stableford",
        gross, net, stableford: stbl,
      },
      { onConflict: "tee_time_id,user_id" },
    );
    return { gross, net, stableford: stbl };
  });

export const sendReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teeTimeId: string }) => z.object({ teeTimeId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("send_reminder", { _tee_time_id: data.teeTimeId });
    if (error) throw error;
    return { ok: true };
  });

export const publishResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teeTimeId: string }) => z.object({ teeTimeId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: tt, error: ttError } = await supabase
      .from("tee_times")
      .select("group_id, created_by, format")
      .eq("id", data.teeTimeId)
      .single();
    if (ttError) throw ttError;
    const { data: member } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", tt.group_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (tt.created_by !== userId && member?.role !== "admin" && member?.role !== "coadmin") {
      throw new Error("Only the round creator or group staff can close this round.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("round_results")
      .update({ published_at: now, published_by: userId })
      .eq("tee_time_id", data.teeTimeId);
    if (error) throw error;

    const year = new Date().getFullYear();
    const { data: results, error: resultsError } = await supabaseAdmin
      .from("round_results")
      .select("user_id, gross, stableford")
      .eq("tee_time_id", data.teeTimeId);
    if (resultsError) throw resultsError;
    if (!results?.length) {
      const { error: markerError } = await supabaseAdmin.from("round_results").insert({
        tee_time_id: data.teeTimeId,
        user_id: userId,
        game_format: tt.format ?? "stableford",
        published_at: now,
        published_by: userId,
      });
      if (markerError) throw markerError;
      return { ok: true };
    }
    if (results?.length) {
      const { error: seasonError } = await supabaseAdmin.from("season_scores").upsert(
        results.map((r: any) => ({
          group_id: tt.group_id,
          user_id: r.user_id,
          tee_time_id: data.teeTimeId,
          season_year: year,
          points: r.stableford ?? 0,
          gross_score: r.gross ?? null,
          stableford_points: r.stableford ?? null,
        })),
        { onConflict: "tee_time_id,user_id" },
      );
      if (seasonError) throw seasonError;
    }
    return { ok: true };
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      groupId: z.string().uuid(),
      userId: z.string().uuid(),
      role: z.enum(["member", "coadmin"]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("set_member_role", {
      _group_id: data.groupId, _user_id: data.userId, _role: data.role,
    });
    if (error) throw error;
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ groupId: z.string().uuid(), userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    // Block removing the owner
    const { data: g } = await supabase
      .from("groups").select("owner_id").eq("id", data.groupId).single();
    if (g?.owner_id === data.userId) {
      throw new Error("Can't remove the group owner");
    }
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", data.groupId)
      .eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const rotateInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string }) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: code, error } = await context.supabase.rpc("rotate_invite_code", { _group_id: data.groupId });
    if (error) throw error;
    return { code: code as string };
  });

export const cancelJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { requestId: string }) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("group_join_requests")
      .delete()
      .eq("id", data.requestId)
      .eq("user_id", userId); // users can only cancel their own requests
    if (error) throw error;
    return { ok: true };
  });

export const listMyPendingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("group_join_requests")
      .select("id, status, created_at, group_id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.group_id)));
    const groupMap = new Map<string, { name: string; kicker: string | null }>();
    if (ids.length) {
      const { data: gs } = await supabase
        .from("groups").select("id, name, kicker").in("id", ids);
      for (const g of (gs ?? []) as any[]) groupMap.set(g.id, { name: g.name, kicker: g.kicker ?? null });
    }
    return (data ?? []).map((r: any) => ({
      id: r.id, groupId: r.group_id,
      groupName: groupMap.get(r.group_id)?.name ?? "Group",
      kicker: groupMap.get(r.group_id)?.kicker ?? null,
      createdAt: r.created_at,
    }));
  });


export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      displayName: z.string().min(1).max(80).optional(),
      handicap: z.number().min(-5).max(54).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patch: any = {};
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.handicap !== undefined) patch.handicap = data.handicap;
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("profiles").select("id, display_name, handicap, avatar_url").eq("id", userId).single();
    // is_app_owner is computed from the env var — no DB column required
    return { ...data, is_app_owner: checkIsOwner(context) };
  });


export const getRoundResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teeTimeId: string }) => z.object({ teeTimeId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: tt } = await supabase
      .from("tee_times")
      .select("*")
      .eq("id", data.teeTimeId)
      .single();
    const { data: holes } = await supabase
      .from("holes")
      .select("number, par, stroke_index")
      .eq("tee_time_id", data.teeTimeId)
      .order("number");
    const { data: scores } = await supabase
      .from("scores")
      .select("user_id, hole, strokes")
      .eq("tee_time_id", data.teeTimeId);
    const { data: groupings } = await supabase
      .from("tee_time_groupings")
      .select("id, tee_time_grouping_players(user_id)")
      .eq("tee_time_id", data.teeTimeId);

    const userIds = Array.from(new Set((scores ?? []).map((s) => s.user_id)));
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, display_name, handicap").in("id", userIds)
      : { data: [] as any[] };
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const teamByUser = new Map<string, string>();
    (groupings ?? []).forEach((g: any) =>
      (g.tee_time_grouping_players ?? []).forEach((p: any) => teamByUser.set(p.user_id, g.id)),
    );

    // Convert each player's handicap index to course handicap using tee box data if available.
    const hasTeeBox = (tt as any)?.slope_rating && (tt as any)?.course_rating && (tt as any)?.course_par;
    const players: PlayerRound[] = userIds.map((uid) => {
      const userScores = (scores ?? []).filter((s) => s.user_id === uid);
      const map: Record<number, number> = {};
      userScores.forEach((s) => { if (s.strokes != null) map[s.hole] = s.strokes; });
      const p = profMap.get(uid);
      const hcpIndex = Number(p?.handicap ?? 0);
      const chcp = hasTeeBox
        ? courseHandicap(hcpIndex, (tt as any).slope_rating, (tt as any).course_rating, (tt as any).course_par)
        : Math.round(hcpIndex);
      return {
        userId: uid,
        name: p?.display_name ?? "Player",
        handicap: chcp,
        teamId: teamByUser.get(uid),
        scores: map,
      };
    });

    const holeArr: Hole[] = (holes ?? []).map((h) => ({
      number: h.number,
      par: h.par,
      strokeIndex: h.stroke_index ?? undefined,
    }));

    const result = calculate({
      format: (tt?.format as GameFormat) ?? "stableford",
      holes: holeArr,
      players,
    });
    return { format: tt?.format ?? "stableford", ...result };
  });

// -------- LEADERBOARD --------

export const getLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string }) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const year = new Date().getFullYear();
    const { data: rows } = await supabase
      .from("season_scores")
      .select("user_id, points, tee_time_id, stableford_points")
      .eq("group_id", data.groupId)
      .eq("season_year", year);
    const agg = new Map<string, { points: number; rounds: number }>();
    (rows ?? []).forEach((r) => {
      const cur = agg.get(r.user_id) ?? { points: 0, rounds: 0 };
      cur.points += r.points ?? 0;
      cur.rounds += 1;
      agg.set(r.user_id, cur);
    });
    const ids = Array.from(agg.keys());
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, display_name, handicap").in("id", ids)
      : { data: [] as any[] };
    const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return Array.from(agg.entries())
      .map(([uid, v]) => ({
        userId: uid,
        name: profMap.get(uid)?.display_name ?? "Member",
        handicap: profMap.get(uid)?.handicap,
        ...v,
      }))
      .sort((a, b) => b.points - a.points);
  });

// -------- CHAT --------

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string }) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("messages")
      .select("id, body, created_at, user_id, kind, reply_to, reactions")
      .eq("group_id", data.groupId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as any[] };
    const names = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));
    return (rows ?? []).map((r) => ({ ...r, author: names.get(r.user_id) ?? "Member" }));
  });

export const postMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      groupId: z.string().uuid(),
      body: z.string().min(1).max(2000),
      kind: z.enum(["message", "announcement"]).optional(),
      replyTo: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("messages").insert({
      group_id: data.groupId,
      user_id: userId,
      body: data.body,
      kind: data.kind ?? "message",
      reply_to: data.replyTo ?? null,
    } as any);
    if (error) throw error;
    return { ok: true };
  });

export const toggleMute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; muted: boolean }) =>
    z.object({ groupId: z.string().uuid(), muted: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.muted) {
      await supabase.from("message_mutes").upsert({ group_id: data.groupId, user_id: userId });
    } else {
      await supabase.from("message_mutes").delete().eq("group_id", data.groupId).eq("user_id", userId);
    }
    return { ok: true };
  });

export const isMuted = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string }) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("message_mutes")
      .select("group_id")
      .eq("group_id", data.groupId)
      .eq("user_id", userId)
      .maybeSingle();
    return { muted: !!row };
  });

// -------- GROUP HOME --------

export const getGroupHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string }) => z.object({ groupId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: group, error } = await supabase
      .from("groups")
      .select("id, name, kicker, cover_url, invite_code")
      .eq("id", data.groupId)
      .single();
    if (error) throw error;

    const { data: membership } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", data.groupId)
      .eq("user_id", userId)
      .single();
    const isAdmin = membership?.role === "admin" || membership?.role === "coadmin";

    const now = new Date().toISOString();
    const [{ data: next }, { data: trips }, { count: memberCount }, { data: lastMsg }, { data: lastAnnouncement }] = await Promise.all([
      supabase
        .from("tee_times")
        .select("id, course_name, tee_at, format, spots")
        .eq("group_id", data.groupId)
        .gte("tee_at", now)
        .order("tee_at", { ascending: true })
        .limit(1),
      supabase
        .from("trips")
        .select("id, name, destination, start_date, end_date")
        .gte("end_date", new Date().toISOString().slice(0, 10))
        .order("start_date", { ascending: true })
        .limit(1),
      supabase
        .from("group_members")
        .select("user_id", { count: "exact", head: true })
        .eq("group_id", data.groupId),
      supabase
        .from("messages")
        .select("id, body, kind, created_at, user_id, profiles:user_id(display_name)")
        .eq("group_id", data.groupId)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("messages")
        .select("id, body, created_at, user_id, profiles:user_id(display_name)")
        .eq("group_id", data.groupId)
        .eq("kind", "announcement")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const rsvpCounts = { in: 0, maybe: 0, out: 0 };
    if (next?.[0]) {
      const { data: rsvps } = await supabase
        .from("rsvps").select("status").eq("tee_time_id", next[0].id);
      for (const r of rsvps ?? []) {
        if (r.status === "in") rsvpCounts.in++;
        else if (r.status === "maybe") rsvpCounts.maybe++;
        else if (r.status === "out") rsvpCounts.out++;
      }
    }

    const year = new Date().getUTCFullYear();
    const { data: seasonRows } = await supabase
      .from("season_scores")
      .select("user_id, points, profiles:user_id(display_name)")
      .eq("group_id", data.groupId)
      .eq("season_year", year);
    const totals = new Map<string, { name: string; points: number }>();
    for (const r of (seasonRows ?? []) as any[]) {
      const cur = totals.get(r.user_id) ?? { name: r.profiles?.display_name ?? "Player", points: 0 };
      cur.points += r.points ?? 0;
      totals.set(r.user_id, cur);
    }
    const leaderboardTop3 = [...totals.entries()]
      .map(([uid, v]) => ({ userId: uid, name: v.name, points: v.points }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 3);

    const { data: pendingRequests } = isAdmin
      ? await supabase
          .from("group_join_requests")
          .select("id")
          .eq("group_id", data.groupId)
          .eq("status", "pending")
      : { data: [] as any[] };

    return {
      group: { ...group, isAdmin },
      nextTeeTime: next?.[0] ?? null,
      nextTrip: trips?.[0] ?? null,
      pendingApprovals: pendingRequests?.length ?? 0,
      memberCount: memberCount ?? 0,
      rsvpCounts,
      leaderboardTop3,
      latestMessage: lastMsg?.[0]
        ? {
            id: (lastMsg[0] as any).id,
            body: (lastMsg[0] as any).body,
            kind: (lastMsg[0] as any).kind,
            createdAt: (lastMsg[0] as any).created_at,
            authorName: (lastMsg[0] as any).profiles?.display_name ?? "Member",
          }
        : null,
      latestAnnouncement: lastAnnouncement?.[0]
        ? {
            id: (lastAnnouncement[0] as any).id,
            body: (lastAnnouncement[0] as any).body,
            createdAt: (lastAnnouncement[0] as any).created_at,
            authorName: (lastAnnouncement[0] as any).profiles?.display_name ?? "Admin",
          }
        : null,
    };
  });

export const listUpcomingAcrossGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships } = await supabase
      .from("group_members").select("group_id").eq("user_id", userId);
    const ids = (memberships ?? []).map((m: any) => m.group_id);
    if (ids.length === 0) return [];
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("tee_times")
      .select("id, course_name, tee_at, format, group_id, groups:group_id(name)")
      .in("group_id", ids)
      .gte("tee_at", now)
      .order("tee_at", { ascending: true })
      .limit(5);
    if (error) throw error;
    return (data ?? []).map((t: any) => ({
      id: t.id, courseName: t.course_name, teeAt: t.tee_at, format: t.format,
      groupId: t.group_id, groupName: t.groups?.name ?? "Group",
    }));
  });

// ─── Trips: global catalog owned by the app owner (Auri Adventures) ──────────
// All authenticated users see the same trip catalog. Only the account marked
// is_app_owner=true in profiles can create / edit / delete trips.

export const listTrips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Try to query global trips first (requires is_global migration).
    // Fall back to all trips the user can see if the column doesn't exist yet.
    // Use select("*") so missing columns from pending migrations don't cause errors.
    let rows: any[] | null = null;
    const globalResult = await supabase
      .from("trips")
      .select("*")
      .eq("is_global" as any, true)
      .order("start_date", { ascending: true });
    if (!globalResult.error) {
      rows = globalResult.data;
    } else {
      const fallback = await supabase
        .from("trips")
        .select("*")
        .order("start_date", { ascending: true });
      rows = fallback.data ?? [];
    }
    if (!rows?.length) return [];
    const tripIds = rows.map((r) => r.id);
    const { data: members } = await supabase
      .from("trip_members").select("trip_id, user_id, status").in("trip_id", tripIds);
    const interestMap = new Map<string, number>();
    const myStatusMap = new Map<string, string>();
    (members ?? []).forEach((m: any) => {
      if (m.status !== "out") interestMap.set(m.trip_id, (interestMap.get(m.trip_id) ?? 0) + 1);
      if (m.user_id === userId) myStatusMap.set(m.trip_id, m.status);
    });
    return rows.map((r) => ({
      ...r,
      interestedCount: interestMap.get(r.id) ?? 0,
      myStatus: myStatusMap.get(r.id) ?? null,
    }));
  });

export const getTrip = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tripId: string }) => z.object({ tripId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: trip, error } = await supabase
      .from("trips").select("*").eq("id", data.tripId).single();
    if (error) throw error;
    const isAdmin = checkIsOwner(context);
    const { data: members } = await supabase
      .from("trip_members")
      .select("user_id, status, note, created_at, profiles:user_id(display_name, avatar_url)")
      .eq("trip_id", data.tripId)
      .order("created_at", { ascending: true });
    const myMember = (members ?? []).find((m: any) => m.user_id === userId);
    return {
      trip,
      isAdmin,
      myStatus: myMember?.status ?? null,
      myNote: myMember?.note ?? "",
      members: (members ?? [])
        .filter((m: any) => m.status !== "out")
        .map((m: any) => ({
          userId: m.user_id,
          status: m.status,
          note: m.note ?? "",
          name: (m.profiles as any)?.display_name ?? "Member",
        })),
    };
  });

export const createTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      name: z.string().min(2).max(120),
      destination: z.string().min(2).max(120),
      startDate: z.string(),
      endDate: z.string(),
      cost: z.number().min(0).optional(),
      maxSpots: z.number().int().min(1).max(200).optional(),
      bookingDeadline: z.string().optional(),
      coverUrl: z.string().url().optional(),
      notes: z.string().max(2000).optional(),
      inclusions: z.string().max(2000).optional(),
      highlights: z.array(z.string().max(200)).max(20).optional(),
      golfCourses: z.string().max(500).optional(),
      agencyContact: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (!checkIsOwner(context)) throw new Error("Only the app owner can create trips.");
    const { data: trip, error } = await supabase
      .from("trips")
      .insert({
        name: data.name,
        destination: data.destination,
        start_date: data.startDate,
        end_date: data.endDate,
        cost: data.cost ?? null,
        max_spots: data.maxSpots ?? 20,
        booking_deadline: data.bookingDeadline ?? null,
        cover_url: data.coverUrl ?? null,
        notes: data.notes ?? null,
        inclusions: data.inclusions ?? null,
        highlights: data.highlights ?? [],
        itinerary: [],
        golf_courses: data.golfCourses ?? null,
        agency_contact: data.agencyContact ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return trip;
  });

export const updateTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      tripId: z.string().uuid(),
      name: z.string().min(2).max(120).optional(),
      destination: z.string().min(2).max(120).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      cost: z.number().min(0).optional(),
      maxSpots: z.number().int().min(1).max(200).optional(),
      bookingDeadline: z.string().optional(),
      coverUrl: z.string().url().optional(),
      notes: z.string().max(2000).optional(),
      inclusions: z.string().max(2000).optional(),
      highlights: z.array(z.string().max(200)).max(20).optional(),
      golfCourses: z.string().max(500).optional(),
      agencyContact: z.string().max(200).optional(),
      status: z.enum(["open", "closed", "confirmed", "cancelled"]).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    if (!checkIsOwner(context)) throw new Error("Only the app owner can edit trips.");
    const patch: any = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.destination !== undefined) patch.destination = data.destination;
    if (data.startDate !== undefined) patch.start_date = data.startDate;
    if (data.endDate !== undefined) patch.end_date = data.endDate;
    if (data.cost !== undefined) patch.cost = data.cost;
    if (data.maxSpots !== undefined) patch.max_spots = data.maxSpots;
    if (data.bookingDeadline !== undefined) patch.booking_deadline = data.bookingDeadline;
    if (data.coverUrl !== undefined) patch.cover_url = data.coverUrl;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.inclusions !== undefined) patch.inclusions = data.inclusions;
    if (data.highlights !== undefined) patch.highlights = data.highlights;
    if (data.golfCourses !== undefined) patch.golf_courses = data.golfCourses;
    if (data.agencyContact !== undefined) patch.agency_contact = data.agencyContact;
    if (data.status !== undefined) patch.status = data.status;
    const { error } = await supabase.from("trips").update(patch).eq("id", data.tripId);
    if (error) throw error;
    return { ok: true };
  });

export const expressInterest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ tripId: z.string().uuid(), note: z.string().max(300).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: trip } = await supabase
      .from("trips").select("status").eq("id", data.tripId).single();
    if (!trip) throw new Error("Trip not found.");
    if ((trip as any).status === "closed" || (trip as any).status === "cancelled") {
      throw new Error("This trip is no longer accepting interest.");
    }
    const { error } = await supabase.from("trip_members").upsert(
      { trip_id: data.tripId, user_id: userId, status: "maybe", note: data.note ?? null },
      { onConflict: "trip_id,user_id" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const withdrawInterest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ tripId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("trip_members").update({ status: "out" })
      .eq("trip_id", data.tripId).eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const confirmTripMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({ tripId: z.string().uuid(), memberId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    if (!checkIsOwner(context)) throw new Error("Only the app owner can confirm trip members.");
    const { error } = await supabase
      .from("trip_members").update({ status: "in" })
      .eq("trip_id", data.tripId).eq("user_id", data.memberId);
    if (error) throw error;
    return { ok: true };
  });

// -------- COURSE SEARCH (OpenStreetMap) --------

export const searchCourses = createServerFn({ method: "POST" })
  .inputValidator((d: any) =>
    z.object({
      query: z.string().max(120).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      radiusKm: z.number().min(1).max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const headers = { "User-Agent": "FairwayClub/1.0 (lovable.app)" };

    // Nearby mode: Overpass API around lat/lng
    if (data.lat != null && data.lng != null) {
      const radius = Math.round((data.radiusKm ?? 40) * 1000);
      const nameFilter = data.query ? `["name"~"${data.query.replace(/["\\]/g, "")}",i]` : "";
      const ql = `[out:json][timeout:15];nwr["leisure"="golf_course"]${nameFilter}(around:${radius},${data.lat},${data.lng});out center 25;`;
      try {
        const res = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(ql),
        });
        if (!res.ok) return { results: [], error: `Overpass ${res.status}` };
        const j: any = await res.json();
        const seen = new Set<string>();
        const results = (j.elements ?? [])
          .map((el: any) => {
            const name = el.tags?.name ?? "Unnamed course";
            const lat = el.lat ?? el.center?.lat;
            const lon = el.lon ?? el.center?.lon;
            const place = [el.tags?.["addr:city"], el.tags?.["addr:country"]].filter(Boolean).join(", ");
            return { id: `${el.type}/${el.id}`, name, lat, lng: lon, place };
          })
          .filter((r: any) => r.lat && r.lng && !seen.has(r.name) && seen.add(r.name));
        return { results: results.slice(0, 20), error: null as string | null };
      } catch (e: any) {
        return { results: [], error: "Course search unavailable" };
      }
    }

    // Search-by-name mode: Nominatim
    if (data.query && data.query.length >= 2) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=15&q=${encodeURIComponent(data.query + " golf course")}`;
        const res = await fetch(url, { headers });
        if (!res.ok) return { results: [], error: `Nominatim ${res.status}` };
        const j: any = await res.json();
        const results = j
          .filter((r: any) => /golf/i.test(r.display_name) || r.class === "leisure")
          .map((r: any) => ({
            id: `${r.osm_type}/${r.osm_id}`,
            name: r.display_name.split(",")[0],
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
            place: r.display_name.split(",").slice(1, 3).join(",").trim(),
          }));
        return { results: results.slice(0, 15), error: null as string | null };
      } catch (e: any) {
        return { results: [], error: "Course search unavailable" };
      }
    }

    return { results: [], error: null as string | null };
  });

// -------- SCORECARD OCR (Lovable AI) --------

export const parseScorecardImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      imageBase64: z.string().min(100).max(8_000_000),
      mimeType: z.string().regex(/^image\/(png|jpe?g|webp|heic)$/i),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { holes: [], error: "AI gateway not configured" };
    const dataUrl = `data:${data.mimeType};base64,${data.imageBase64}`;
    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Extract golf scorecard data. Return EXACTLY 18 holes with par (3-6) and stroke index (1-18, unique per hole). If only 9 holes are visible, repeat reasonable values for holes 10-18. Use null if uncertain.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this scorecard and extract par and stroke index for each of the 18 holes." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_scorecard",
            description: "Return parsed scorecard holes.",
            parameters: {
              type: "object",
              properties: {
                holes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      number: { type: "number" },
                      par: { type: "number" },
                      strokeIndex: { type: "number" },
                    },
                    required: ["number", "par", "strokeIndex"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["holes"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_scorecard" } },
    };
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429) return { holes: [], error: "Rate limit exceeded, please try again later." };
      if (res.status === 402) return { holes: [], error: "AI credits exhausted. Add credits in workspace settings." };
      if (!res.ok) return { holes: [], error: `AI gateway error (${res.status})` };
      const j: any = await res.json();
      const call = j.choices?.[0]?.message?.tool_calls?.[0];
      if (!call) return { holes: [], error: "No data extracted" };
      const parsed = JSON.parse(call.function.arguments);
      return { holes: parsed.holes as Array<{ number: number; par: number; strokeIndex: number }>, error: null as string | null };
    } catch (e: any) {
      return { holes: [], error: e.message ?? "Parse failed" };
    }
  });

export const setTeeTimeHoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) =>
    z.object({
      teeTimeId: z.string().uuid(),
      holes: z.array(z.object({
        number: z.number().int().min(1).max(18),
        par: z.number().int().min(3).max(6),
        strokeIndex: z.number().int().min(1).max(18),
      })).length(18),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: tt, error: ttError } = await supabase
      .from("tee_times")
      .select("group_id, created_by")
      .eq("id", data.teeTimeId)
      .single();
    if (ttError) throw ttError;
    const { data: member } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", tt.group_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (tt.created_by !== userId && member?.role !== "admin" && member?.role !== "coadmin") {
      throw new Error("Only the round creator or group staff can update the scorecard.");
    }
    await supabase.from("holes").delete().eq("tee_time_id", data.teeTimeId);
    const { error } = await supabase.from("holes").insert(
      data.holes.map((h) => ({
        tee_time_id: data.teeTimeId, number: h.number, par: h.par, stroke_index: h.strokeIndex,
      })),
    );
    if (error) throw error;
    return { ok: true };
  });

export const getMyStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: ss } = await supabase
      .from("season_scores")
      .select("points, gross_score, stableford_points, position, season_year, tee_time_id, group_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    const rows = ss ?? [];
    const ttIds = Array.from(new Set(rows.map((r: any) => r.tee_time_id).filter(Boolean)));
    const ttMap = new Map<string, any>();
    if (ttIds.length) {
      const { data: tts } = await supabase
        .from("tee_times").select("id, course_name, tee_at, format, group_id, groups:group_id(name)")
        .in("id", ttIds);
      (tts ?? []).forEach((t: any) => ttMap.set(t.id, t));
    }
    const grosses = rows.map((r: any) => r.gross_score).filter((g: any) => typeof g === "number" && g > 0);
    const stbls = rows.map((r: any) => r.stableford_points).filter((s: any) => typeof s === "number");
    const wins = rows.filter((r: any) => r.position === 1).length;
    const top3 = rows.filter((r: any) => r.position && r.position <= 3).length;
    const formatCounts: Record<string, number> = {};
    rows.forEach((r: any) => {
      const f = ttMap.get(r.tee_time_id)?.format ?? "unknown";
      formatCounts[f] = (formatCounts[f] ?? 0) + 1;
    });
    return {
      roundsPlayed: rows.length,
      avgGross: grosses.length ? Math.round((grosses.reduce((a: number, b: number) => a + b, 0) / grosses.length) * 10) / 10 : null,
      bestGross: grosses.length ? Math.min(...grosses) : null,
      avgStableford: stbls.length ? Math.round((stbls.reduce((a: number, b: number) => a + b, 0) / stbls.length) * 10) / 10 : null,
      bestStableford: stbls.length ? Math.max(...stbls) : null,
      totalPoints: rows.reduce((a: number, r: any) => a + (r.points ?? 0), 0),
      wins, top3,
      formatCounts,
      recent: rows.slice(0, 8).map((r: any) => {
        const tt = ttMap.get(r.tee_time_id);
        return {
          teeTimeId: r.tee_time_id,
          groupId: r.group_id,
          courseName: tt?.course_name ?? "Round",
          teeAt: tt?.tee_at ?? null,
          format: tt?.format ?? null,
          groupName: tt?.groups?.name ?? null,
          gross: r.gross_score, stableford: r.stableford_points, position: r.position, points: r.points,
        };
      }),
    };
  });

// -------- TEE BOX DETAILS --------

export const setTeeBoxDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { teeTimeId: string; teeBoxName: string; courseRating: number; slopeRating: number; coursePar: number }) =>
    z.object({
      teeTimeId: z.string().uuid(),
      teeBoxName: z.string().min(1).max(40),
      courseRating: z.number().min(50).max(90),
      slopeRating: z.number().int().min(55).max(155),
      coursePar: z.number().int().min(27).max(90),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: tt, error: ttErr } = await supabase
      .from("tee_times")
      .select("group_id, created_by")
      .eq("id", data.teeTimeId)
      .single();
    if (ttErr) throw ttErr;
    const { data: member } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", tt.group_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (tt.created_by !== userId && member?.role !== "admin" && member?.role !== "coadmin") {
      throw new Error("Only the round creator or group staff can update tee box details.");
    }
    const { error } = await supabase
      .from("tee_times")
      .update({
        tee_box_name: data.teeBoxName,
        course_rating: data.courseRating,
        slope_rating: data.slopeRating,
        course_par: data.coursePar,
      })
      .eq("id", data.teeTimeId);
    if (error) {
      // These columns are added by a migration. If they don't exist yet the tee box
      // can still be selected locally for handicap calculation — it just won't persist.
      if (error.message?.includes("column") || error.code === "42703") {
        return { ok: true, persisted: false };
      }
      throw error;
    }
    return { ok: true, persisted: true };
  });

// -------- GROUP DISCOVERY --------

export const searchGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { query?: string }) =>
    z.object({ query: z.string().max(100).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("search_groups", {
      _query: data.query ?? null,
      _limit: 30,
    });
    if (error) throw error;
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
      kicker: (r.kicker ?? null) as string | null,
      description: (r.description ?? null) as string | null,
      isPublic: Boolean(r.is_public),
      location: (r.location ?? null) as string | null,
      memberCount: Number(r.member_count ?? 0),
      userIsMember: Boolean(r.user_is_member),
      hasPendingRequest: Boolean(r.has_pending_req),
    }));
  });

export const requestJoinGroupById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; note?: string }) =>
    z.object({ groupId: z.string().uuid(), note: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("request_join_by_id", {
      _group_id: data.groupId,
      _note: data.note ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

export const updateGroupVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { groupId: string; isPublic: boolean; location?: string }) =>
    z.object({
      groupId: z.string().uuid(),
      isPublic: z.boolean(),
      location: z.string().max(100).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("update_group_visibility", {
      _group_id: data.groupId,
      _is_public: data.isPublic,
      _location: data.location ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });
