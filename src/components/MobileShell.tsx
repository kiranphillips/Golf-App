import { Link, useLocation } from "@tanstack/react-router";
import { Home, CalendarDays, Trophy, MessageSquare, User, ChevronLeft, Plane, Users, ShieldCheck, LayoutGrid } from "lucide-react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGroupHome } from "@/lib/api.functions";

interface MobileShellProps {
  children: ReactNode;
  clubName?: string;
  clubKicker?: string;
  initials?: string;
  hideHeader?: boolean;
  /** When inside a group, scope tabs to that group */
  groupId?: string;
  /** Show a "Switch group" affordance */
  showSwitcher?: boolean;
  /** Active clubhouse tab (overview, tee-times, leaderboard, chat, trips, members, admin) */
  activeTab?: string;
}

export function MobileShell({
  children,
  clubName = "Fairway Club",
  clubKicker = "Private golf societies",
  initials = "··",
  hideHeader = false,
  groupId,
  showSwitcher = false,
  activeTab,
}: MobileShellProps) {
  return (
    <div className="min-h-screen w-full flex justify-center bg-cream">
      <div
        className="relative w-full max-w-md min-h-screen bg-cream shadow-2xl flex flex-col"
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        {!hideHeader && (
          <header
            className="px-6 pb-5 flex justify-between items-end bg-forest text-cream"
            style={{ paddingTop: "calc(2.25rem + env(safe-area-inset-top))" }}
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-club text-cream/60 mb-1 truncate">{clubKicker}</p>
              <h1 className="font-display text-2xl leading-tight truncate">{clubName}</h1>
              {showSwitcher && (
                <Link to="/" className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-club text-gold/80">
                  <ChevronLeft className="size-3" /> All groups
                </Link>
              )}
            </div>
            <Link to="/profile" className="size-10 rounded-full border border-gold/40 bg-white/5 grid place-items-center text-xs font-medium text-gold">
              {initials}
            </Link>
          </header>
        )}
        {groupId && <ClubhouseTabs groupId={groupId} activeTab={activeTab} />}
        <main className="flex-1 pt-2">{children}</main>
        <RootNav />
      </div>
    </div>
  );
}

const TABS: { key: string; label: string; to: string; Icon: typeof Home }[] = [
  { key: "overview", label: "Overview", to: "/groups/$gid", Icon: LayoutGrid },
  { key: "tee-times", label: "Tee Times", to: "/groups/$gid/tee-times", Icon: CalendarDays },
  { key: "leaderboard", label: "Season", to: "/groups/$gid/leaderboard", Icon: Trophy },
  { key: "chat", label: "Chat", to: "/groups/$gid/chat", Icon: MessageSquare },
  { key: "trips", label: "Trips", to: "/groups/$gid/trips", Icon: Plane },
  { key: "members", label: "Members", to: "/groups/$gid/members", Icon: Users },
  { key: "admin", label: "Admin", to: "/groups/$gid/admin", Icon: ShieldCheck },
];

function ClubhouseTabs({ groupId, activeTab }: { groupId: string; activeTab?: string }) {
  const { pathname } = useLocation();
  const base = `/groups/${groupId}`;
  // Read admin status from the cached group-home query — no extra network call
  const { data: homeData } = useQuery({
    queryKey: ["group-home", groupId],
    queryFn: () => getGroupHome({ data: { groupId } }),
    staleTime: 60_000,
    enabled: !!groupId,
  });
  const isAdmin = homeData?.group?.isAdmin ?? false;

  const isActive = (key: string, to: string) => {
    if (activeTab) return activeTab === key;
    if (key === "overview") return pathname === base;
    return pathname.startsWith(to.replace("$gid", groupId));
  };
  return (
    <nav className="sticky top-0 z-10 bg-forest border-t border-cream/10">
      <div className="flex gap-1 overflow-x-auto px-3 py-2 no-scrollbar">
        {TABS.filter(t => t.key !== "admin" || isAdmin).map((t) => {
          const active = isActive(t.key, t.to);
          return (
            <Link
              key={t.key}
              to={t.to as any}
              params={{ gid: groupId } as any}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-club whitespace-nowrap ${
                active ? "bg-gold text-forest" : "text-cream/70 hover:text-cream"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function NavItem({
  to, label, Icon, active,
}: {
  to: string; label: string; Icon: typeof Home; active: boolean;
}) {
  return (
    <Link to={to as any} className="flex flex-col items-center gap-1.5 min-w-[48px]">
      <Icon className={`size-[18px] ${active ? "text-forest" : "text-muted-foreground/60"}`} strokeWidth={active ? 2.25 : 1.75} />
      <span className={`text-[9px] tracking-[0.1em] font-semibold ${active ? "text-forest" : "text-muted-foreground/60"}`}>{label}</span>
    </Link>
  );
}

function RootNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-border flex justify-around items-center px-4 z-20"
      style={{ height: "calc(5rem + env(safe-area-inset-bottom))", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <NavItem to="/" label="GROUPS" Icon={Home} active={pathname === "/" || pathname.startsWith("/groups")} />
      <NavItem to="/profile" label="PROFILE" Icon={User} active={pathname.startsWith("/profile")} />
    </nav>
  );
}
