import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MobileShell } from "@/components/MobileShell";
import { listGroupMembers, getGroupHome } from "@/lib/api.functions";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";

const membersQ = (gid: string) =>
  queryOptions({ queryKey: ["members", gid], queryFn: () => listGroupMembers({ data: { groupId: gid } }) });
const homeQ = (gid: string) =>
  queryOptions({ queryKey: ["group-home", gid], queryFn: () => getGroupHome({ data: { groupId: gid } }) });

export const Route = createFileRoute("/groups/$gid/members")({
  head: () => ({ meta: [{ title: "Members — Clubhouse" }] }),
  loader: ({ context, params }: { context: any; params: { gid: string } }) =>
    Promise.all([
      context.queryClient.ensureQueryData(membersQ(params.gid)),
      context.queryClient.ensureQueryData(homeQ(params.gid)),
    ]),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

const ROLE_LABEL: Record<string, string> = { admin: "Admin", coadmin: "Co-Admin", member: "Member" };
const ROLE_ORDER: Record<string, number> = { admin: 0, coadmin: 1, member: 2 };

function Page() {
  const { gid } = Route.useParams();
  const { data: members } = useSuspenseQuery(membersQ(gid));
  const { data: home } = useSuspenseQuery(homeQ(gid));
  const sorted = [...members].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.name.localeCompare(b.name),
  );

  const code = home.group.invite_code ?? "";
  const [link, setLink] = useState("");
  useEffect(() => {
    if (code) setLink(`${window.location.origin}/?join=${code}`);
  }, [code]);

  const copy = async (t: string, label: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
      } else {
        const el = document.createElement("textarea");
        el.value = t;
        el.style.cssText = "position:fixed;opacity:0;top:0;left:0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(el);
        if (!ok) throw new Error("execCommand failed");
      }
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy — please copy manually");
    }
  };
  const share = async () => {
    const text = `Join "${home.group.name}" on Fairway Club. Code: ${code}\n${link}`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try { await (navigator as any).share({ title: home.group.name, text, url: link }); } catch {}
    } else copy(text, "Invite");
  };

  return (
    <MobileShell groupId={gid} clubName={home.group.name} clubKicker="Members" showSwitcher activeTab="members">
      {code && (
        <section className="px-6 mt-4">
          <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-soft">
            <p className="text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-2">
              Invite a friend
            </p>
            <div className="flex items-center gap-2">
              <p className="flex-1 font-mono text-lg tracking-widest text-forest bg-paper rounded-xl py-2 px-3 text-center">
                {code}
              </p>
              <button onClick={() => copy(code, "Code")}
                className="size-10 rounded-xl bg-paper border border-border grid place-items-center" aria-label="Copy code">
                <Copy className="size-4" />
              </button>
              <button onClick={share}
                className="size-10 rounded-xl bg-forest text-cream grid place-items-center" aria-label="Share">
                <Share2 className="size-4" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Friends request to join — admins approve.
            </p>
          </div>
        </section>
      )}

      <section className="px-6 mt-4 mb-8">
        <p className="text-[10px] uppercase tracking-club text-muted-foreground mb-3">
          {members.length} member{members.length === 1 ? "" : "s"}
        </p>
        <div className="bg-white rounded-2xl border border-black/5 shadow-soft divide-y divide-border/60">
          {sorted.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 px-4 py-3">
              <div className="size-10 rounded-full bg-paper grid place-items-center text-xs font-bold text-forest">
                {(m.name ?? "·").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{m.name}</p>
                <p className="text-[10px] uppercase tracking-club text-muted-foreground">
                  {ROLE_LABEL[m.role] ?? m.role}
                  {m.handicap != null ? ` · HCP ${m.handicap}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </MobileShell>
  );
}
