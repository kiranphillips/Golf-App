import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { ImageUploadField } from "@/components/ImageUploadField";
import { supabase } from "@/integrations/supabase/client";
import { getTrip, expressInterest, withdrawInterest, confirmTripMember, unconfirmTripMember, updateTrip, deleteTrip } from "@/lib/api.functions";
import { fmtDateShort } from "@/lib/format";
import { toast } from "sonner";
import {
  ChevronLeft, MapPin, CalendarDays, Users, CheckCircle2, Clock,
  Phone, Star, Loader2, Pencil, Globe, GolfIcon, Trash2,
} from "lucide-react";

const q = (tid: string) =>
  queryOptions({ queryKey: ["trip", tid], queryFn: () => getTrip({ data: { tripId: tid } }) });

export const Route = createFileRoute("/groups/$gid/trips_/$tid")({
  head: () => ({ meta: [{ title: "Trip — Fairway Club" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  loader: ({ context, params }: { context: any; params: { tid: string } }) =>
    context.queryClient.ensureQueryData(q(params.tid)),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  open:      { label: "Open for interest", bg: "bg-forest",      text: "text-cream" },
  closed:    { label: "Closed",            bg: "bg-charcoal",    text: "text-cream" },
  confirmed: { label: "Confirmed",         bg: "bg-gold",        text: "text-charcoal" },
  cancelled: { label: "Cancelled",         bg: "bg-destructive", text: "text-white" },
};

function Page() {
  const { gid, tid } = Route.useParams();
  const { data }     = useSuspenseQuery(q(tid));
  const qc           = useQueryClient();
  const navigate     = useNavigate();
  const [editing,    setEditing]    = useState(false);
  const [interestBusy, setInterestBusy] = useState(false);
  const [note,       setNote]       = useState(data.myNote ?? "");
  const [showNote,   setShowNote]   = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const doInterest  = useServerFn(expressInterest);
  const doWithdraw  = useServerFn(withdrawInterest);
  const doConfirm   = useServerFn(confirmTripMember);
  const doUnconfirm = useServerFn(unconfirmTripMember);
  const doDelete    = useServerFn(deleteTrip);

  const trip    = data.trip as any;
  const myStatus = data.myStatus;
  const isAdmin  = data.isAdmin;
  const sc = STATUS_CONFIG[trip.status ?? "open"] ?? STATUS_CONFIG.open;

  const nights  = Math.max(0, Math.round((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000));
  const highlights: string[] = Array.isArray(trip.highlights) ? trip.highlights : [];
  const itinerary: { day: number; title: string; description: string }[] =
    Array.isArray(trip.itinerary) ? trip.itinerary : [];

  const handleInterest = async () => {
    setInterestBusy(true);
    try {
      if (myStatus === "maybe" || myStatus === "in") {
        await doWithdraw({ data: { tripId: tid } });
        toast.success("Interest withdrawn");
      } else {
        await doInterest({ data: { tripId: tid, groupId: gid, note: note || undefined } });
        toast.success("Interest registered! Auri Adventures will be in touch.");
      }
      qc.invalidateQueries({ queryKey: ["trip", tid] });
      qc.invalidateQueries({ queryKey: ["trips-global"] });
    } catch (e: any) { toast.error(e.message ?? "Couldn't update interest"); }
    finally { setInterestBusy(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this trip? This cannot be undone.")) return;
    setDeleteBusy(true);
    try {
      await doDelete({ data: { tripId: tid } });
      toast.success("Trip deleted");
      qc.invalidateQueries({ queryKey: ["trips-global"] });
      navigate({ to: "/groups/$gid/trips", params: { gid } });
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't delete trip");
      setDeleteBusy(false);
    }
  };

  const handleConfirm = async (memberId: string, name: string) => {
    try {
      await doConfirm({ data: { tripId: tid, memberId } });
      toast.success(`${name} confirmed`);
      qc.invalidateQueries({ queryKey: ["trip", tid] });
    } catch (e: any) { toast.error(e.message); }
  };

  const handleUnconfirm = async (memberId: string, name: string) => {
    try {
      await doUnconfirm({ data: { tripId: tid, memberId } });
      toast.success(`${name} unconfirmed`);
      qc.invalidateQueries({ queryKey: ["trip", tid] });
    } catch (e: any) { toast.error(e.message); }
  };

  const isOpen = trip.status === "open";
  const alreadyInterested = myStatus === "maybe" || myStatus === "in";

  return (
    <MobileShell groupId={gid} hideHeader>
      {/* ── HERO ── */}
      <div className="relative">
        {trip.cover_url ? (
          <div className="h-56 w-full overflow-hidden">
            <img src={trip.cover_url} alt={trip.destination} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 to-transparent" />
          </div>
        ) : (
          <div className="h-44 w-full bg-gradient-to-br from-forest via-charcoal to-black" />
        )}

        {/* Back button */}
        <Link
          to="/groups/$gid/trips"
          params={{ gid }}
          className="absolute top-12 left-5 size-9 rounded-full bg-black/30 backdrop-blur-sm grid place-items-center text-white"
        >
          <ChevronLeft className="size-5" />
        </Link>

        {/* Admin edit / delete */}
        {isAdmin && (
          <div className="absolute top-12 right-5 flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={deleteBusy}
              className="size-9 rounded-full bg-black/30 backdrop-blur-sm grid place-items-center text-white disabled:opacity-60"
            >
              {deleteBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </button>
            <button
              onClick={() => setEditing(v => !v)}
              className="size-9 rounded-full bg-black/30 backdrop-blur-sm grid place-items-center text-white"
            >
              <Pencil className="size-4" />
            </button>
          </div>
        )}

        {/* Status pill */}
        <div className="absolute bottom-4 left-5">
          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${sc.bg} ${sc.text}`}>
            {sc.label}
          </span>
        </div>
      </div>

      {/* ── TITLE BLOCK ── */}
      <div className="px-5 pt-4 pb-3 bg-white border-b border-border">
        <p className="text-[10px] uppercase tracking-club text-gold font-bold mb-1">{trip.agency_name ?? "Auri Adventures"}</p>
        <h1 className="font-display text-2xl leading-tight">{trip.destination}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{trip.name}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5 shrink-0" />
            {fmtDateShort(trip.start_date)} – {fmtDateShort(trip.end_date)} · {nights} night{nights !== 1 ? "s" : ""}
          </span>
          {trip.max_spots && (
            <span className="flex items-center gap-1">
              <Users className="size-3.5 shrink-0" /> {data.members.length} / {trip.max_spots} interested
            </span>
          )}
          {trip.booking_deadline && (
            <span className="flex items-center gap-1 text-amber-600 font-semibold">
              <Clock className="size-3.5 shrink-0" /> Deadline {fmtDateShort(trip.booking_deadline)}
            </span>
          )}
        </div>
      </div>

      {/* ── EDIT FORM ── */}
      {editing && isAdmin && (
        <EditTripForm
          trip={trip}
          onDone={() => { setEditing(false); qc.invalidateQueries({ queryKey: ["trip", tid] }); qc.invalidateQueries({ queryKey: ["trips-global"] }); }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* ── PRICE + CTA ── */}
      {!editing && (
        <div className="px-5 py-4 bg-paper border-b border-border flex items-center justify-between gap-4">
          <div>
            {trip.cost ? (
              <>
                <p className="text-[10px] uppercase tracking-club text-muted-foreground">Price per person</p>
                <p className="font-display text-3xl text-forest">${Number(trip.cost).toLocaleString()}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Price on request</p>
            )}
          </div>

          {/* Interest button */}
          {isOpen && (
            <div className="flex flex-col items-end gap-1.5">
              {!alreadyInterested && !showNote && (
                <button
                  onClick={() => setShowNote(true)}
                  className="px-5 py-2.5 bg-forest text-cream rounded-full text-xs font-bold uppercase tracking-club"
                >
                  I'm interested
                </button>
              )}
              {!alreadyInterested && showNote && (
                <div className="flex flex-col gap-2 items-end">
                  <p className="w-52 text-[10px] text-muted-foreground text-right leading-snug">
                    Auri Adventures will email you to confirm your spot and share full trip details.
                  </p>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Any notes? (dietary, room preference…)"
                    className="w-52 bg-white border border-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-forest"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowNote(false)} className="px-3 py-2 border border-border rounded-full text-[10px] font-bold uppercase tracking-club">
                      Back
                    </button>
                    <button
                      onClick={handleInterest}
                      disabled={interestBusy}
                      className="px-4 py-2 bg-forest text-cream rounded-full text-[10px] font-bold uppercase tracking-club disabled:opacity-60 flex items-center gap-1"
                    >
                      {interestBusy && <Loader2 className="size-3 animate-spin" />} Register interest
                    </button>
                  </div>
                </div>
              )}
              {alreadyInterested && (
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-forest">
                    <CheckCircle2 className="size-4" />
                    {myStatus === "in" ? "Confirmed" : "Interested"}
                  </div>
                  <button
                    onClick={handleInterest}
                    disabled={interestBusy}
                    className="text-[10px] text-muted-foreground underline underline-offset-2 disabled:opacity-60"
                  >
                    {interestBusy ? "Updating…" : "Withdraw interest"}
                  </button>
                </div>
              )}
            </div>
          )}
          {!isOpen && alreadyInterested && (
            <div className="flex items-center gap-2 text-xs font-bold text-forest">
              <CheckCircle2 className="size-4" />
              {myStatus === "in" ? "You're confirmed" : "Interest logged"}
            </div>
          )}
        </div>
      )}

      {/* ── BODY ── */}
      {!editing && (
        <div className="pb-10 space-y-0">
          {/* Overview */}
          {trip.notes && (
            <Section title="Overview">
              <p className="text-sm leading-relaxed text-charcoal">{trip.notes}</p>
            </Section>
          )}

          {/* Highlights */}
          {highlights.length > 0 && (
            <Section title="Highlights">
              <ul className="space-y-2">
                {highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Star className="size-3.5 text-gold shrink-0 mt-0.5" />
                    {h}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Golf courses */}
          {trip.golf_courses && (
            <Section title="Golf courses">
              <p className="text-sm text-charcoal">{trip.golf_courses}</p>
            </Section>
          )}

          {/* Itinerary */}
          {itinerary.length > 0 && (
            <Section title="Day by day">
              <div className="space-y-4">
                {itinerary.map((d) => (
                  <div key={d.day} className="flex gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-full bg-forest/10 text-forest flex items-center justify-center text-[11px] font-bold">
                      D{d.day}
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{d.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{d.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* What's included */}
          {trip.inclusions && (
            <Section title="What's included">
              <p className="text-sm leading-relaxed whitespace-pre-line text-charcoal">{trip.inclusions}</p>
            </Section>
          )}

          {/* Interested members */}
          {data.members.length > 0 && (
            <Section title={`Interested · ${data.members.length}`}>
              <div className="space-y-2">
                {data.members.map((m: any) => (
                  <div key={m.userId} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-8 rounded-full bg-paper border border-border grid place-items-center text-[10px] font-semibold text-charcoal shrink-0">
                        {m.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{m.name}</p>
                        {m.note && <p className="text-[10px] text-muted-foreground truncate">{m.note}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.status === "in" ? (
                        <>
                          <span className="flex items-center gap-1 text-[10px] font-bold text-forest">
                            <CheckCircle2 className="size-3.5" /> Confirmed
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => handleUnconfirm(m.userId, m.name)}
                              className="px-2.5 py-1 bg-paper border border-border text-charcoal rounded-full text-[9px] font-bold uppercase tracking-club"
                            >
                              Unconfirm
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] text-muted-foreground font-semibold">Interested</span>
                          {isAdmin && (
                            <button
                              onClick={() => handleConfirm(m.userId, m.name)}
                              className="px-2.5 py-1 bg-forest text-cream rounded-full text-[9px] font-bold uppercase tracking-club"
                            >
                              Confirm
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Contact Auri Adventures */}
          <Section title="Organised by">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-charcoal grid place-items-center shrink-0">
                <Globe className="size-5 text-gold" />
              </div>
              <div>
                <p className="font-semibold text-sm">{trip.agency_name ?? "Auri Adventures"}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Bespoke golf travel for private groups</p>
                {trip.agency_contact && (
                  <p className="text-xs text-forest font-semibold mt-1 flex items-center gap-1">
                    <Phone className="size-3" /> {trip.agency_contact}
                  </p>
                )}
              </div>
            </div>
          </Section>
        </div>
      )}
    </MobileShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-5 border-b border-border/60">
      <h2 className="text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-3">{title}</h2>
      {children}
    </div>
  );
}

// ─── EDIT FORM (admin) ────────────────────────────────────────────────────────
function EditTripForm({ trip, onDone, onCancel }: { trip: any; onDone: () => void; onCancel: () => void }) {
  const [name,        setName]        = useState(trip.name ?? "");
  const [destination, setDestination] = useState(trip.destination ?? "");
  const [startDate,   setStartDate]   = useState(trip.start_date ?? "");
  const [endDate,     setEndDate]     = useState(trip.end_date ?? "");
  const [cost,        setCost]        = useState(trip.cost?.toString() ?? "");
  const [maxSpots,    setMaxSpots]    = useState(trip.max_spots?.toString() ?? "20");
  const [deadline,    setDeadline]    = useState(trip.booking_deadline ?? "");
  const [notes,       setNotes]       = useState(trip.notes ?? "");
  const [inclusions,  setInclusions]  = useState(trip.inclusions ?? "");
  const [golfCourses, setGolfCourses] = useState(trip.golf_courses ?? "");
  const [coverUrl,    setCoverUrl]    = useState(trip.cover_url ?? "");
  const [status,      setStatus]      = useState(trip.status ?? "open");
  const [busy,        setBusy]        = useState(false);
  const update = useServerFn(updateTrip);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await update({
        data: {
          tripId: trip.id, name, destination, startDate, endDate,
          cost: cost ? parseFloat(cost) : undefined,
          maxSpots: parseInt(maxSpots, 10) || 20,
          bookingDeadline: deadline || undefined,
          notes: notes || undefined,
          inclusions: inclusions || undefined,
          golfCourses: golfCourses || undefined,
          coverUrl: coverUrl || undefined,
          status: status as any,
        },
      });
      toast.success("Trip updated");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't update trip");
    } finally { setBusy(false); }
  };

  const cls = "w-full bg-paper rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest";
  const lbl = "block text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-1.5";

  return (
    <form onSubmit={submit} className="mx-5 my-4 bg-white rounded-2xl p-5 border border-border space-y-4 shadow-card">
      <p className="text-[10px] uppercase tracking-club text-gold font-bold">Edit trip</p>

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block">
          <span className={lbl}>Trip name</span>
          <input required value={name} onChange={e => setName(e.target.value)} className={cls} />
        </label>
        <label className="col-span-2 block">
          <span className={lbl}>Destination</span>
          <input required value={destination} onChange={e => setDestination(e.target.value)} className={cls} />
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
          <input type="number" min={0} step={0.01} value={cost} onChange={e => setCost(e.target.value)} className={cls} />
        </label>
        <label className="block">
          <span className={lbl}>Max spots</span>
          <input type="number" min={1} value={maxSpots} onChange={e => setMaxSpots(e.target.value)} className={cls} />
        </label>
        <label className="block">
          <span className={lbl}>Booking deadline</span>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={cls} />
        </label>
        <label className="block">
          <span className={lbl}>Status</span>
          <select value={status} onChange={e => setStatus(e.target.value)} className={cls}>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="col-span-2 block">
          <ImageUploadField label="Cover image" value={coverUrl} onChange={setCoverUrl} />
        </label>
        <label className="col-span-2 block">
          <span className={lbl}>Golf courses</span>
          <input value={golfCourses} onChange={e => setGolfCourses(e.target.value)} className={cls} />
        </label>
        <label className="col-span-2 block">
          <span className={lbl}>What's included</span>
          <textarea rows={3} value={inclusions} onChange={e => setInclusions(e.target.value)} className={cls} />
        </label>
        <label className="col-span-2 block">
          <span className={lbl}>Overview</span>
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} className={cls} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button type="button" onClick={onCancel} className="rounded-full border border-border bg-paper py-3 text-xs font-bold uppercase tracking-club">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="rounded-full bg-forest text-cream py-3 text-xs font-bold uppercase tracking-club disabled:opacity-50">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
