import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { ImageUploadField } from "@/components/ImageUploadField";
import { supabase } from "@/integrations/supabase/client";
import { listTrips, createTrip, getMyProfile } from "@/lib/api.functions";
import { fmtDateShort } from "@/lib/format";
import { toast } from "sonner";
import {
  Plus, ChevronRight, CalendarDays, Users, Loader2, MapPin, Plane, CheckCircle2, Clock,
} from "lucide-react";

// Trips are global, but interest counts are scoped to the current group
const tripsQ = (gid: string) =>
  queryOptions({ queryKey: ["trips-global", gid], queryFn: () => listTrips({ data: { groupId: gid } }) });
const profileQ = queryOptions({ queryKey: ["my-profile"],   queryFn: () => getMyProfile() });

export const Route = createFileRoute("/groups/$gid/trips")({
  head: () => ({ meta: [{ title: "Trips — Fairway Club" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  loader: ({ context, params }: { context: any; params: { gid: string } }) =>
    Promise.all([
      context.queryClient.ensureQueryData(tripsQ(params.gid)),
      context.queryClient.ensureQueryData(profileQ),
    ]),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  open:      { label: "Open",      cls: "bg-forest/10 text-forest" },
  closed:    { label: "Closed",    cls: "bg-charcoal/10 text-charcoal/70" },
  confirmed: { label: "Confirmed", cls: "bg-gold/20 text-amber-700" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
};

function Page() {
  const { gid }       = Route.useParams();
  const { data: trips }   = useSuspenseQuery(tripsQ(gid));
  const { data: profile } = useSuspenseQuery(profileQ);
  const qc            = useQueryClient();
  const isOwner       = !!(profile as any)?.is_app_owner;
  const [creating,    setCreating] = useState(false);

  const upcoming = trips.filter((t: any) => t.status !== "cancelled" && new Date(t.end_date) >= new Date());
  const past     = trips.filter((t: any) => new Date(t.end_date) < new Date() || t.status === "cancelled");

  return (
    <MobileShell groupId={gid} clubName="Trips" clubKicker="Auri Adventures" showSwitcher activeTab="trips">

      {/* Owner-only create button */}
      {isOwner && (
        <section className="px-6 mt-4">
          <button
            onClick={() => setCreating(v => !v)}
            className={`w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-[11px] font-bold uppercase tracking-club transition-colors ${
              creating ? "bg-charcoal text-cream" : "bg-forest text-cream"
            }`}
          >
            <Plus className="size-4" /> {creating ? "Cancel" : "Add new trip"}
          </button>
        </section>
      )}

      {creating && isOwner && (
        <CreateTripForm
          onDone={() => { setCreating(false); qc.invalidateQueries({ queryKey: ["trips-global"] }); }}
        />
      )}

      {/* Auri Adventures brand header */}
      {!creating && (
        <section className="px-6 mt-4">
          <div className="flex items-center gap-3 bg-charcoal text-cream rounded-2xl px-4 py-3">
            <Plane className="size-5 text-gold shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-club text-gold font-bold">Powered by</p>
              <p className="font-display text-base leading-tight">Auri Adventures</p>
              <p className="text-[10px] text-cream/60 mt-0.5">Bespoke golf travel. Curated for your group.</p>
            </div>
          </div>
        </section>
      )}

      {/* Upcoming trips */}
      <section className="px-6 mt-6">
        {upcoming.length === 0 && !creating && (
          <div className="text-center py-10 space-y-2">
            <Plane className="size-8 text-gold/40 mx-auto" />
            <p className="text-sm font-semibold text-charcoal">No trips available yet</p>
            {isOwner
              ? <p className="text-xs text-muted-foreground">Tap "Add new trip" above to publish your first package.</p>
              : <p className="text-xs text-muted-foreground">Check back soon — Auri Adventures is adding new packages.</p>
            }
          </div>
        )}
        <div className="space-y-4">
          {upcoming.map((t: any) => <TripCard key={t.id} trip={t} gid={gid} />)}
        </div>
      </section>

      {/* Past trips */}
      {past.length > 0 && (
        <section className="px-6 mt-8 mb-8">
          <h3 className="text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-3">Past trips</h3>
          <div className="space-y-3">
            {past.map((t: any) => <TripCard key={t.id} trip={t} gid={gid} muted />)}
          </div>
        </section>
      )}
    </MobileShell>
  );
}

// ─── Trip card ───────────────────────────────────────────────────────────────
function TripCard({ trip, gid, muted = false }: { trip: any; gid: string; muted?: boolean }) {
  const s = STATUS_LABELS[trip.status ?? "open"] ?? STATUS_LABELS.open;
  const nights = Math.max(0, Math.round(
    (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000
  ));

  return (
    <Link
      to="/groups/$gid/trips/$tid"
      params={{ gid, tid: trip.id }}
      className={`block rounded-2xl overflow-hidden border shadow-soft ${muted ? "border-border/60 opacity-70" : "border-black/5"}`}
    >
      {trip.cover_url ? (
        <div className="h-40 w-full overflow-hidden">
          <img src={trip.cover_url} alt={trip.destination} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-32 w-full bg-gradient-to-br from-forest to-charcoal flex items-end p-4">
          <MapPin className="size-5 text-gold" />
        </div>
      )}

      <div className="bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${s.cls}`}>{s.label}</span>
          {trip.myStatus && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              {trip.myStatus === "in"
                ? <CheckCircle2 className="size-3.5 text-forest" />
                : <Clock className="size-3.5 text-gold" />}
              {trip.myStatus === "in" ? "You're confirmed" : "You're interested"}
            </span>
          )}
        </div>

        <h3 className="font-display text-lg leading-tight mb-0.5">{trip.destination}</h3>
        <p className="text-xs text-muted-foreground font-semibold mb-3">{trip.name}</p>

        <div className="flex items-center gap-4 text-[11px] text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {fmtDateShort(trip.start_date)} – {fmtDateShort(trip.end_date)}
          </span>
          <span>{nights} night{nights !== 1 ? "s" : ""}</span>
        </div>

        <div className="flex items-center justify-between">
          {trip.interestedCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="size-3.5" /> {trip.interestedCount} interested
            </span>
          )}
          {trip.cost ? (
            <div className="text-right ml-auto">
              <p className="text-[10px] uppercase tracking-club text-muted-foreground">From</p>
              <p className="font-display text-xl text-forest">
                ${Number(trip.cost).toLocaleString()}<span className="text-[11px] font-sans text-muted-foreground"> pp</span>
              </p>
            </div>
          ) : <div />}
        </div>

        <div className="mt-3 flex items-center justify-end gap-1 text-[10px] font-bold uppercase tracking-club text-forest">
          View trip <ChevronRight className="size-3.5" />
        </div>
      </div>
    </Link>
  );
}

// ─── Create form (app owner only) ────────────────────────────────────────────
function CreateTripForm({ onDone }: { onDone: () => void }) {
  const [name,        setName]        = useState("");
  const [destination, setDestination] = useState("");
  const [startDate,   setStartDate]   = useState("");
  const [endDate,     setEndDate]     = useState("");
  const [cost,        setCost]        = useState("");
  const [maxSpots,    setMaxSpots]    = useState("20");
  const [deadline,    setDeadline]    = useState("");
  const [notes,       setNotes]       = useState("");
  const [inclusions,  setInclusions]  = useState("");
  const [golfCourses, setGolfCourses] = useState("");
  const [coverUrl,    setCoverUrl]    = useState("");
  const [busy,        setBusy]        = useState(false);
  const create = useServerFn(createTrip);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await create({
        data: {
          name, destination, startDate, endDate,
          cost: cost ? parseFloat(cost) : undefined,
          maxSpots: parseInt(maxSpots, 10) || 20,
          bookingDeadline: deadline || undefined,
          notes: notes || undefined,
          inclusions: inclusions || undefined,
          golfCourses: golfCourses || undefined,
          coverUrl: coverUrl || undefined,
        },
      });
      toast.success("Trip published to all groups");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't create trip");
    } finally { setBusy(false); }
  };

  const cls = "w-full bg-paper rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest";
  const lbl = "block text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-1.5";

  return (
    <form onSubmit={submit} className="mx-6 mt-4 bg-white rounded-2xl p-5 border border-border space-y-4 shadow-card">
      <p className="text-[10px] uppercase tracking-club text-gold font-bold">Auri Adventures · New trip</p>

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block">
          <span className={lbl}>Trip name</span>
          <input required value={name} onChange={e => setName(e.target.value)} placeholder="St Andrews Golf Classic" className={cls} />
        </label>
        <label className="col-span-2 block">
          <span className={lbl}>Destination</span>
          <input required value={destination} onChange={e => setDestination(e.target.value)} placeholder="St Andrews, Scotland" className={cls} />
        </label>
        <label className="block">
          <span className={lbl}>Start date</span>
          <input required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={cls} />
        </label>
        <label className="block">
          <span className={lbl}>End date</span>
          <input required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={cls} />
        </label>
        <label className="block">
          <span className={lbl}>Price pp ($)</span>
          <input type="number" min={0} step={0.01} value={cost} onChange={e => setCost(e.target.value)} placeholder="1,495" className={cls} />
        </label>
        <label className="block">
          <span className={lbl}>Max spots</span>
          <input type="number" min={1} value={maxSpots} onChange={e => setMaxSpots(e.target.value)} className={cls} />
        </label>
        <label className="block">
          <span className={lbl}>Booking deadline</span>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={cls} />
        </label>
        <label className="col-span-2 block">
          <ImageUploadField label="Cover image" value={coverUrl} onChange={setCoverUrl} />
        </label>
        <label className="col-span-2 block">
          <span className={lbl}>Golf courses</span>
          <input value={golfCourses} onChange={e => setGolfCourses(e.target.value)} placeholder="Old Course, Kingsbarns, Carnoustie" className={cls} />
        </label>
        <label className="col-span-2 block">
          <span className={lbl}>What's included</span>
          <textarea rows={3} value={inclusions} onChange={e => setInclusions(e.target.value)}
            placeholder="5 rounds of golf, 4-star hotel, private transfers…" className={cls} />
        </label>
        <label className="col-span-2 block">
          <span className={lbl}>Overview</span>
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} className={cls} />
        </label>
      </div>

      <button
        type="submit"
        disabled={busy || !name || !destination || !startDate || !endDate}
        className="w-full bg-forest text-cream py-3 rounded-full text-xs font-bold uppercase tracking-club disabled:opacity-50"
      >
        {busy
          ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Publishing…</span>
          : "Publish trip to all groups"}
      </button>
    </form>
  );
}
