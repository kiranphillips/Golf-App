import { createFileRoute, redirect, Link, useNavigate, useLocation, Outlet } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { getTeeTime, setRsvp, startScheduledRound, randomizeFourballs, sendReminder, getRoundResults, updateTeeTime, nudgeTeeTime, deleteTeeTime, publishResults } from "@/lib/api.functions";
import { fmtDateLong, fmtTime, initialsFrom } from "@/lib/format";
import { FORMAT_LABELS, type GameFormat } from "@/lib/scoring";
import { toast } from "sonner";
import { ChevronLeft, Shuffle, Bell, Pencil, Trophy, BellRing, Play, Trash2, CheckCircle2 } from "lucide-react";

const q = (tid: string) => queryOptions({
  queryKey: ["tee-time", tid], queryFn: () => getTeeTime({ data: { teeTimeId: tid } }),
});
const resultsQ = (tid: string) => queryOptions({
  queryKey: ["round-results", tid], queryFn: () => getRoundResults({ data: { teeTimeId: tid } }),
});

export const Route = createFileRoute("/groups/$gid/tee-times/$tid")({
  head: () => ({ meta: [{ title: "Tee Time — Fairway Club" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  loader: ({ context, params }: { context: any; params: { tid: string } }) =>
    context.queryClient.ensureQueryData(q(params.tid)),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

function Page() {
  const { gid, tid } = Route.useParams();
  const location = useLocation();
  const { data } = useSuspenseQuery(q(tid));
  const tt = data.teeTime;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const rsvp = useServerFn(setRsvp);
  const startScheduledRoundFn = useServerFn(startScheduledRound);
  const rand = useServerFn(randomizeFourballs);
  const remind = useServerFn(sendReminder);
  const nudge = useServerFn(nudgeTeeTime);
  const del = useServerFn(deleteTeeTime);
  const close = useServerFn(publishResults);
  const [editing, setEditing] = useState(() => new URLSearchParams(location.searchStr).get("edit") === "1");
  const [nudgeBusy, setNudgeBusy] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(location.searchStr ?? "").get("edit") === "1") setEditing(true);
  }, [location.searchStr]);

  if (location.pathname.endsWith("/scorecard")) return <Outlet />;

  const choose = async (status: "in" | "maybe" | "out") => {
    try {
      await rsvp({ data: { teeTimeId: tid, status } });
      qc.invalidateQueries({ queryKey: ["tee-time", tid] });
    } catch (err: any) { toast.error(err.message); }
  };

  const sendNudge = async () => {
    setNudgeBusy(true);
    try {
      await nudge({ data: { teeTimeId: tid } });
      toast.success("Nudge posted to chat");
    } catch (e: any) { toast.error(e.message); }
    finally { setNudgeBusy(false); }
  };

  const isStaff = data.isAdmin;
  const canEdit = data.canEdit;

  const doDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this tee time?")) return;
    setDelBusy(true);
    try {
      await del({ data: { teeTimeId: tid } });
      toast.success("Tee time deleted");
      qc.invalidateQueries({ queryKey: ["tee-times", gid] });
      navigate({ to: "/groups/$gid/tee-times" as any, params: { gid } as any });
    } catch (e: any) { toast.error(e.message ?? "Couldn't delete"); }
    finally { setDelBusy(false); }
  };

  const doClose = async () => {
    if (!window.confirm("Are you sure you want to close this round? Scores will be saved.")) return;
    setCloseBusy(true);
    try {
      await close({ data: { teeTimeId: tid } });
      toast.success("Round closed · results saved");
      qc.invalidateQueries({ queryKey: ["round-results", tid] });
    } catch (e: any) { toast.error(e.message ?? "Couldn't close round"); }
    finally { setCloseBusy(false); }
  };

  const startRound = async () => {
    try {
      const res = await startScheduledRoundFn({ data: { teeTimeId: tid } });
      // Use the ID returned by the server — startScheduledRound may create a new
      // round record whose ID differs from the scheduled tee time's ID.
      const scorecardTid = (res as any)?.id ?? tid;
      qc.invalidateQueries({ queryKey: ["tee-time", tid] });
      qc.invalidateQueries({ queryKey: ["tee-time", scorecardTid] });
      qc.invalidateQueries({ queryKey: ["tee-times", gid] });
      navigate({ to: "/groups/$gid/tee-times/$tid/scorecard" as any, params: { gid, tid: scorecardTid } as any });
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't open scorecard");
    }
  };

  return (
    <MobileShell groupId={gid} hideHeader>
      <header className="px-6 pt-12 pb-6 bg-forest text-cream relative">
        <Link to={"/groups/$gid/tee-times" as any} params={{ gid } as any} className="absolute top-12 left-6 text-cream/70">
          <ChevronLeft className="size-5" />
        </Link>
        {canEdit && (
          <button onClick={() => setEditing((v) => !v)} className="absolute top-12 right-6 text-cream/80 flex items-center gap-1 text-[11px] font-bold uppercase tracking-club">
            <Pencil className="size-3.5" /> {editing ? "Close" : "Edit"}
          </button>
        )}
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-club text-gold mb-2">{FORMAT_LABELS[tt.format as GameFormat] ?? tt.format}</p>
          <h1 className="font-display text-2xl leading-tight">{tt.course_name}</h1>
          <p className="text-cream/70 text-sm mt-2">{fmtDateLong(tt.tee_at, (tt as any).timezone)} · {fmtTime(tt.tee_at, (tt as any).timezone)}</p>
        </div>
      </header>

      {editing && canEdit && (
        <EditForm tid={tid} initial={tt} onDone={() => { setEditing(false); qc.invalidateQueries({ queryKey: ["tee-time", tid] }); qc.invalidateQueries({ queryKey: ["tee-times", gid] }); navigate({ to: "/groups/$gid/tee-times" as any, params: { gid } as any }); }} />
      )}

      <section className="px-6 -mt-6">
        <div className="bg-white rounded-2xl p-5 shadow-card border border-black/5">
          <p className="text-[10px] uppercase tracking-club text-muted-foreground mb-3 text-center">Will you be playing?</p>
          <div className="grid grid-cols-3 gap-3">
            {(["in","maybe","out"] as const).map((s) => (
              <button key={s} onClick={() => choose(s)}
                className={`py-3 rounded-lg text-xs font-bold tracking-wide uppercase ${data.myRsvp === s ? "bg-forest text-cream" : "border border-border text-muted-foreground"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 mt-4">
        <button
          onClick={sendNudge}
          disabled={nudgeBusy}
          className="w-full flex items-center justify-center gap-2 bg-gold text-charcoal rounded-xl py-3 text-[11px] font-bold uppercase tracking-wider disabled:opacity-60"
        >
          <BellRing className="size-4" /> {nudgeBusy ? "Posting to chat…" : "Nudge group (posts to chat)"}
        </button>
      </section>

      {isStaff && (
        <section className="px-6 mt-3 grid grid-cols-2 gap-3">
          <button
            onClick={async () => { try { await rand({ data: { teeTimeId: tid } }); qc.invalidateQueries({ queryKey: ["tee-time", tid] }); toast.success("Fourballs randomized"); } catch (e: any) { toast.error(e.message); } }}
            className="flex items-center justify-center gap-2 bg-charcoal text-cream rounded-xl py-3 text-[11px] font-bold uppercase tracking-wider">
            <Shuffle className="size-4" /> Randomize
          </button>
          <button
            onClick={async () => { try { await remind({ data: { teeTimeId: tid } }); toast.success("Reminder sent"); } catch (e: any) { toast.error(e.message); } }}
            className="flex items-center justify-center gap-2 bg-paper border border-border rounded-xl py-3 text-[11px] font-bold uppercase tracking-wider">
            <Bell className="size-4" /> Staff remind
          </button>
        </section>
      )}

      <section className="px-6 mt-6 space-y-5">
        <Group title="In" list={data.sections.in} tone="forest" />
        <Group title="Maybe" list={data.sections.maybe} tone="muted" />
        <Group title="Out" list={data.sections.out} tone="muted" />
        <Group title="No reply" list={data.sections.no_reply} tone="muted" />
      </section>


      {data.fourballs.length > 0 && (
        <section className="px-6 mt-8">
          <h3 className="text-[10px] uppercase tracking-club text-muted-foreground mb-3">Fourballs</h3>
          <div className="space-y-3">
            {data.fourballs.map((fb: any) => (
              <div key={fb.id} className="bg-white rounded-xl border border-border p-4">
                <p className="text-[10px] uppercase tracking-club text-gold font-bold mb-2">{fb.label}</p>
                <ul className="text-sm space-y-1">
                  {fb.players.map((p: any) => <li key={p.userId}>· {p.name}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <RoundResults tid={tid} />

      <section className="px-6 mt-6 mb-8 space-y-2">
        <button onClick={startRound}
          className="w-full flex items-center justify-center gap-2 bg-forest text-cream py-3 rounded-full text-xs font-bold uppercase tracking-club">
          <Play className="size-4" /> Start Round
        </button>
        {canEdit && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setEditing((v) => !v)}
              className="flex items-center justify-center gap-2 bg-paper border border-border py-3 rounded-full text-[11px] font-bold uppercase tracking-club">
              <Pencil className="size-4" /> {editing ? "Close edit" : "Edit tee time"}
            </button>
            <button onClick={doDelete} disabled={delBusy}
              className="flex items-center justify-center gap-2 bg-destructive/10 text-destructive border border-destructive/30 py-3 rounded-full text-[11px] font-bold uppercase tracking-club disabled:opacity-60">
              <Trash2 className="size-4" /> {delBusy ? "Deleting…" : "Delete Tee Time"}
            </button>
          </div>
        )}
        {canEdit && (
          <button onClick={doClose} disabled={closeBusy}
            className="w-full flex items-center justify-center gap-2 bg-gold text-charcoal py-3 rounded-full text-[11px] font-bold uppercase tracking-club disabled:opacity-60">
            <CheckCircle2 className="size-4" /> {closeBusy ? "Closing…" : "Close Round"}
          </button>
        )}
      </section>

    </MobileShell>
  );
}

function Group({ title, list, tone }: { title: string; list: any[]; tone: "forest" | "muted" }) {
  if (!list?.length) return null;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <h3 className={`text-[10px] uppercase tracking-club font-bold ${tone === "forest" ? "text-forest" : "text-muted-foreground"}`}>{title}</h3>
        <span className="text-[10px] text-muted-foreground tabular-nums">{list.length}</span>
      </div>
      <div className="space-y-2">
        {list.map((m) => (
          <div key={m.userId} className="flex items-center gap-3 bg-white rounded-xl border border-border px-3 py-2.5">
            <div className={`size-9 rounded-full grid place-items-center text-[11px] font-semibold ${tone === "forest" ? "bg-forest text-cream" : "bg-paper text-charcoal border border-border"}`}>
              {initialsFrom(m.name)}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{m.name}</p>
              {m.handicap != null && <p className="text-[10px] text-muted-foreground">HCP {m.handicap}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoundResults({ tid }: { tid: string }) {
  const { data, isLoading, error } = useQuery(resultsQ(tid));
  if (isLoading) return null;
  if (error) return null;
  if (!data || !data.perPlayer?.some((p: any) => p.gross != null)) return null;
  const fmt = (data.format as GameFormat) ?? "stableford";
  const ranked = [...data.perPlayer].filter((p: any) => p.gross != null)
    .sort((a: any, b: any) => {
      if (fmt === "stroke") return (a.net ?? 0) - (b.net ?? 0);
      return (b.stableford ?? 0) - (a.stableford ?? 0);
    });

  return (
    <section className="px-6 mt-8">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="size-4 text-gold" />
        <h3 className="text-[10px] uppercase tracking-club text-muted-foreground font-bold">
          Live results · {FORMAT_LABELS[fmt] ?? fmt}
        </h3>
      </div>

      <div className="bg-white rounded-2xl border border-border divide-y">
        {ranked.map((p: any, i: number) => (
          <div key={p.userId} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-6 text-center text-xs font-bold text-gold tabular-nums">{i + 1}</span>
            <span className="flex-1 text-sm font-semibold truncate">{p.name}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {p.gross != null && `G ${p.gross}`} {p.net != null && `· N ${p.net}`} {p.stableford != null && `· S ${p.stableford}`}
            </span>
          </div>
        ))}
      </div>

      {data.perTeam && data.perTeam.length > 0 && (
        <div className="mt-3 bg-white rounded-2xl border border-border divide-y">
          <p className="px-4 py-2 text-[10px] uppercase tracking-club text-muted-foreground font-bold">Teams</p>
          {[...data.perTeam].sort((a: any, b: any) => fmt === "four_ball_alliance" ? b.total - a.total : a.total - b.total).map((t: any, i: number) => (
            <div key={t.teamId} className="flex items-center px-4 py-2.5 gap-3">
              <span className="w-6 text-center text-xs font-bold text-gold tabular-nums">{i + 1}</span>
              <span className="flex-1 text-sm">Team {t.teamId.slice(0, 4)}</span>
              <span className="text-sm font-bold tabular-nums">{t.total}</span>
            </div>
          ))}
        </div>
      )}

      {data.skins && data.skins.some((s: any) => s.winnerUserId) && (
        <div className="mt-3 bg-white rounded-2xl border border-border p-3">
          <p className="text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-2">Skins</p>
          <div className="grid grid-cols-6 gap-1 text-center text-[10px]">
            {data.skins.map((s: any) => {
              const winner = s.winnerUserId ? data.perPlayer.find((p: any) => p.userId === s.winnerUserId)?.name : null;
              return (
                <div key={s.hole} className={`rounded-md p-1.5 ${winner ? "bg-forest text-cream" : "bg-paper text-muted-foreground"}`}>
                  <p className="text-[9px] opacity-70">H{s.hole}</p>
                  <p className="text-[10px] font-bold truncate">{winner ? winner.split(" ")[0] : "—"}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.matchPlay && data.matchPlay.length > 0 && (
        <div className="mt-3 bg-white rounded-2xl border border-border divide-y">
          <p className="px-4 py-2 text-[10px] uppercase tracking-club text-muted-foreground font-bold">Match play</p>
          {data.matchPlay.map((m: any, i: number) => {
            const aName = data.perPlayer.find((p: any) => p.userId === m.a)?.name ?? "A";
            const bName = data.perPlayer.find((p: any) => p.userId === m.b)?.name ?? "B";
            const status = m.result === "halved" ? `All square thru ${m.thru}`
              : `${m.result === "a" ? aName : bName} ${m.up} UP thru ${m.thru}`;
            return (
              <div key={i} className="px-4 py-2.5 text-sm">
                <p className="font-semibold">{aName} vs {bName}</p>
                <p className="text-[11px] text-muted-foreground">{status}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function toLocalInputValue(iso: string) {
  // Use UTC getters so the edit form shows the same time as fmtTime/fmtDateLong
  // (which both force timeZone: "UTC"). Without this, users in non-UTC timezones
  // see a different time in the edit form vs the display.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function EditForm({ tid, initial, onDone }: { tid: string; initial: any; onDone: () => void }) {
  const [courseName, setCourseName] = useState(initial.course_name as string);
  const [teeAt, setTeeAt] = useState(toLocalInputValue(initial.tee_at));
  const [spots, setSpots] = useState<number>(initial.spots ?? 16);
  const [format, setFormat] = useState<string>(initial.format);
  const [notes, setNotes] = useState<string>(initial.notes ?? "");
  const [announce, setAnnounce] = useState(true);
  const [busy, setBusy] = useState(false);
  const update = useServerFn(updateTeeTime);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await update({
        data: {
          teeTimeId: tid,
          courseName,
          teeAt: teeAt + ":00.000Z",
          spots,
          format: format as any,
          notes: notes || undefined,
          announce,
        },
      });
      toast.success("Tee time updated");
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't update tee time");
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full bg-paper rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest";
  const labelCls = "block text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-1.5";

  return (
    <form onSubmit={submit} className="mx-6 mt-4 bg-white rounded-2xl p-4 border border-border space-y-4 shadow-card">
      <div>
        <label className={labelCls}>Golf course</label>
        <input required value={courseName} onChange={(e) => setCourseName(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Date &amp; tee time</label>
        <input required type="datetime-local" value={teeAt} onChange={(e) => setTeeAt(e.target.value)} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Spots</label>
          <input type="number" min={2} max={40} value={spots} onChange={(e) => setSpots(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Game format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className={inputCls}>
            <option value="stableford">Stableford</option>
            <option value="stroke_play">Stroke Play</option>
            <option value="best_ball">Best Ball</option>
            <option value="four_ball_alliance">Four Ball Alliance</option>
            <option value="match_play">Match Play</option>
            <option value="skins">Skins</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Notes</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
        Post an update to group chat
      </label>
      <button type="submit" disabled={busy || !courseName || !teeAt}
        className="w-full bg-forest text-cream py-3 rounded-full text-xs font-bold uppercase tracking-club disabled:opacity-50">
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
