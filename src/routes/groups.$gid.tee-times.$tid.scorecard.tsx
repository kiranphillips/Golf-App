import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import {
  getTeeTime, submitMyScores, publishResults, parseScorecardImage,
  setTeeTimeHoles, deleteTeeTime, setTeeBoxDetails,
} from "@/lib/api.functions";
import {
  stablefordPoints, strokesOnHole, courseHandicap, FORMAT_LABELS, type GameFormat,
} from "@/lib/scoring";
import { toast } from "sonner";
import {
  ChevronLeft, Camera, Loader2, CheckCircle2, Trash2, Settings2, ChevronDown,
  ScanLine, ChevronRight, LayoutGrid,
} from "lucide-react";

// ─── defaults ────────────────────────────────────────────────────────────────
const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const DEFAULT_SI   = [7, 13, 15, 1, 11, 5, 17, 3, 9, 8, 14, 16, 2, 12, 6, 18, 4, 10];

const TEE_PRESETS = [
  { name: "Blue",  color: "#3b82f6", rating: 74.2, slope: 132 },
  { name: "White", color: "#6b7280", rating: 72.1, slope: 127 },
  { name: "Gold",  color: "#d97706", rating: 70.3, slope: 120 },
  { name: "Red",   color: "#ef4444", rating: 69.5, slope: 115 },
];

// ─── query ────────────────────────────────────────────────────────────────────
const q = (tid: string) =>
  queryOptions({ queryKey: ["tee-time", tid], queryFn: () => getTeeTime({ data: { teeTimeId: tid } }) });

export const Route = createFileRoute("/groups/$gid/tee-times/$tid/scorecard")({
  head: () => ({ meta: [{ title: "Scorecard — Fairway Club" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  loader: ({ context, params }: { context: any; params: { tid: string } }) =>
    context.queryClient.ensureQueryData(q(params.tid)),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

// ─── helpers ──────────────────────────────────────────────────────────────────
function scoreColor(gross: number, par: number) {
  if (!gross) return "";
  const d = gross - par;
  if (d <= -2) return "bg-yellow-300/40 ring-1 ring-yellow-500 text-yellow-700";
  if (d === -1) return "bg-red-100 ring-1 ring-red-400 text-red-600";
  if (d === 0)  return "text-charcoal";
  if (d === 1)  return "bg-blue-50 ring-1 ring-blue-300 text-blue-600";
  return "bg-blue-100 ring-2 ring-blue-500 text-blue-800";
}

// ─── types ────────────────────────────────────────────────────────────────────
interface HoleView { hole: number; par: number; si: number; yards: number }
interface Player   { userId: string; name: string; handicap?: number | null }

// ─── scorecard table (9-hole half) ───────────────────────────────────────────
function ScorecardHalf({
  holes, players, scores, onScore, chcps, showNet, disabled, totalLabel, myUserId,
}: {
  holes: HoleView[];
  players: Player[];
  scores: Record<string, Record<number, number>>;
  onScore: (userId: string, hole: number, strokes: number) => void;
  chcps: Record<string, number>;
  showNet: boolean;
  disabled: boolean;
  totalLabel: "OUT" | "IN";
  myUserId: string | null;
}) {
  const grossSub = (uid: string) =>
    holes.reduce((s, h) => s + (scores[uid]?.[h.hole] ?? 0), 0);
  const netSub = (uid: string) => {
    const c = chcps[uid] ?? 0;
    return holes.reduce((s, h) => {
      const g = scores[uid]?.[h.hole] ?? 0;
      return s + (g ? g - strokesOnHole(c, h.si) : 0);
    }, 0);
  };
  const parTotal  = holes.reduce((s, h) => s + h.par, 0);
  const yardTotal = holes.reduce((s, h) => s + (h.yards || 0), 0);
  const sticky    = "sticky left-0 z-10 border-r";

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="border-collapse min-w-max text-[11px]">
        <tbody>
          {/* HOLE ROW */}
          <tr>
            <td className={`${sticky} bg-forest text-cream font-bold uppercase tracking-wider px-2 py-1.5 min-w-[88px] border-cream/20`}>
              Hole
            </td>
            {holes.map(h => (
              <td key={h.hole} className="bg-forest text-cream text-center font-bold px-0.5 py-1.5 min-w-[34px] border-r border-cream/10">
                {h.hole}
              </td>
            ))}
            <td className="bg-forest/80 text-cream text-center font-bold px-2 min-w-[38px]">{totalLabel}</td>
          </tr>

          {/* PAR ROW */}
          <tr>
            <td className={`${sticky} bg-forest/80 text-gold font-bold uppercase px-2 py-1 border-cream/20`}>Par</td>
            {holes.map(h => (
              <td key={h.hole} className="bg-forest/80 text-gold text-center font-bold px-0.5 py-1 border-r border-cream/10">{h.par}</td>
            ))}
            <td className="bg-forest/70 text-gold text-center font-bold px-2">{parTotal}</td>
          </tr>

          {/* SI ROW */}
          <tr>
            <td className={`${sticky} bg-charcoal text-cream/60 uppercase px-2 py-1 border-cream/10`}>S.I.</td>
            {holes.map(h => (
              <td key={h.hole} className="bg-charcoal text-cream/60 text-center px-0.5 py-1 border-r border-cream/10">{h.si}</td>
            ))}
            <td className="bg-charcoal" />
          </tr>

          {/* YARDS ROW */}
          <tr>
            <td className={`${sticky} bg-charcoal/80 text-cream/50 uppercase px-2 py-1 border-cream/10`}>Yards</td>
            {holes.map(h => (
              <td key={h.hole} className="bg-charcoal/80 text-cream/50 text-center px-0.5 py-1 border-r border-cream/10">
                {h.yards || <span className="opacity-30">—</span>}
              </td>
            ))}
            <td className="bg-charcoal/80 text-cream/50 text-center px-2">
              {yardTotal || <span className="opacity-30">—</span>}
            </td>
          </tr>

          {/* PLAYER ROWS */}
          {players.map((p, pi) => {
            const chcp      = chcps[p.userId] ?? Math.round(p.handicap ?? 0);
            const grossTotal = grossSub(p.userId);
            const netTotal   = netSub(p.userId);
            const even = pi % 2 === 0;
            const bg   = even ? "bg-white" : "bg-paper";

            return (
              <>
                {/* Gross row */}
                <tr key={p.userId + "-g"} className={`${bg} border-t-2 border-border`}>
                  <td className={`${sticky} ${bg} px-2 py-1.5 border-border`}>
                    <p className="font-semibold truncate max-w-[80px] leading-tight text-[11px] flex items-center gap-1">
                      {p.name}
                      {p.userId === myUserId && (
                        <span className="shrink-0 text-[8px] bg-forest text-cream px-1 py-0.5 rounded font-bold">You</span>
                      )}
                    </p>
                    <p className="text-[9px] text-gold leading-tight">
                      {p.handicap != null ? `HCP ${p.handicap} → ` : ""}CHP {chcp}
                    </p>
                  </td>
                  {holes.map(h => {
                    const g = scores[p.userId]?.[h.hole] ?? 0;
                    const received = strokesOnHole(chcp, h.si);
                    return (
                      <td key={h.hole} className="text-center p-0.5 border-r border-border/30">
                        <div className={`relative mx-auto w-[30px] h-[28px] flex items-center justify-center rounded ${scoreColor(g, h.par)}`}>
                          {received > 0 && (
                            <span className="absolute top-0.5 right-0.5 leading-none">
                              {[...Array(Math.min(received, 2))].map((_, i) => (
                                <span key={i} className={`inline-block size-1.5 rounded-full ${g ? "bg-white/60" : "bg-gold"}`} />
                              ))}
                            </span>
                          )}
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={15}
                            value={g || ""}
                            disabled={disabled}
                            onChange={e => onScore(p.userId, h.hole, +e.target.value || 0)}
                            className="w-full h-full text-center font-bold bg-transparent focus:outline-none focus:bg-gold/20 disabled:opacity-40 text-xs tabular-nums rounded"
                          />
                        </div>
                      </td>
                    );
                  })}
                  <td className={`${bg} text-center font-bold px-2 border-r border-border/30`}>
                    {grossTotal || <span className="text-muted-foreground/30">—</span>}
                  </td>
                </tr>

                {/* Net + stableford row (when toggled) */}
                {showNet && (
                  <tr key={p.userId + "-n"} className={`${even ? "bg-green-50/40" : "bg-green-50/20"} border-b border-border/40`}>
                    <td className={`${sticky} ${even ? "bg-green-50/40" : "bg-green-50/20"} px-2 py-0.5 border-border/30`}>
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Net (Stbl)</p>
                    </td>
                    {holes.map(h => {
                      const g    = scores[p.userId]?.[h.hole] ?? 0;
                      const net  = g ? g - strokesOnHole(chcp, h.si) : 0;
                      const stbl = g ? stablefordPoints(h.par, g, strokesOnHole(chcp, h.si)) : null;
                      return (
                        <td key={h.hole} className="text-center text-[10px] py-0.5 px-0.5 border-r border-border/20">
                          {net
                            ? <span className="text-muted-foreground">{net}<span className="text-gold ml-0.5 text-[9px]">({stbl})</span></span>
                            : <span className="text-border/50">·</span>}
                        </td>
                      );
                    })}
                    <td className="text-center text-[10px] font-semibold text-muted-foreground px-2">
                      {netTotal || "—"}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── tee box setup panel ──────────────────────────────────────────────────────
function TeeBoxPanel({
  current, onSave, onClose,
}: {
  current: { name: string; rating: number; slope: number; par: number };
  onSave: (v: typeof current) => void;
  onClose: () => void;
}) {
  const [name,   setName]   = useState(current.name);
  const [rating, setRating] = useState(String(current.rating));
  const [slope,  setSlope]  = useState(String(current.slope));
  const [par,    setPar]    = useState(String(current.par));
  const cls = "w-full bg-paper rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-forest";

  return (
    <div className="mx-4 mt-3 bg-white rounded-2xl p-4 border border-border shadow-card space-y-3">
      <p className="text-[10px] uppercase tracking-club text-muted-foreground font-bold">Tee box settings</p>

      <div className="flex gap-2 flex-wrap">
        {TEE_PRESETS.map(t => (
          <button
            key={t.name}
            type="button"
            onClick={() => { setName(t.name); setRating(String(t.rating)); setSlope(String(t.slope)); }}
            className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-club border border-border hover:border-forest"
            style={{ color: t.color }}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-club text-muted-foreground font-bold block mb-1">Tee Name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. White" className={cls} />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-club text-muted-foreground font-bold block mb-1">Course Par</span>
          <input type="number" value={par} onChange={e => setPar(e.target.value)} min={27} max={90} className={cls} />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-club text-muted-foreground font-bold block mb-1">Course Rating</span>
          <input type="number" step="0.1" value={rating} onChange={e => setRating(e.target.value)} placeholder="72.1" className={cls} />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-club text-muted-foreground font-bold block mb-1">Slope Rating</span>
          <input type="number" value={slope} onChange={e => setSlope(e.target.value)} placeholder="125" className={cls} />
        </label>
      </div>

      <p className="text-[9px] text-muted-foreground">
        Course Rating &amp; Slope are on the club scorecard or the club's website. Presets are typical values — enter your course's actual numbers for accurate handicaps.
      </p>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onClose} className="rounded-full border border-border bg-paper py-2.5 text-xs font-bold uppercase tracking-club">
          Cancel
        </button>
        <button
          onClick={() => {
            const r = parseFloat(rating), s = parseInt(slope, 10), p = parseInt(par, 10);
            if (!name || isNaN(r) || isNaN(s) || isNaN(p)) { toast.error("Please fill all fields"); return; }
            onSave({ name, rating: r, slope: s, par: p });
            onClose();
          }}
          className="rounded-full bg-forest text-cream py-2.5 text-xs font-bold uppercase tracking-club"
        >
          Apply tee
        </button>
      </div>
    </div>
  );
}

// ─── live summary bar ─────────────────────────────────────────────────────────
function SummaryBar({
  players, scores, chcps, holeViews,
}: {
  players: Player[];
  scores: Record<string, Record<number, number>>;
  chcps: Record<string, number>;
  holeViews: HoleView[];
}) {
  const rows = players.map(p => {
    const chcp = chcps[p.userId] ?? 0;
    const gross = holeViews.reduce((s, h) => s + (scores[p.userId]?.[h.hole] ?? 0), 0);
    const net   = holeViews.reduce((s, h) => {
      const g = scores[p.userId]?.[h.hole] ?? 0;
      return s + (g ? g - strokesOnHole(chcp, h.si) : 0);
    }, 0);
    const stbl  = holeViews.reduce((s, h) => {
      const g = scores[p.userId]?.[h.hole] ?? 0;
      return s + (g ? stablefordPoints(h.par, g, strokesOnHole(chcp, h.si)) : 0);
    }, 0);
    const played = Object.values(scores[p.userId] ?? {}).filter((v: any) => v > 0).length;
    return { ...p, gross, net, stbl, played };
  });
  const ranked = [...rows].sort((a, b) => b.stbl - a.stbl || a.gross - b.gross);

  return (
    <div className="mx-4 bg-white rounded-2xl border border-black/5 shadow-soft divide-y divide-border/50">
      {ranked.map((r, i) => (
        <div key={r.userId} className="flex items-center gap-3 px-3 py-2.5">
          <span className="font-display text-base text-gold w-5 text-center tabular-nums">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{r.name}</p>
            <p className="text-[10px] text-muted-foreground">{r.played}/18 holes · CHP {chcps[r.userId] ?? "—"}</p>
          </div>
          <div className="text-right tabular-nums text-xs space-y-0.5">
            {r.gross > 0 && <p className="font-bold text-charcoal">G {r.gross}</p>}
            {r.net > 0   && <p className="text-muted-foreground text-[10px]">N {r.net}</p>}
            {r.stbl > 0  && <p className="text-forest font-bold">S {r.stbl} pts</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── round setup card ─────────────────────────────────────────────────────────
function RoundSetupCard({
  teeBoxName, courseRating, slopeRating, coursePar,
  onApplyTee, onStartScoring,
  ocrBusy, fileRef,
}: {
  teeBoxName: string;
  courseRating: number;
  slopeRating: number;
  coursePar: number;
  onApplyTee: (v: { name: string; rating: number; slope: number; par: number }) => Promise<void>;
  onStartScoring: () => void;
  ocrBusy: boolean;
  fileRef: React.RefObject<HTMLInputElement>;
}) {
  const [saving,      setSaving]      = useState(false);
  const [customOpen,  setCustomOpen]  = useState(false);
  const [customName,  setCustomName]  = useState("");
  const [customRating,setCustomRating]= useState(String(courseRating));
  const [customSlope, setCustomSlope] = useState(String(slopeRating));
  const [customPar,   setCustomPar]   = useState(String(coursePar));

  const selectPreset = async (t: typeof TEE_PRESETS[0]) => {
    setSaving(true);
    await onApplyTee({ name: t.name, rating: t.rating, slope: t.slope, par: 72 });
    setSaving(false);
  };

  const applyCustom = async () => {
    const r = parseFloat(customRating);
    const s = parseInt(customSlope, 10);
    const p = parseInt(customPar, 10);
    if (!customName || isNaN(r) || isNaN(s) || isNaN(p)) return;
    setSaving(true);
    await onApplyTee({ name: customName, rating: r, slope: s, par: p });
    setSaving(false);
  };

  const inputCls = "w-full bg-paper rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-forest";

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      {/* ── STEP 1: SELECT TEE ── */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-card overflow-hidden">
        <div className="bg-forest/5 px-5 pt-4 pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="size-6 rounded-full bg-forest text-cream grid place-items-center text-[10px] font-bold shrink-0">1</span>
            <div>
              <p className="text-sm font-bold">Select your tee</p>
              <p className="text-[10px] text-muted-foreground">Sets course handicap for all players</p>
            </div>
            {teeBoxName && <CheckCircle2 className="size-4 text-forest ml-auto shrink-0" />}
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {TEE_PRESETS.map(t => (
              <button
                key={t.name}
                disabled={saving}
                onClick={() => selectPreset(t)}
                className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 text-left transition-colors disabled:opacity-60 ${
                  teeBoxName === t.name
                    ? "border-forest bg-forest/5"
                    : "border-border hover:border-forest/40"
                }`}
              >
                <span className="size-4 rounded-full shrink-0 border border-black/10" style={{ background: t.color }} />
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-tight">{t.name}</p>
                  <p className="text-[9px] text-muted-foreground leading-tight">{t.rating} / {t.slope}</p>
                </div>
                {teeBoxName === t.name && <CheckCircle2 className="size-3.5 text-forest ml-auto shrink-0" />}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCustomOpen(v => !v)}
            className="text-[10px] font-bold uppercase tracking-club text-forest flex items-center gap-1"
          >
            {customOpen ? "▲" : "▼"} Custom rating &amp; slope
          </button>

          {customOpen && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[9px] uppercase tracking-club text-muted-foreground font-bold block mb-1">Tee name</span>
                  <input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="e.g. Yellow" className={inputCls} />
                </label>
                <label className="block">
                  <span className="text-[9px] uppercase tracking-club text-muted-foreground font-bold block mb-1">Course par</span>
                  <input type="number" min={27} max={90} value={customPar} onChange={e => setCustomPar(e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className="text-[9px] uppercase tracking-club text-muted-foreground font-bold block mb-1">Course rating</span>
                  <input type="number" step="0.1" value={customRating} onChange={e => setCustomRating(e.target.value)} placeholder="72.1" className={inputCls} />
                </label>
                <label className="block">
                  <span className="text-[9px] uppercase tracking-club text-muted-foreground font-bold block mb-1">Slope rating</span>
                  <input type="number" value={customSlope} onChange={e => setCustomSlope(e.target.value)} placeholder="125" className={inputCls} />
                </label>
              </div>
              <button
                onClick={applyCustom}
                disabled={saving || !customName}
                className="w-full bg-charcoal text-cream py-2.5 rounded-full text-[10px] font-bold uppercase tracking-club disabled:opacity-50"
              >
                {saving ? "Saving…" : "Apply custom tee"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── STEP 2: HOLE DATA ── */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-card overflow-hidden">
        <div className="bg-forest/5 px-5 pt-4 pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="size-6 rounded-full bg-forest text-cream grid place-items-center text-[10px] font-bold shrink-0">2</span>
            <div>
              <p className="text-sm font-bold">Add hole data</p>
              <p className="text-[10px] text-muted-foreground">Scan scorecard for accurate pars &amp; stroke indexes</p>
            </div>
          </div>
        </div>
        <div className="p-4 space-y-2.5">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={ocrBusy}
            className="w-full flex items-center gap-3 bg-forest text-cream px-4 py-3.5 rounded-xl text-sm font-bold disabled:opacity-60"
          >
            {ocrBusy
              ? <Loader2 className="size-5 animate-spin shrink-0" />
              : <Camera className="size-5 shrink-0" />}
            <div className="text-left">
              <p className="leading-tight">{ocrBusy ? "Reading scorecard…" : "Scan scorecard photo"}</p>
              <p className="text-[10px] text-cream/70 font-normal leading-tight mt-0.5">Take a photo of the course scorecard</p>
            </div>
          </button>

          <button
            onClick={onStartScoring}
            className="w-full flex items-center gap-3 bg-paper border border-border px-4 py-3.5 rounded-xl text-sm font-bold"
          >
            <LayoutGrid className="size-5 text-forest shrink-0" />
            <div className="text-left">
              <p className="leading-tight">Use standard par-72</p>
              <p className="text-[10px] text-muted-foreground font-normal leading-tight mt-0.5">Default holes — you can scan later</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground ml-auto shrink-0" />
          </button>
        </div>
      </div>

      {teeBoxName && (
        <button
          onClick={onStartScoring}
          className="w-full bg-gold text-charcoal py-3.5 rounded-full text-sm font-bold uppercase tracking-club flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="size-4" /> Start scoring →
        </button>
      )}
    </div>
  );
}

// ─── main page ─────────────────────────────────────────────────────────────────
function Page() {
  const { gid, tid } = Route.useParams();
  const { data }     = useSuspenseQuery(q(tid));
  const qc           = useQueryClient();
  const navigate     = useNavigate();
  const [myUserId,   setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => setMyUserId(s.session?.user?.id ?? null));
  }, []);

  // All players: In + Maybe + No Reply (de-duped)
  const players = useMemo((): Player[] => {
    const all  = [...data.sections.in, ...data.sections.maybe, ...data.sections.no_reply];
    const seen = new Set<string>();
    return all.filter(p => { if (seen.has(p.userId)) return false; seen.add(p.userId); return true; });
  }, [data]);

  // Tee box (initialise from DB columns if already saved)
  const tt = data.teeTime as any;
  const [teeBoxName,   setTeeBoxName]   = useState<string>(tt.tee_box_name ?? "");
  const [courseRating, setCourseRating] = useState<number>(tt.course_rating ?? 72.0);
  const [slopeRating,  setSlopeRating]  = useState<number>(tt.slope_rating  ?? 113);
  const [coursePar,    setCoursePar]    = useState<number>(tt.course_par    ?? 72);
  const [showTeePanel, setShowTeePanel] = useState(false);
  // Setup phase: shown on fresh rounds (no tee set) before the scoring grid
  const [setupDone, setSetupDone] = useState(() => !!(data.teeTime as any).tee_box_name || !!data.isClosed);

  // Hole / score state
  const [half,     setHalf]     = useState<"front" | "back">("front");
  const [showNet,  setShowNet]  = useState(false);
  const [scores,   setScores]   = useState<Record<string, Record<number, number>>>(() => data.scoresByUser ?? {});
  const [pars,     setPars]     = useState<number[]>(DEFAULT_PARS);
  const [sis,      setSis]      = useState<number[]>(DEFAULT_SI);
  const [yards,    setYards]    = useState<number[]>(Array(18).fill(0));
  const [ocrBusy,    setOcrBusy]    = useState(false);
  const [saveBusy,   setSaveBusy]   = useState(false);
  const [autoSaved,  setAutoSaved]  = useState(false);
  const fileRef    = useRef<HTMLInputElement>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submit      = useServerFn(submitMyScores);
  const pub         = useServerFn(publishResults);
  const del         = useServerFn(deleteTeeTime);
  const parseImg    = useServerFn(parseScorecardImage);
  const saveHolesFn = useServerFn(setTeeTimeHoles);
  const saveTeeBoxFn = useServerFn(setTeeBoxDetails);

  // Sync DB into local state on load
  useEffect(() => {
    setScores(data.scoresByUser ?? {});
    const dbHoles = Array.isArray(data.holes) && data.holes.length === 18 ? data.holes : null;
    if (dbHoles) {
      setPars(dbHoles.map((h: any) => h.par ?? 4));
      setSis(dbHoles.map((h: any) => h.strokeIndex ?? h.stroke_index ?? DEFAULT_SI[(h.number ?? 1) - 1]));
      setYards(dbHoles.map((h: any) => h.yards ?? 0));
    }
    const t = data.teeTime as any;
    if (t.tee_box_name) { setTeeBoxName(t.tee_box_name); setCourseRating(t.course_rating ?? 72.0); setSlopeRating(t.slope_rating ?? 113); setCoursePar(t.course_par ?? 72); }
  }, [data]);

  // Course handicap for each player
  const chcps = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of players) {
      map[p.userId] = teeBoxName
        ? courseHandicap(p.handicap ?? 0, slopeRating, courseRating, coursePar)
        : Math.round(p.handicap ?? 0);
    }
    return map;
  }, [players, teeBoxName, slopeRating, courseRating, coursePar]);

  const holeViews: HoleView[] = pars.map((par, i) => ({ hole: i + 1, par, si: sis[i], yards: yards[i] ?? 0 }));
  const fmt = (data.teeTime.format as GameFormat) ?? "stableford";

  const onScore = (uid: string, hole: number, strokes: number) => {
    setScores(prev => ({ ...prev, [uid]: { ...(prev[uid] ?? {}), [hole]: strokes } }));
    if (data.isClosed) return;
    // Auto-save 2 seconds after the last score entry
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(async () => {
      try {
        const latestScores = await new Promise<Record<string, Record<number, number>>>(res =>
          setScores(s => { res(s); return s; })
        );
        for (const [scoreUid, uScores] of Object.entries(latestScores)) {
          const rows = Object.entries(uScores)
            .filter(([, v]) => (v as number) > 0)
            .map(([h, v]) => ({ hole: +h, strokes: v as number }));
          if (rows.length) await submit({ data: { teeTimeId: tid, userId: scoreUid, myScores: rows } as any });
        }
        setAutoSaved(true);
        setTimeout(() => setAutoSaved(false), 2000);
      } catch { /* silent auto-save failure — user can still manually save */ }
    }, 2000);
  };

  const applyTeeBox = async (v: { name: string; rating: number; slope: number; par: number }) => {
    setTeeBoxName(v.name); setCourseRating(v.rating); setSlopeRating(v.slope); setCoursePar(v.par);
    try {
      await saveTeeBoxFn({ data: { teeTimeId: tid, teeBoxName: v.name, courseRating: v.rating, slopeRating: v.slope, coursePar: v.par } });
      toast.success(`Tee: ${v.name} · Rating ${v.rating} / Slope ${v.slope}`);
    } catch (e: any) { toast.error(e.message ?? "Couldn't save tee box"); }
  };

  const saveAll = async () => {
    if (data.isClosed) { toast.error("Round is closed"); return; }
    setSaveBusy(true);
    try {
      for (const [uid, uScores] of Object.entries(scores)) {
        const rows = Object.entries(uScores)
          .filter(([, v]) => (v as number) > 0)
          .map(([h, v]) => ({ hole: +h, strokes: v as number }));
        if (rows.length) await submit({ data: { teeTimeId: tid, userId: uid, myScores: rows } as any });
      }
      toast.success("Scores saved");
      qc.invalidateQueries({ queryKey: ["tee-time", tid] });
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setSaveBusy(false); }
  };

  const closeRound = async () => {
    if (!window.confirm("Close round and lock all scores?")) return;
    try {
      await saveAll();
      await pub({ data: { teeTimeId: tid } });
      toast.success("Round closed · results published");
      qc.invalidateQueries({ queryKey: ["tee-time", tid] });
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteRound = async () => {
    if (!window.confirm("Delete this round? Cannot be undone.")) return;
    try {
      await del({ data: { teeTimeId: tid } });
      toast.success("Round deleted");
      navigate({ to: "/groups/$gid/tee-times" as any, params: { gid } as any });
    } catch (e: any) { toast.error(e.message ?? "Couldn't delete"); }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 6_000_000) { toast.error("Image too large (max 6MB)"); return; }
    setOcrBusy(true);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res((r.result as string).split(",")[1] ?? "");
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(f);
      });
      const result = await parseImg({ data: { imageBase64: b64, mimeType: f.type || "image/jpeg" } });
      if (result.error) throw new Error(result.error);
      if (!result.holes?.length) throw new Error("No holes found in image");
      const sorted   = [...result.holes].sort((a, b) => a.number - b.number);
      const newPars  = Array.from({ length: 18 }, (_, i) => sorted.find(h => h.number === i + 1)?.par         ?? DEFAULT_PARS[i]);
      const newSis   = Array.from({ length: 18 }, (_, i) => sorted.find(h => h.number === i + 1)?.strokeIndex ?? DEFAULT_SI[i]);
      const newYards = Array.from({ length: 18 }, (_, i) => (sorted.find(h => h.number === i + 1) as any)?.yards ?? 0);
      setPars(newPars); setSis(newSis); setYards(newYards);
      await saveHolesFn({ data: { teeTimeId: tid, holes: newPars.map((par, i) => ({ number: i + 1, par, strokeIndex: newSis[i] })) } });
      toast.success("Scorecard scanned & saved");
      setSetupDone(true); // advance past setup when scan succeeds
    } catch (err: any) {
      toast.error(err.message ?? "OCR failed");
    } finally {
      setOcrBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!players.length) {
    return (
      <MobileShell groupId={gid} clubName="Scorecard" showSwitcher>
        <p className="p-6 text-sm text-muted-foreground text-center mt-8">
          No players in this round yet — RSVP "In" first.
        </p>
      </MobileShell>
    );
  }

  const teeColor = TEE_PRESETS.find(t => t.name === teeBoxName)?.color ?? "#9ca3af";

  // Shared header used in both phases
  const Header = (
    <header className="px-6 pt-12 pb-5 bg-forest text-cream relative">
      <Link to={"/groups/$gid/tee-times/$tid" as any} params={{ gid, tid } as any} className="absolute top-12 left-6 text-cream/70">
        <ChevronLeft className="size-5" />
      </Link>
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-club text-gold mb-1">{FORMAT_LABELS[fmt] ?? "Scorecard"}</p>
        <h1 className="font-display text-xl leading-tight">{data.teeTime.course_name}</h1>
        <p className="text-cream/60 text-[10px] mt-1">{players.length} players</p>
      </div>
      <button
        onClick={() => setShowTeePanel(v => !v)}
        className="absolute top-12 right-6 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-club text-cream"
      >
        <span className="size-2.5 rounded-full shrink-0 border border-white/30" style={{ background: teeColor }} />
        {teeBoxName || "Set tee"}
        <ChevronDown className="size-3" />
      </button>
    </header>
  );

  // Hidden file input shared across both phases
  const FileInput = (
    <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
  );

  // ── SETUP PHASE: shown on fresh rounds (no tee selected yet) ──────────────
  if (!setupDone && !data.isClosed) {
    return (
      <MobileShell groupId={gid} hideHeader>
        {Header}
        {FileInput}
        <RoundSetupCard
          teeBoxName={teeBoxName}
          courseRating={courseRating}
          slopeRating={slopeRating}
          coursePar={coursePar}
          onApplyTee={applyTeeBox}
          onStartScoring={() => setSetupDone(true)}
          ocrBusy={ocrBusy}
          fileRef={fileRef}
        />
      </MobileShell>
    );
  }

  // ── SCORING PHASE ─────────────────────────────────────────────────────────
  return (
    <MobileShell groupId={gid} hideHeader>
      {Header}
      {FileInput}

      {showTeePanel && (
        <TeeBoxPanel
          current={{ name: teeBoxName, rating: courseRating, slope: slopeRating, par: coursePar }}
          onSave={applyTeeBox}
          onClose={() => setShowTeePanel(false)}
        />
      )}

      {data.isClosed && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-charcoal text-cream rounded-xl px-4 py-2.5">
          <CheckCircle2 className="size-4 text-gold shrink-0" />
          <p className="text-xs font-bold uppercase tracking-club">Round closed · scores are locked</p>
        </div>
      )}

      <div className="flex items-center justify-between px-4 mt-3 gap-2">
        <div className="flex bg-paper rounded-full p-1 border border-border text-[10px] font-bold uppercase tracking-club">
          {(["front", "back"] as const).map(h => (
            <button
              key={h}
              onClick={() => setHalf(h)}
              className={`px-4 py-1.5 rounded-full transition-colors ${half === h ? "bg-forest text-cream" : "text-muted-foreground"}`}
            >
              {h === "front" ? "Front 9" : "Back 9"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {autoSaved && (
            <span className="text-[9px] text-forest font-bold uppercase tracking-club flex items-center gap-1">
              <CheckCircle2 className="size-3" /> Saved
            </span>
          )}
          <button
            onClick={() => setShowNet(v => !v)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-club border transition-colors ${showNet ? "bg-forest text-cream border-forest" : "border-border text-muted-foreground"}`}
          >
            Net / Stbl
          </button>
        </div>
      </div>

      <div className="mt-3 px-1">
        {half === "front"
          ? <ScorecardHalf holes={holeViews.slice(0, 9)}  players={players} scores={scores} onScore={onScore} chcps={chcps} showNet={showNet} disabled={!!data.isClosed} totalLabel="OUT" myUserId={myUserId} />
          : <ScorecardHalf holes={holeViews.slice(9, 18)} players={players} scores={scores} onScore={onScore} chcps={chcps} showNet={showNet} disabled={!!data.isClosed} totalLabel="IN"  myUserId={myUserId} />
        }
      </div>

      <div className="px-4 mt-5">
        <p className="text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-2">Live standings</p>
      </div>
      <SummaryBar players={players} scores={scores} chcps={chcps} holeViews={holeViews} />

      <section className="px-4 mt-5 space-y-2 mb-10">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={ocrBusy}
          className="w-full flex items-center justify-center gap-2 bg-paper border border-border py-3 rounded-full text-xs font-bold uppercase tracking-club disabled:opacity-50"
        >
          {ocrBusy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          {ocrBusy ? "Reading scorecard…" : "Re-scan scorecard"}
        </button>

        {!data.isClosed && (
          <button
            onClick={saveAll}
            disabled={saveBusy}
            className="w-full flex items-center justify-center gap-2 bg-forest text-cream py-3 rounded-full text-xs font-bold uppercase tracking-club disabled:opacity-50"
          >
            {saveBusy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {saveBusy ? "Saving…" : "Save all scores"}
          </button>
        )}

        {data.canEdit && !data.isClosed && (
          <button
            onClick={closeRound}
            className="w-full flex items-center justify-center gap-2 bg-gold text-charcoal py-3 rounded-full text-xs font-bold uppercase tracking-club"
          >
            <CheckCircle2 className="size-4" /> Close &amp; publish round
          </button>
        )}

        {data.isClosed && (
          <p className="text-center text-xs font-bold uppercase tracking-club text-muted-foreground py-1">
            Round closed · scores locked
          </p>
        )}

        {data.canEdit && (
          <button
            onClick={deleteRound}
            className="w-full flex items-center justify-center gap-2 bg-destructive/10 text-destructive border border-destructive/30 py-3 rounded-full text-xs font-bold uppercase tracking-club"
          >
            <Trash2 className="size-4" /> Delete round
          </button>
        )}
      </section>
    </MobileShell>
  );
}
