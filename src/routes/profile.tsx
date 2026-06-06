import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, updateMyProfile } from "@/lib/api.functions";
import { toast } from "sonner";
import { LogOut, BarChart3 } from "lucide-react";

const q = queryOptions({ queryKey: ["my-profile"], queryFn: () => getMyProfile() });

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — Fairway Club" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  loader: ({ context }: { context: any }) => context.queryClient.ensureQueryData(q),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: profile } = useSuspenseQuery(q);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [handicap, setHandicap] = useState<string>(profile?.handicap?.toString() ?? "");
  const update = useServerFn(updateMyProfile);
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    setName(profile?.display_name ?? "");
    setHandicap(profile?.handicap?.toString() ?? "");
  }, [profile]);

  const save = async () => {
    try {
      await update({ data: { displayName: name, handicap: handicap === "" ? undefined : Number(handicap) } });
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <MobileShell clubName="Profile" clubKicker="Your details">
      <section className="px-6 -mt-6 space-y-3">
        <div className="bg-white rounded-2xl p-5 border border-black/5 shadow-soft space-y-4">
          <Field label="Display name">
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-paper rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest" />
          </Field>
          <Field label="Handicap index">
            <input type="number" min={-5} max={54} step={0.1} value={handicap} onChange={(e) => setHandicap(e.target.value)}
              className="w-full bg-paper rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest" />
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Your WHS handicap index (e.g. 14.2). The app converts this to a course handicap using each tee box's rating and slope — making every game fair regardless of where you play.
            </p>
          </Field>
          <button onClick={save}
            className="w-full bg-forest text-cream py-3 rounded-full text-xs font-bold uppercase tracking-club">
            Save profile
          </button>
        </div>
      </section>

      <section className="px-6 mt-6 space-y-2 mb-6">
        <Link to={"/stats" as any}
          className="w-full flex items-center justify-center gap-2 bg-white border border-border rounded-xl px-4 py-3.5 text-sm">
          <BarChart3 className="size-4" /> View my stats
        </Link>
        <button onClick={signOut}
          className="w-full flex items-center justify-center gap-2 bg-white border border-border rounded-xl px-4 py-3.5 text-sm text-destructive">
          <LogOut className="size-4" /> Sign out
        </button>
      </section>
    </MobileShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-club text-muted-foreground mb-2 font-bold">{label}</span>
      {children}
    </label>
  );
}
