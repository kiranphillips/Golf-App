import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MobileShell } from "@/components/MobileShell";
import { listGroupMembers, getGroupHome } from "@/lib/api.functions";
import { Copy, Share2, Link2, CheckCircle2 } from "lucide-react";
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
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (code) setLink(`${window.location.origin}/?join=${code}`);
  }, [code]);

  const copyRef = (ref: React.RefObject<HTMLInputElement>, label: string, setFlag: (v: boolean) => void) => {
    const el = ref.current;
    if (!el || !el.value) return;
    el.focus();
    el.select();
    el.setSelectionRange(0, 99999);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    if (!ok) navigator.clipboard?.writeText(el.value).catch(() => {});
    toast.success(`${label} copied`);
    setFlag(true);
    setTimeout(() => setFlag(false), 2000);
  };

  const share = async () => {
    const text = `Join "${home.group.name}" on Fairway Club.\nInvite code: ${code}\n${link}`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try { await (navigator as any).share({ title: home.group.name, text, url: link }); return; } catch {}
    }
    copyRef(linkRef, "Invite link", setLinkCopied);
  };

  return (
    <MobileShell groupId={gid} clubName={home.group.name} clubKicker="Members" showSwitcher activeTab="members">
      {code && (
        <section className="px-6 mt-4">
          <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-soft space-y-3">
            <p className="text-[10px] uppercase tracking-club text-muted-foreground font-bold">
              Invite a friend
            </p>
            {/* Invite code row */}
            <div className="flex items-center gap-2">
              <input
                ref={codeRef}
                readOnly
                value={code}
                className="flex-1 font-mono text-lg tracking-widest text-forest bg-paper rounded-xl py-2 px-3 text-center outline-none"
              />
              <button onClick={() => copyRef(codeRef, "Code", setCodeCopied)}
                className="size-10 rounded-xl bg-paper border border-border grid place-items-center" aria-label="Copy code">
                {codeCopied ? <CheckCircle2 className="size-4 text-forest" /> : <Copy className="size-4" />}
              </button>
            </div>
            {/* Invite link row */}
            <div className="flex items-center gap-2">
              <input
                ref={linkRef}
                readOnly
                value={link}
                className="flex-1 text-xs text-muted-foreground bg-paper rounded-xl py-2.5 px-3 truncate outline-none"
              />
              <button onClick={() => copyRef(linkRef, "Link", setLinkCopied)}
                disabled={!link}
                className="size-10 rounded-xl bg-paper border border-border grid place-items-center disabled:opacity-40" aria-label="Copy link">
                {linkCopied ? <CheckCircle2 className="size-4 text-forest" /> : <Link2 className="size-4" />}
              </button>
            </div>
            {/* Share button */}
            <button onClick={share}
              className="w-full flex items-center justify-center gap-2 bg-forest text-cream py-2.5 rounded-full text-xs font-bold uppercase tracking-club">
              <Share2 className="size-4" /> Share invite
            </button>
            <p className="text-[10px] text-muted-foreground text-center">
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
