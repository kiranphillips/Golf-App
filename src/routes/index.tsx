import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyGroups, lookupGroupByCode, requestJoinByCode, createGroup,
  listMyPendingRequests, listUpcomingAcrossGroups,
  searchGroups, requestJoinGroupById, cancelJoinRequest,
  updateGroupVisibility,
} from "@/lib/api.functions";
import { fmtDateShort, fmtTime } from "@/lib/format";
import { toast } from "sonner";
import {
  Plus, KeyRound, ChevronRight, Clock, Hourglass,
  Search, Globe, Lock, Users, X, Loader2, MapPin, Trash2, Eye, EyeOff,
} from "lucide-react";

const groupsQ   = queryOptions({ queryKey: ["my-groups"],       queryFn: () => listMyGroups() });
const pendingQ  = queryOptions({ queryKey: ["my-pending"],      queryFn: () => listMyPendingRequests() });
const upcomingQ = queryOptions({ queryKey: ["upcoming-across"], queryFn: () => listUpcomingAcrossGroups() });

type Mode = "none" | "join" | "create" | "search";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Your Clubhouses — Fairway Club" },
      { name: "description", content: "Your digital clubhouse for private golf groups." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(groupsQ),
      context.queryClient.ensureQueryData(pendingQ),
      context.queryClient.ensureQueryData(upcomingQ),
    ]),
  component: HomePage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Couldn't load your clubhouses: {error.message}</div>
  ),
});

function HomePage() {
  const { data: groups }   = useSuspenseQuery(groupsQ);
  const { data: pending }  = useSuspenseQuery(pendingQ);
  const { data: upcoming } = useSuspenseQuery(upcomingQ);
  const qc = useQueryClient();
  const doCancel = useServerFn(cancelJoinRequest);
  const initialJoin = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("join") ?? ""
    : "";
  const [mode, setMode] = useState<Mode>(initialJoin ? "join" : "none");
  const toggle = (m: Mode) => setMode(prev => prev === m ? "none" : m);

  return (
    <MobileShell clubName="Your Clubhouses" clubKicker="Fairway Club">
      {/* Hero */}
      <section className="px-6 mt-4">
        <div className="bg-white rounded-2xl p-5 shadow-card border border-black/5">
          <p className="text-[10px] uppercase tracking-club text-gold font-bold mb-1">Digital Clubhouse</p>
          <h2 className="font-display text-xl">Where your golf groups live.</h2>
          <p className="text-xs text-muted-foreground mt-2">
            Organise rounds, chat, scoring, trips and a season-long leaderboard — one private clubhouse per group.
          </p>
        </div>
      </section>

      {/* ── CTAs ── */}
      <section className="mt-6 px-6 grid grid-cols-3 gap-2">
        <button
          onClick={() => toggle("create")}
          className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl text-[10px] font-bold uppercase tracking-club border transition-colors ${mode === "create" ? "bg-forest text-cream border-forest" : "bg-white border-border text-charcoal"}`}
        >
          <Plus className={`size-4 ${mode === "create" ? "text-cream" : "text-forest"}`} />
          Create
        </button>
        <button
          onClick={() => toggle("search")}
          className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl text-[10px] font-bold uppercase tracking-club border transition-colors ${mode === "search" ? "bg-forest text-cream border-forest" : "bg-white border-border text-charcoal"}`}
        >
          <Search className={`size-4 ${mode === "search" ? "text-cream" : "text-forest"}`} />
          Find Groups
        </button>
        <button
          onClick={() => toggle("join")}
          className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl text-[10px] font-bold uppercase tracking-club border transition-colors ${mode === "join" ? "bg-forest text-cream border-forest" : "bg-white border-border text-charcoal"}`}
        >
          <KeyRound className={`size-4 ${mode === "join" ? "text-cream" : "text-gold"}`} />
          Invite Code
        </button>
      </section>

      {/* Panels */}
      {mode === "create" && <CreateForm  onDone={() => setMode("none")} />}
      {mode === "join"   && <JoinForm    initialCode={initialJoin} onDone={() => setMode("none")} />}
      {mode === "search" && <GroupSearch onDone={() => setMode("none")} />}

      {/* ── MY CLUBHOUSES ── */}
      <section className="mt-8 px-6">
        <h3 className="font-display text-lg mb-3">My clubhouses</h3>
        <div className="space-y-3">
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              You're not in a clubhouse yet. Find one above, use an invite code, or create your own.
            </p>
          )}
          {groups.map(g => (
            <Link
              key={g.id}
              to="/groups/$gid"
              params={{ gid: g.id }}
              className="flex items-center justify-between bg-white rounded-2xl p-4 border border-black/5 shadow-soft"
            >
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-club text-forest/70 font-bold">
                  {g.role === "admin" ? "Admin" : g.role === "coadmin" ? "Co-admin" : "Member"}
                </p>
                <h3 className="font-semibold text-base truncate">{g.name}</h3>
                {g.kicker && <p className="text-xs text-muted-foreground truncate">{g.kicker}</p>}
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0 ml-3" />
            </Link>
          ))}
        </div>
      </section>

      {/* ── AWAITING APPROVAL ── */}
      {pending.length > 0 && (
        <section className="mt-8 px-6">
          <h3 className="font-display text-lg mb-3">Awaiting approval</h3>
          <div className="space-y-2">
            {pending.map(p => (
              <div key={p.id} className="flex items-center gap-3 bg-paper rounded-2xl px-4 py-3 border border-border">
                <Hourglass className="size-4 text-gold shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{p.groupName}</p>
                  <p className="text-[10px] text-muted-foreground">Waiting for admin approval</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await doCancel({ data: { requestId: p.id } });
                      qc.invalidateQueries({ queryKey: ["my-pending"] });
                      toast.success("Request cancelled");
                    } catch (e: any) { toast.error(e.message); }
                  }}
                  className="size-8 rounded-full bg-destructive/10 text-destructive grid place-items-center shrink-0"
                  aria-label="Cancel request"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── UPCOMING TEE TIMES ── */}
      {upcoming.length > 0 && (
        <section className="mt-8 px-6">
          <h3 className="font-display text-lg mb-3">Upcoming tee times</h3>
          <div className="space-y-2">
            {upcoming.map(t => (
              <Link
                key={t.id}
                to="/groups/$gid/tee-times/$tid"
                params={{ gid: t.groupId, tid: t.id }}
                className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 border border-black/5 shadow-soft"
              >
                <Clock className="size-4 text-gold shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{t.courseName}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {t.groupName} · {fmtDateShort(t.teeAt)}, {fmtTime(t.teeAt)}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 px-6 mb-6">
        <p className="text-[10px] uppercase tracking-club text-muted-foreground text-center flex items-center justify-center gap-2">
          <Users className="size-3" /> Private clubhouses · By invitation
        </p>
      </section>
    </MobileShell>
  );
}

// ─── JOIN WITH INVITE CODE ────────────────────────────────────────────────────
function JoinForm({ onDone, initialCode = "" }: { onDone: () => void; initialCode?: string }) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [busy, setBusy] = useState(false);
  const lookup   = useServerFn(lookupGroupByCode);
  const join     = useServerFn(requestJoinByCode);
  const qc       = useQueryClient();
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const found = await lookup({ data: { code } });
      if (!found) { toast.error("No clubhouse found with that code"); return; }
      await join({ data: { code } });
      toast.success(`Request sent to ${found.name}. An admin will approve you.`);
      qc.invalidateQueries({ queryKey: ["my-groups"] });
      qc.invalidateQueries({ queryKey: ["my-pending"] });
      onDone();
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't request access");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="mx-6 mt-3 bg-white rounded-2xl p-4 border border-border space-y-3">
      <input
        autoFocus
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        placeholder="INVITE CODE"
        className="w-full bg-paper rounded-xl px-4 py-3 text-sm font-mono tracking-widest text-center outline-none focus:ring-2 focus:ring-forest"
      />
      <button
        type="submit"
        disabled={busy || code.length < 3}
        className="w-full bg-forest text-cream py-3 rounded-full text-xs font-bold uppercase tracking-club disabled:opacity-50"
      >
        {busy ? "Requesting…" : "Request access"}
      </button>
    </form>
  );
}

// ─── CREATE CLUBHOUSE ─────────────────────────────────────────────────────────
function CreateForm({ onDone }: { onDone: () => void }) {
  const [name,     setName]     = useState("");
  const [kicker,   setKicker]   = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [busy,     setBusy]     = useState(false);
  const create     = useServerFn(createGroup);
  const setVis     = useServerFn(updateGroupVisibility);
  const qc         = useQueryClient();
  const navigate   = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const g = await create({ data: { name, kicker: kicker || undefined } });
      if (isPublic) {
        await setVis({ data: { groupId: g.id, isPublic: true } }).catch(() => {});
      }
      toast.success(`Clubhouse created — share code ${g.invite_code}`);
      qc.invalidateQueries({ queryKey: ["my-groups"] });
      onDone();
      navigate({ to: "/groups/$gid", params: { gid: g.id } });
    } catch (err: any) {
      toast.error(err.message ?? "Couldn't create clubhouse");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="mx-6 mt-3 bg-white rounded-2xl p-4 border border-border space-y-3">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Clubhouse name (e.g. Saturday Golf)"
        className="w-full bg-paper rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest"
      />
      <input
        value={kicker}
        onChange={e => setKicker(e.target.value)}
        placeholder="Tagline (optional)"
        className="w-full bg-paper rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest"
      />
      {/* Public / Private toggle */}
      <button
        type="button"
        onClick={() => setIsPublic(p => !p)}
        className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors text-sm ${isPublic ? "bg-forest/5 border-forest/30 text-forest" : "bg-paper border-border text-charcoal"}`}
      >
        {isPublic ? <Globe className="size-4 shrink-0" /> : <Lock className="size-4 shrink-0" />}
        <div className="flex-1 text-left">
          <p className="font-semibold text-xs">{isPublic ? "Public group" : "Private group"}</p>
          <p className="text-[10px] text-muted-foreground">
            {isPublic ? "Anyone can find and request to join" : "Invite-only — share your code to invite people"}
          </p>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-club text-muted-foreground">
          {isPublic ? "tap to make private" : "tap to make public"}
        </span>
      </button>
      <button
        type="submit"
        disabled={busy || name.length < 2}
        className="w-full bg-forest text-cream py-3 rounded-full text-xs font-bold uppercase tracking-club disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create clubhouse"}
      </button>
    </form>
  );
}

// ─── GROUP SEARCH ─────────────────────────────────────────────────────────────
type GroupResult = {
  id: string;
  name: string;
  kicker: string | null;
  description: string | null;
  isPublic: boolean;
  location: string | null;
  memberCount: number;
  userIsMember: boolean;
  hasPendingRequest: boolean;
};

function GroupSearch({ onDone }: { onDone: () => void }) {
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState<GroupResult[]>([]);
  const [busy,       setBusy]       = useState(false);
  const [searched,   setSearched]   = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);

  const doSearch    = useServerFn(searchGroups);
  const requestJoin = useServerFn(requestJoinGroupById);
  const qc          = useQueryClient();
  const navigate    = useNavigate();
  const tRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounce search as user types
  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    if (query.length < 1) { setResults([]); setSearched(false); return; }
    tRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await doSearch({ data: { query } });
        setResults(res as GroupResult[]);
        setSearched(true);
      } catch (e: any) {
        toast.error(e.message ?? "Search failed");
      } finally { setBusy(false); }
    }, 400);
    return () => { if (tRef.current) clearTimeout(tRef.current); };
  }, [query, doSearch]);

  const sendRequest = async (groupId: string, groupName: string) => {
    setRequesting(groupId);
    try {
      await requestJoin({ data: { groupId } });
      toast.success(`Request sent to ${groupName} — an admin will approve you.`);
      qc.invalidateQueries({ queryKey: ["my-pending"] });
      setResults(prev => prev.map(r => r.id === groupId ? { ...r, hasPendingRequest: true } : r));
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't send request");
    } finally { setRequesting(null); }
  };

  return (
    <div className="mx-6 mt-3 space-y-3">
      {/* Search box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search groups by name…"
          className="w-full bg-white border border-border rounded-xl pl-9 pr-10 py-3 text-sm outline-none focus:ring-2 focus:ring-forest"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); setResults([]); setSearched(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-charcoal"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {busy && (
        <div className="flex justify-center py-4">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!busy && searched && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4 bg-white rounded-2xl border border-border">
          No groups found for "<span className="font-semibold">{query}</span>".
        </p>
      )}

      {!busy && results.length > 0 && (
        <div className="space-y-2">
          {results.map(g => (
            <GroupCard
              key={g.id}
              group={g}
              requesting={requesting === g.id}
              onNavigate={() => { navigate({ to: "/groups/$gid", params: { gid: g.id } }); onDone(); }}
              onRequest={() => sendRequest(g.id, g.name)}
            />
          ))}
        </div>
      )}

      {!searched && !busy && (
        <p className="text-[10px] text-muted-foreground text-center py-2">
          Type to search public and private groups by name.
        </p>
      )}
    </div>
  );
}

// ─── GROUP CARD ───────────────────────────────────────────────────────────────
function GroupCard({
  group, requesting, onNavigate, onRequest,
}: {
  group: GroupResult;
  requesting: boolean;
  onNavigate: () => void;
  onRequest: () => void;
}) {
  const { name, kicker, description, isPublic, location, memberCount, userIsMember, hasPendingRequest } = group;

  return (
    <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-soft">
      {/* Name + badge */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="font-semibold text-base leading-tight">{name}</h3>
            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${isPublic ? "bg-forest/10 text-forest" : "bg-charcoal/10 text-charcoal/70"}`}>
              {isPublic ? <><Globe className="size-2.5" />Public</> : <><Lock className="size-2.5" />Private</>}
            </span>
          </div>
          {kicker && <p className="text-xs text-muted-foreground truncate">{kicker}</p>}
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-3 flex-wrap">
        <span className="flex items-center gap-1">
          <Users className="size-3" />
          {memberCount} {memberCount === 1 ? "member" : "members"}
        </span>
        {location && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate max-w-[140px]">{location}</span>
          </span>
        )}
      </div>

      {description && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{description}</p>
      )}

      {/* Action button */}
      {userIsMember ? (
        <button
          onClick={onNavigate}
          className="w-full flex items-center justify-center gap-2 bg-forest text-cream py-2.5 rounded-full text-xs font-bold uppercase tracking-club"
        >
          Open clubhouse <ChevronRight className="size-3.5" />
        </button>
      ) : hasPendingRequest ? (
        <div className="flex items-center justify-center gap-2 bg-paper border border-border py-2.5 rounded-full text-xs font-bold uppercase tracking-club text-muted-foreground">
          <Hourglass className="size-3.5 text-gold" /> Request pending
        </div>
      ) : (
        <>
          <button
            onClick={onRequest}
            disabled={requesting}
            className="w-full flex items-center justify-center gap-2 border-2 border-forest text-forest py-2.5 rounded-full text-xs font-bold uppercase tracking-club hover:bg-forest/5 disabled:opacity-50 transition-colors"
          >
            {requesting && <Loader2 className="size-3.5 animate-spin" />}
            {requesting ? "Sending…" : isPublic ? "Request to join" : "Request access"}
          </button>
          {!isPublic && (
            <p className="text-[9px] text-muted-foreground text-center mt-1.5">
              Private group · admin must approve your request
            </p>
          )}
        </>
      )}
    </div>
  );
}
