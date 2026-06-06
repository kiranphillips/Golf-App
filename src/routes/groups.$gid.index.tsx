import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileShell } from "@/components/MobileShell";
import { getGroupHome, startCasualRound } from "@/lib/api.functions";
import { fmtDateShort, fmtTime } from "@/lib/format";
import { toast } from "sonner";
import {
  ChevronRight, MessageSquare, ShieldCheck, Trophy, CalendarDays,
  Plane, Users, Megaphone, CheckCircle2, HelpCircle, XCircle, Plus, Zap,
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

  const playToday = async () => {
    try {
      
      const res = await startCasual({ data: { groupId: gid } });
      toast.success("Round started");
      navigate({ to: "/groups/$gid/tee-times/$tid/scorecard" as any, params: { gid, tid: (res as any).id } as any });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

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

      <section className="px-6 mt-4 grid grid-cols-2 gap-3">
        <Link to="/groups/$gid/tee-times" params={{ gid }} className="flex items-center justify-center gap-2 bg-forest text-cream rounded-2xl py-4 text-[11px] font-bold uppercase tracking-club">
          <Plus className="size-4" /> Schedule
        </Link>
        <button onClick={playToday} className="flex items-center justify-center gap-2 bg-gold text-charcoal rounded-2xl py-4 text-[11px] font-bold uppercase tracking-club">
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


      {data.nextTrip && (
        <section className="mt-6 px-6">
          <Link to="/groups/$gid/trips/$tid" params={{ gid, tid: data.nextTrip.id }} className="block bg-charcoal text-cream rounded-2xl p-5">
            <p className="text-gold text-[10px] font-bold uppercase tracking-club mb-1 flex items-center gap-1.5">
              <Plane className="size-3" /> Auri Adventures · Upcoming trip
            </p>
            <h4 className="font-display text-xl">{data.nextTrip.destination}</h4>
            <p className="text-cream/70 text-xs mt-1">{data.nextTrip.name} · {fmtDateShort(data.nextTrip.start_date)}</p>
          </Link>
        </section>
      )}

      <section className="mt-8 px-6 mb-8 grid grid-cols-2 gap-3">
        <Tile to="/groups/$gid/members" gid={gid} Icon={Users} label={`Members · ${data.memberCount}`} />
        <Tile to="/groups/$gid/trips" gid={gid} Icon={Plane} label="Trips" />
        <Tile to="/groups/$gid/chat" gid={gid} Icon={MessageSquare} label="Chat" />
        {g.isAdmin && <Tile to="/groups/$gid/admin" gid={gid} Icon={ShieldCheck} label="Admin" />}
      </section>
    </MobileShell>
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
