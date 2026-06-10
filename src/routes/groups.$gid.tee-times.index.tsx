import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { listTeeTimes, createTeeTime, searchCourses, startCasualRound, startScheduledRound, deleteTeeTime, updateTeeTime } from "@/lib/api.functions";
import { fmtDateLong, fmtTime } from "@/lib/format";
import { Plus, ChevronRight, MapPin, Loader2, Zap, Pencil, Trash2, Play, Search, X, CheckCircle2 } from "lucide-react";
import { FORMAT_LABELS, type GameFormat } from "@/lib/scoring";
import { toast } from "sonner";

const q = (gid: string) =>
  queryOptions({ queryKey: ["tee-times", gid], queryFn: () => listTeeTimes({ data: { groupId: gid } }) });

export const Route = createFileRoute("/groups/$gid/tee-times/")({
  head: () => ({ meta: [{ title: "Tee Times — Fairway Club" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  loader: ({ context, params }: { context: any; params: { gid: string } }) =>
    context.queryClient.ensureQueryData(q(params.gid)),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

function Page() {
  const { gid } = Route.useParams();
  const { data: rows } = useSuspenseQuery(q(gid));
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCourseSheet, setShowCourseSheet] = useState(false);
  const startCasual = useServerFn(startCasualRound);
  const startScheduledRoundFn = useServerFn(startScheduledRound);
  const removeTeeTime = useServerFn(deleteTeeTime);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const deleteExisting = async (teeTimeId: string) => {
    if (!window.confirm("Are you sure you want to delete this tee time?")) return;
    try {
      await removeTeeTime({ data: { teeTimeId } });
      toast.success("Tee time deleted");
      qc.invalidateQueries({ queryKey: ["tee-times", gid] });
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't delete tee time");
    }
  };

  const startScheduled = async (teeTimeId: string) => {
    try {
      const res = await startScheduledRoundFn({ data: { teeTimeId } });
      qc.invalidateQueries({ queryKey: ["tee-time", teeTimeId] }); // fire-and-forget
      qc.invalidateQueries({ queryKey: ["tee-times", gid] });
      navigate({ to: "/groups/$gid/tee-times/$tid/scorecard" as any, params: { gid, tid: (res as any).id } as any });
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't open scorecard");
    }
  };

  return (
    <MobileShell groupId={gid} clubName="Tee Times" clubKicker="Upcoming rounds" showSwitcher activeTab="tee-times">
      <section className="px-6 mt-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center justify-center gap-2 bg-forest text-cream rounded-2xl py-4 text-[11px] font-bold uppercase tracking-club"
        >
          <Plus className="size-4" /> {creating ? "Cancel" : "Schedule"}
        </button>
        <button
          onClick={() => setShowCourseSheet(true)}
          className="flex items-center justify-center gap-2 bg-gold text-charcoal rounded-2xl py-4 text-[11px] font-bold uppercase tracking-club"
        >
          <Zap className="size-4" /> Start Casual
        </button>
      </section>
      {showCourseSheet && (
        <CoursePickerSheet
          onCancel={() => setShowCourseSheet(false)}
          onStart={async (courseName) => {
            setShowCourseSheet(false);
            try {
              const res = await startCasual({ data: { groupId: gid, courseName } });
              qc.invalidateQueries({ queryKey: ["tee-times", gid] });
              navigate({ to: "/groups/$gid/tee-times/$tid/scorecard" as any, params: { gid, tid: (res as any).id } as any });
            } catch (e: any) { toast.error(e.message ?? "Couldn't start round"); }
          }}
        />
      )}

      {creating && <CreateForm gid={gid} onDone={() => setCreating(false)} />}

      <section className="px-6 mt-6 space-y-3 pb-6">
        {rows.length === 0 && !creating && (
          <p className="text-sm text-muted-foreground text-center py-6">No tee times yet. Schedule one above or tap Play today.</p>
        )}
        {rows.map((tt: any) => {
          const isCasual = tt.notes === "Casual round";
          return (
            <article key={tt.id} className="bg-white rounded-2xl p-4 border border-black/5 shadow-soft">
              <Link to={"/groups/$gid/tee-times/$tid" as any} params={{ gid, tid: tt.id } as any} className="block">
                <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-club text-gold font-bold mb-1 flex items-center gap-2">
                    {FORMAT_LABELS[tt.format as GameFormat] ?? tt.format}
                    {isCasual && (
                      <span className="bg-gold/15 text-gold px-1.5 py-0.5 rounded text-[9px]">Casual</span>
                    )}
                  </p>
                  <h3 className="font-semibold text-base truncate">{tt.course_name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {fmtDateLong(tt.tee_at)} · {fmtTime(tt.tee_at)}
                  </p>
                </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
              <div className="flex gap-4 mt-3 pt-3 border-t border-border text-[11px] tabular-nums">
                <span><b className="text-forest">{tt.counts.in}</b> in</span>
                <span><b>{tt.counts.maybe}</b> maybe</span>
                <span><b>{tt.counts.out}</b> out</span>
              </div>
              <div className={`mt-3 grid gap-2 ${tt.canEdit ? "grid-cols-3" : "grid-cols-1"}`}>
                {tt.canEdit && (
                  <button type="button" onClick={() => setEditingId((current) => current === tt.id ? null : tt.id)}
                    className="flex items-center justify-center gap-1 rounded-full border border-border bg-paper py-2 text-[10px] font-bold uppercase tracking-club">
                    <Pencil className="size-3" /> Edit
                  </button>
                )}
                {tt.canEdit && (
                  <button type="button" onClick={() => deleteExisting(tt.id)}
                    className="flex items-center justify-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 py-2 text-[10px] font-bold uppercase tracking-club text-destructive">
                    <Trash2 className="size-3" /> Delete
                  </button>
                )}
                <button type="button" onClick={() => startScheduled(tt.id)}
                  className="flex items-center justify-center gap-1 rounded-full bg-forest py-2 text-[10px] font-bold uppercase tracking-club text-cream">
                  <Play className="size-3" /> Start Round
                </button>
              </div>
              {editingId === tt.id && (
                <EditTeeTimeForm teeTime={tt} onCancel={() => setEditingId(null)} onDone={() => { setEditingId(null); qc.invalidateQueries({ queryKey: ["tee-times", gid] }); }} />
              )}
            </article>
          );
        })}
      </section>
    </MobileShell>
  );
}

function CreateForm({ gid, onDone }: { gid: string; onDone: () => void }) {
  const [courseName, setCourseName] = useState("");
  const [teeAt, setTeeAt] = useState("");
  const [spots, setSpots] = useState(16);
  const [format, setFormat] = useState<"stableford" | "stroke_play" | "best_ball" | "four_ball_alliance" | "match_play" | "skins">("stableford");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createTeeTime);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const tt = await create({
        data: {
          groupId: gid,
          courseName,
          // Append 'Z' to treat the typed time as UTC — what you type is what displays.
          // No browser timezone conversion, no surprises.
          teeAt: teeAt + ":00.000Z",
          spots,
          format,
          notes: notes || undefined,
        },
      });
      toast.success("Tee time scheduled");
      qc.invalidateQueries({ queryKey: ["tee-times", gid] });
      onDone();
      navigate({ to: "/groups/$gid/tee-times/$tid" as any, params: { gid, tid: (tt as any).id } as any });
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't create tee time");
    } finally {
      setBusy(false);
    }
  };

  const inputCls = "w-full bg-paper rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest";
  const labelCls = "block text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-1.5";

  return (
    <form onSubmit={submit} className="mx-6 mt-3 bg-white rounded-2xl p-4 border border-border space-y-4">
      <div>
        <label htmlFor="course" className={labelCls}>Golf course</label>
        <CourseSearch value={courseName} onChange={setCourseName} inputCls={inputCls} />
      </div>
      <div>
        <label htmlFor="teeat" className={labelCls}>Date &amp; tee time</label>
        <input id="teeat" required type="datetime-local" value={teeAt} onChange={(e) => setTeeAt(e.target.value)} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="spots" className={labelCls}>Spots</label>
          <input id="spots" type="number" min={2} max={40} value={spots} onChange={(e) => setSpots(+e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="format" className={labelCls}>Game format</label>
          <select id="format" value={format} onChange={(e) => setFormat(e.target.value as any)} className={inputCls}>
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
        <label htmlFor="notes" className={labelCls}>Notes (optional)</label>
        <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Dress code, meeting point, cost…" className={inputCls} />
      </div>
      <button type="submit" disabled={busy || !courseName || !teeAt}
        className="w-full bg-forest text-cream py-3 rounded-full text-xs font-bold uppercase tracking-club disabled:opacity-50">
        {busy ? "Saving…" : "Schedule round"}
      </button>
    </form>
  );
}

function toLocalInputValue(iso: string) {
  // UTC getters keep the edit form consistent with fmtTime/fmtDateLong (timeZone: "UTC").
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function EditTeeTimeForm({ teeTime, onCancel, onDone }: { teeTime: any; onCancel: () => void; onDone: () => void }) {
  const [courseName, setCourseName] = useState(teeTime.course_name as string);
  const [teeAt, setTeeAt] = useState(toLocalInputValue(teeTime.tee_at));
  const [format, setFormat] = useState(teeTime.format as string);
  const [notes, setNotes] = useState(teeTime.notes ?? "");
  const [busy, setBusy] = useState(false);
  const update = useServerFn(updateTeeTime);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await update({
        data: {
          teeTimeId: teeTime.id,
          courseName,
          teeAt: teeAt + ":00.000Z",
          spots: teeTime.spots ?? 16,
          format: format as any,
          notes: notes || undefined,
          announce: true,
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
    <form onSubmit={submit} className="mt-4 border-t border-border pt-4 space-y-4">
      <div>
        <label className={labelCls}>Golf course</label>
        <input required value={courseName} onChange={(e) => setCourseName(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Date &amp; time</label>
        <input required type="datetime-local" value={teeAt} onChange={(e) => setTeeAt(e.target.value)} className={inputCls} />
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
      <div>
        <label className={labelCls}>Notes</label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="rounded-full border border-border bg-paper py-3 text-xs font-bold uppercase tracking-club">
          Cancel
        </button>
        <button type="submit" disabled={busy || !courseName || !teeAt} className="rounded-full bg-forest py-3 text-xs font-bold uppercase tracking-club text-cream disabled:opacity-50">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

// ─── COURSE PICKER SHEET (casual round) ──────────────────────────────────────
function CoursePickerSheet({ onCancel, onStart }: { onCancel: () => void; onStart: (courseName: string) => void }) {
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<Array<{ id: string; name: string; place: string | null }>>([]);
  const [busy,     setBusy]     = useState(false);
  const [starting, setStarting] = useState(false);
  const [selected, setSelected] = useState("");
  const doSearch = useServerFn(searchCourses);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    tRef.current = setTimeout(async () => {
      setBusy(true);
      try { const res = await doSearch({ data: { query: q } }); setResults(res.results ?? []); }
      catch {} finally { setBusy(false); }
    }, 400);
    return () => { if (tRef.current) clearTimeout(tRef.current); };
  }, [query, doSearch]);

  const pick = (name: string) => { setSelected(name); setQuery(name); setResults([]); };

  const start = () => {
    const name = selected || query.trim();
    if (!name) { toast.error("Enter a course name"); return; }
    setStarting(true);
    onStart(name);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="px-5 pb-3 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl">Start casual round</h2>
            <p className="text-xs text-muted-foreground">Which course are you playing?</p>
          </div>
          <button onClick={onCancel} className="size-9 rounded-full bg-paper border border-border grid place-items-center">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setSelected(""); }}
              placeholder="Search course name…"
              className="w-full bg-paper border border-border rounded-xl pl-9 pr-10 py-3 text-sm outline-none focus:ring-2 focus:ring-forest" />
            {query && (
              <button type="button" onClick={() => { setQuery(""); setSelected(""); setResults([]); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {busy && <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
          {!busy && results.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {results.map(r => (
                <button key={r.id} onClick={() => pick(r.name)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${selected === r.name ? "border-forest bg-forest/5" : "border-border bg-white"}`}>
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
            <p className="text-xs text-muted-foreground text-center py-4">No courses found — type the name and start anyway.</p>
          )}
          {!busy && query.trim().length < 2 && (
            <p className="text-[10px] text-muted-foreground text-center py-4">Type at least 2 characters to search.</p>
          )}
        </div>
        <div className="px-5 pb-8 pt-3 shrink-0 border-t border-border">
          <button onClick={start} disabled={starting || (!selected && query.trim().length < 2)}
            className="w-full bg-gold text-charcoal py-3.5 rounded-full text-sm font-bold uppercase tracking-club flex items-center justify-center gap-2 disabled:opacity-50">
            {starting ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
            {starting ? "Starting…" : "Start round"}
          </button>
        </div>
      </div>
    </>
  );
}

function CourseSearch({ value, onChange, inputCls }: {
  value: string;
  onChange: (v: string) => void;
  inputCls: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Array<{ id: string; name: string; place: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const search = useServerFn(searchCourses);
  const coords = useRef<{ lat: number; lng: number } | null>(null);
  const tRef = useRef<any>(null);

  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    if (!query || query.length < 2) { setResults([]); return; }
    tRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const args: any = { query };
        if (coords.current) { args.lat = coords.current.lat; args.lng = coords.current.lng; }
        const r = await search({ data: args });
        setResults(r.results); setOpen(true);
      } catch {} finally { setBusy(false); }
    }, 400);
    return () => tRef.current && clearTimeout(tRef.current);
  }, [query, search]);

  const findNearby = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      coords.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      try {
        const r = await search({ data: { lat: coords.current.lat, lng: coords.current.lng } });
        setResults(r.results); setOpen(true);
        if (!r.results.length) toast.info("No courses found nearby");
      } finally { setBusy(false); }
    }, (err) => { setBusy(false); toast.error(err.message); }, { timeout: 10000 });
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          required value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); }}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search a course…" className={inputCls + " flex-1"} />
        <button type="button" onClick={findNearby}
          className="bg-paper border border-border rounded-xl px-3 text-xs font-bold uppercase tracking-club flex items-center gap-1">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          Nearby
        </button>
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-card max-h-64 overflow-auto">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button"
                onClick={() => { setQuery(r.name); onChange(r.name); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-paper border-b border-border last:border-0">
                <div className="font-semibold truncate">{r.name}</div>
                {r.place && <div className="text-[11px] text-muted-foreground truncate">{r.place}</div>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-muted-foreground mt-1">Search OpenStreetMap or tap Nearby for current location.</p>
    </div>
  );
}
