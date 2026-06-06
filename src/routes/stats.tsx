import { createFileRoute, redirect, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { getMyStats } from "@/lib/api.functions";
import { FORMAT_LABELS, type GameFormat } from "@/lib/scoring";

const q = queryOptions({ queryKey: ["my-stats"], queryFn: () => getMyStats() });

export const Route = createFileRoute("/stats")({
  head: () => ({ meta: [{ title: "My Stats — Fairway Club" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  loader: ({ context }: { context: any }) => context.queryClient.ensureQueryData(q),
  component: StatsPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

function StatsPage() {
  const { data } = useSuspenseQuery(q);
  const router = useRouter();
  return (
    <MobileShell clubName="My Stats" clubKicker="Career snapshot">
      <div className="px-6 pt-2 pb-1">
        <button onClick={() => router.history.back()} className="text-[10px] uppercase tracking-club text-forest font-bold flex items-center gap-1">
          ← Back
        </button>
      </div>
      <section className="px-6 -mt-6 grid grid-cols-2 gap-3">
        <Tile label="Rounds" value={data.roundsPlayed} />
        <Tile label="Season pts" value={data.totalPoints} />
        <Tile label="Avg gross" value={data.avgGross ?? "—"} />
        <Tile label="Best gross" value={data.bestGross ?? "—"} />
        <Tile label="Avg Stbl" value={data.avgStableford ?? "—"} />
        <Tile label="Best Stbl" value={data.bestStableford ?? "—"} />
        <Tile label="Wins" value={data.wins} />
        <Tile label="Top 3" value={data.top3} />
      </section>

      <section className="px-6 mt-6">
        <h2 className="text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-2">By format</h2>
        <div className="bg-white rounded-2xl border border-border divide-y">
          {Object.entries(data.formatCounts).length === 0 && (
            <p className="p-4 text-xs text-muted-foreground">No rounds yet.</p>
          )}
          {Object.entries(data.formatCounts).map(([f, n]) => (
            <div key={f} className="flex justify-between p-3 text-sm">
              <span>{FORMAT_LABELS[f as GameFormat] ?? f}</span>
              <span className="font-bold tabular-nums">{n as number}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 mt-6 mb-8">
        <h2 className="text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-2">Recent rounds</h2>
        <div className="space-y-2">
          {data.recent.length === 0 && <p className="text-xs text-muted-foreground">Play your first round to see it here.</p>}
          {data.recent.map((r: any) => (
            <Link
              key={r.teeTimeId ?? Math.random()}
              to={"/groups/$gid/tee-times/$tid" as any}
              params={{ gid: r.groupId, tid: r.teeTimeId } as any}
              className="block bg-white rounded-xl border border-border p-3"
            >
              <div className="flex justify-between text-sm font-semibold">
                <span className="truncate pr-2">{r.courseName}</span>
                <span className="text-forest tabular-nums">{r.points ?? 0} pts</span>
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                <span>{r.groupName ?? ""} · {r.format ? FORMAT_LABELS[r.format as GameFormat] : ""}</span>
                <span className="tabular-nums">
                  {r.gross ? `G ${r.gross}` : ""}{r.stableford != null ? `  ·  S ${r.stableford}` : ""}{r.position ? `  ·  #${r.position}` : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </MobileShell>
  );
}

function Tile({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-white rounded-2xl border border-border p-4 text-center">
      <p className="text-[10px] uppercase tracking-club text-muted-foreground">{label}</p>
      <p className="font-display text-2xl text-forest mt-1 tabular-nums">{value}</p>
    </div>
  );
}
