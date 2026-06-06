import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { getLeaderboard } from "@/lib/api.functions";
import { Trophy } from "lucide-react";

const q = (gid: string) => queryOptions({
  queryKey: ["leaderboard", gid], queryFn: () => getLeaderboard({ data: { groupId: gid } }),
});

export const Route = createFileRoute("/groups/$gid/leaderboard")({
  head: () => ({ meta: [{ title: "Season Leaderboard — Fairway Club" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  loader: ({ context, params }: { context: any; params: { gid: string } }) =>
    context.queryClient.ensureQueryData(q(params.gid)),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

const MEDALS = ["🥇", "🥈", "🥉"];

function Page() {
  const { gid } = Route.useParams();
  const { data } = useSuspenseQuery(q(gid));

  if (data.length === 0) {
    return (
      <MobileShell groupId={gid} clubName="Season" clubKicker={`${new Date().getFullYear()} standings`} showSwitcher>
        <div className="px-6 mt-8 text-center space-y-2">
          <Trophy className="size-8 text-gold/40 mx-auto" />
          <p className="text-sm font-semibold">No results yet</p>
          <p className="text-xs text-muted-foreground">Play and publish a round to see the leaderboard.</p>
        </div>
      </MobileShell>
    );
  }

  const top3 = data.slice(0, 3);
  const rest  = data.slice(3);

  return (
    <MobileShell groupId={gid} clubName="Season" clubKicker={`${new Date().getFullYear()} standings`} showSwitcher>
      {/* ── PODIUM ── */}
      {top3.length >= 2 && (
        <section className="px-6 mt-4 mb-2">
          <div className="flex items-end justify-center gap-2">
            {/* 2nd */}
            {top3[1] && (
              <div className="flex-1 flex flex-col items-center">
                <p className="text-2xl mb-1">🥈</p>
                <div className="w-full bg-white border border-border rounded-t-2xl pt-3 pb-2 px-2 text-center h-20 flex flex-col justify-end">
                  <p className="text-xs font-bold truncate">{top3[1].name.split(" ")[0]}</p>
                  <p className="font-display text-lg text-forest">{top3[1].points}</p>
                  <p className="text-[9px] text-muted-foreground">{top3[1].rounds} rds</p>
                </div>
              </div>
            )}
            {/* 1st */}
            <div className="flex-1 flex flex-col items-center">
              <p className="text-3xl mb-1">🥇</p>
              <div className="w-full bg-forest text-cream rounded-t-2xl pt-3 pb-2 px-2 text-center h-28 flex flex-col justify-end">
                <p className="text-xs font-bold truncate">{top3[0].name.split(" ")[0]}</p>
                <p className="font-display text-2xl text-gold">{top3[0].points}</p>
                <p className="text-[9px] text-cream/70">{top3[0].rounds} rds</p>
              </div>
            </div>
            {/* 3rd */}
            {top3[2] && (
              <div className="flex-1 flex flex-col items-center">
                <p className="text-2xl mb-1">🥉</p>
                <div className="w-full bg-white border border-border rounded-t-2xl pt-3 pb-2 px-2 text-center h-16 flex flex-col justify-end">
                  <p className="text-xs font-bold truncate">{top3[2].name.split(" ")[0]}</p>
                  <p className="font-display text-lg text-forest">{top3[2].points}</p>
                  <p className="text-[9px] text-muted-foreground">{top3[2].rounds} rds</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── FULL TABLE ── */}
      <section className="px-6 mt-4 space-y-2 pb-6">
        {data.map((row, i) => (
          <div key={row.userId} className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${i < 3 ? "bg-white border-black/5 shadow-soft" : "bg-paper border-border"}`}>
            <span className="w-6 text-center text-base shrink-0">
              {i < 3 ? MEDALS[i] : <span className="font-display text-muted-foreground text-sm">{i + 1}</span>}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{row.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {row.rounds} round{row.rounds !== 1 ? "s" : ""}
                {row.handicap != null ? ` · HCP ${row.handicap}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-display text-xl text-forest tabular-nums">{row.points}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-club">pts</p>
            </div>
          </div>
        ))}
        {rest.length > 0 && (
          <p className="text-[10px] text-muted-foreground text-center pt-2 uppercase tracking-club">
            {data.length} players · {new Date().getFullYear()} season
          </p>
        )}
      </section>
    </MobileShell>
  );
}
