import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, useEffect } from "react";
import { MobileShell } from "@/components/MobileShell";
import { getGroupHome, startCasualRound, searchCourses, listGroupMembers } from "@/lib/api.functions";
import { fmtDateShort, fmtTime } from "@/lib/format";
import { toast } from "sonner";
import {
  ChevronRight, MessageSquare, ShieldCheck, Trophy, CalendarDays,
  Plane, Users, Megaphone, CheckCircle2, HelpCircle, XCircle, Plus, Zap,
  Search, X, MapPin, Loader2,
} from "lucide-react";

const homeQ = (gid: string) =>
  queryOptions({ queryKey: ["group-home", gid], queryFn: () => getGroupHome({ data: { groupId: gid } }) });

export const Route = createFileRoute("/groups/$gid/")({
  head: (ctx: any) => ({
    meta: [{ title: ctx.loaderData ? `${ctx.loaderData.group.name} — Clubhouse` : "Clubhouse" }],
  }),
  loader: ({ context, params }: { context: any; params: { gid: string } }) =>
    context.queryClient.ensureQueryData(homeQ(params.gid)),
  component: Clubhouse,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Couldn't load clubhouse: {error.message}</div>
  ),
});

function Clubhouse() {
  const { gid } = Route.useParams();
  const { data } = useSuspenseQuery(homeQ(gid));
  const g = data.group;
  const next = data.nextTeeTime;
  const navigate = useNavigate();
  const startCasual = useServerFn(startCasualRound);
  const [showCourseSheet, setShowCourseSheet] = useState(false);

  return (
    <MobileShell groupId={gid} clubName={g.name} clubKicker={g.kicker ?? "Digital Clubhouse"} showSwitcher activeTab="overview">
      {g.isAdmin && data.pendingApprovals > 0 && (
        <section className="px-6 mt-4">
          <Link to="/groups/$gid/admin" params={{ gid }} className="flex items-center justify-between bg-gold/15 border border-gold/30 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-gold" />
              <div>
                <p className="text-[10px] uppercase tracking-club text-gold font-bold">Admin</p>
                <p className="text-sm font-semibold">{data.pendingApprovals} member request{data.pendingApprovals === 1 ? "" : "s"} to review</p>
              </div>
            </div>
            <ChevronRight className="size-4 text-gold" />
          </Link>
        </section>
      )}

      {data.latestAnnouncement && (
        <section className="px-6 mt-4">
          <Link to="/groups/$gid/chat" params={{ gid }} className="block bg-forest text-cream rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Megaphone className="size-4 text-gold" />
              <span className="text-[10px] uppercase tracking-club text-gold font-bold">Announcement</span>
            </div>
            <p className="text-sm line-clamp-2">{data.latestAnnouncement.body}</p>
            <p className="text-[10px] text-cream/60 mt-1">{data.latestAnnouncement.authorName}</p>
          </Link>
        </section>
      )}

      <section className="px-6 mt-4">
        {next ? (
          <Link to="/groups/$gid/tee-times/$tid" params={{ gid, tid: next.id }} className="block bg-white rounded-2xl p-5 shadow-card border border-black/5">
            <div className="flex justify-between items-start mb-3">
              <span className="bg-forest/5 text-forest text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">Next Tee Time</span>
              <span className="text-gold font-display italic text-sm">{fmtDateShort(next.tee_at)}, {fmtTime(next.tee_at)}</span>
            </div>
            <h3 className="text-xl font-semibold mb-1">{next.course_name}</h3>
            <p className="text-muted-foreground text-xs uppercase tracking-club">{next.format} · {next.spots} spots</p>
            <div className="flex gap-4 mt-4 text-xs">
              <span className="flex items-center gap-1 text-forest font-semibold"><CheckCircle2 className="size-3.5" /> {data.rsvpCounts.in} In</span>
              <span className="flex items-center gap-1 text-gold font-semibold"><HelpCircle className="size-3.5" /> {data.rsvpCounts.maybe} Maybe</span>
              <span className="flex items-center gap-1 text-muted-foreground"><XCircle className="size-3.5" /> {data.rsvpCounts.out} Out</span>
            </div>
          </Link>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-card border border-black/5 text-center">
            <CalendarDays className="size-6 text-gold mx-auto mb-2" />
            <p className="text-sm font-semibold">No upcoming tee times</p>
            <p className="text-xs text-muted-foreground mt-1">Any member can schedule the next round.</p>
            <Link to="/groups/$gid/tee-times" params={{ gid }} className="inline-flex items-center gap-1 mt-4 bg-forest text-cream px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-club">
              <Plus className="size-3" /> Schedule a round
            </Link>
          </div>
        )}
      </section>

      {data.nextTrip && (
        <section className="mt-6 px-6">
          <Link to="/groups/$gid/trips/$tid" params={{ gid, tid: data.nextTrip.id }} className="block bg-charcoal text-cream rounded-2xl p-5">
            <p className="text-gold text-[10px] font-bold uppercase tracking-club mb-1 flex items-center gap-1.5">
              <Plane className="size-3" /> Auri Adventures · You're confirmed
            </p>
            <h4 className="font-display text-xl">{data.nextTrip.destination}</h4>
            <p className="text-cream/70 text-xs mt-1">{data.nextTrip.name} · {fmtDateShort(data.nextTrip.start_date)}</p>
          </Link>
        </section>
      )}

      <section className="px-6 mt-4 grid grid-cols-2 gap-3">
        <Link to="/groups/$gid/tee-times" params={{ gid }} className="flex items-center justify-center gap-2 bg-forest text-cream rounded-2xl py-4 text-[11px] font-bold uppercase tracking-club">
          <Plus className="size-4" /> Schedule
        </Link>
        <button onClick={() => setShowCourseSheet(true)} className="flex items-center justify-center gap-2 bg-gold text-charcoal rounded-2xl py-4 text-[11px] font-bold uppercase tracking-club">
          <Zap className="size-4" /> Play today
        </button>
      </section>

      <section className="mt-8 px-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg">Season standings</h3>
          <Link to="/groups/$gid/leaderboard" params={{ gid }} className="text-[10px] font-bold uppercase tracking-club text-forest">Full board</Link>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 shadow-soft divide-y divide-border/60">
          {data.leaderboardTop3.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No published results yet this season.</p>
          ) : (
            data.leaderboardTop3.map((row, i) => (
              <div key={row.userId} className="flex items-center gap-3 px-4 py-3">
                <span className="font-display text-base text-gold w-5 text-center">{i + 1}</span>
                <span className="flex-1 text-sm font-semibold truncate">{row.name}</span>
                <span className="font-display text-base text-forest tabular-nums">{row.points}</span>
              </div>
            ))
          )}
        </div>
      </section>


      <section className="mt-8 px-6 mb-8 grid grid-cols-2 gap-3">
        <Tile to="/groups/$gid/members" gid={gid} Icon={Users} label={`Members · ${data.memberCount}`} />
        <Tile to="/groups/$gid/trips" gid={gid} Icon={Plane} label="Trips" />
        <Tile to="/groups/$gid/chat" gid={gid} Icon={MessageSquare} label="Chat" />
        {g.isAdmin && <Tile to="/groups/$gid/admin" gid={gid} Icon={ShieldCheck} label="Admin" />}
      </section>

      {showCourseSheet && (
        <CoursePickerSheet
          gid={gid}
          onCancel={() => setShowCourseSheet(false)}
          onStart={async (courseName, playerIds) => {
            setShowCourseSheet(false);
            try {
              const res = await startCasual({ data: { groupId: gid, courseName, playerIds } });
              toast.success("Round started");
              navigate({ to: "/groups/$gid/tee-times/$tid/scorecard" as any, params: { gid, tid: (res as any).id } as any });
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
        />
      )}
    </MobileShell>
  );
}

// ─── COURSE PICKER SHEET ─────────────────────────────────────────────────────
type CourseResult = { id: string; name: string; place: string | null };

function CoursePickerSheet({
  gid, onCancel, onStart,
}: {
  gid: string;
  onCancel: () => void;
  onStart: (courseName: string, playerIds: string[]) => void;
}) {
  const [step,     setStep]     = useState<"course" | "players">("course");
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<CourseResult[]>([]);
  const [busy,     setBusy]     = useState(false);
  const [starting, setStarting] = useState(false);
  const [selected, setSelected] = useState("");
  const [members,  setMembers]  = useState<{ userId: string; name: string }[]>([]);
  const [picked,   setPicked]   = useState<Set<string>>(new Set());
  const doSearch = useServerFn(searchCourses);
  const doMembers = useServerFn(listGroupMembers);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (step !== "players") return;
    (async () => {
      try {
        const res = await doMembers({ data: { groupId: gid } });
        setMembers(res as any);
      } catch {}
    })();
  }, [step, gid, doMembers]);

  const togglePlayer = (uid: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  // Debounced course search
  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    tRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await doSearch({ data: { query: q } });
        setResults((res.results ?? []) as CourseResult[]);
      } catch {}
      finally { setBusy(false); }
    }, 400);
    return () => { if (tRef.current) clearTimeout(tRef.current); };
  }, [query, doSearch]);

  const pick = (name: string) => { setSelected(name); setQuery(name); setResults([]); };

  const goToPlayers = () => {
    const name = selected || query.trim();
    if (!name) { toast.error("Enter a course name"); return; }
    setStep("players");
  };

  const start = () => {
    const name = selected || query.trim();
    setStarting(true);
    onStart(name, [...picked]);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onCancel} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="px-5 pb-3 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl">Play today</h2>
              <p className="text-xs text-muted-foreground">
                {step === "course" ? "Which course are you playing?" : "Who's playing?"}
              </p>
            </div>
            <button onClick={onCancel} className="size-9 rounded-full bg-paper border border-border grid place-items-center">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {step === "course" ? (
          <>
            {/* Search input */}
            <div className="px-5 pb-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelected(""); }}
                  placeholder="Search course name…"
                  className="w-full bg-paper border border-border rounded-xl pl-9 pr-10 py-3 text-sm outline-none focus:ring-2 focus:ring-forest"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setSelected(""); setResults([]); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-5 pb-2">
              {busy && (
                <div className="flex justify-center py-6">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!busy && results.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {results.map(r => (
                    <button
                      key={r.id}
                      onClick={() => pick(r.name)}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${selected === r.name ? "border-forest bg-forest/5" : "border-border bg-white hover:border-forest/40"}`}
                    >
                      <MapPin className="size-4 text-gold shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{r.name}</p>
                        {r.place && <p className="text-[10px] text-muted-foreground truncate">{r.place}</p>}
                      </div>
                      {selected === r.name && <CheckCircle2 className="size-4 text-forest ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {!busy && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No courses found — you can still type the name and start.
                </p>
              )}

              {!busy && query.trim().length < 2 && (
                <p className="text-[10px] text-muted-foreground text-center py-4">
                  Type at least 2 characters to search courses.
                </p>
              )}
            </div>

            {/* Next button */}
            <div className="px-5 pb-8 pt-3 shrink-0 border-t border-border">
              <button
                onClick={goToPlayers}
                disabled={!selected && query.trim().length < 2}
                className="w-full bg-gold text-charcoal py-3.5 rounded-full text-sm font-bold uppercase tracking-club flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Users className="size-4" /> Next: pick players
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Player checklist */}
            <div className="flex-1 overflow-y-auto px-5 pb-2">
              {members.length === 0 ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-1.5 mb-3">
                  {members.map(m => (
                    <button
                      key={m.userId}
                      onClick={() => togglePlayer(m.userId)}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${picked.has(m.userId) ? "border-forest bg-forest/5" : "border-border bg-white hover:border-forest/40"}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{m.name}</p>
                      </div>
                      {picked.has(m.userId) && <CheckCircle2 className="size-4 text-forest ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Start button */}
            <div className="px-5 pb-8 pt-3 shrink-0 border-t border-border flex gap-2">
              <button
                onClick={() => setStep("course")}
                className="px-5 py-3.5 rounded-full text-sm font-bold uppercase tracking-club bg-paper border border-border"
              >
                Back
              </button>
              <button
                onClick={start}
                disabled={starting}
                className="flex-1 bg-gold text-charcoal py-3.5 rounded-full text-sm font-bold uppercase tracking-club flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {starting ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                {starting ? "Starting…" : "Start round"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Tile({ to, gid, Icon, label }: { to: string; gid: string; Icon: typeof Trophy; label: string }) {
  return (
    <Link to={to as any} params={{ gid } as any} className="bg-white rounded-2xl p-4 border border-black/5 shadow-soft flex flex-col gap-2">
      <Icon className="size-5 text-gold" />
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}
