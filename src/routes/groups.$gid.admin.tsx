import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import {
  listJoinRequests, decideJoinRequest, listGroupMembers,
  setMemberRole, rotateInviteCode, getGroupHome, removeMember,
} from "@/lib/api.functions";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Check, X, RefreshCw, Copy, Share2, Link2, Trash2, CheckCircle2 } from "lucide-react";

const reqsQ = (gid: string) => queryOptions({
  queryKey: ["join-reqs", gid], queryFn: () => listJoinRequests({ data: { groupId: gid } }),
});
const membersQ = (gid: string) => queryOptions({
  queryKey: ["members", gid], queryFn: () => listGroupMembers({ data: { groupId: gid } }),
});
const groupQ = (gid: string) => queryOptions({
  queryKey: ["group-home", gid], queryFn: () => getGroupHome({ data: { groupId: gid } }),
});

export const Route = createFileRoute("/groups/$gid/admin")({
  head: () => ({ meta: [{ title: "Group Admin — Fairway Club" }] }),
  beforeLoad: async ({ params }: { params: { gid: string } }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) throw redirect({ to: "/auth" });

    // Guard: only admins and co-admins may access this route.
    // Non-members who navigate here directly get redirected to the group overview.
    const { data: membership } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", params.gid)
      .eq("user_id", sessionData.session.user.id)
      .single();

    const role = (membership as any)?.role ?? "";
    if (!["admin", "coadmin"].includes(role)) {
      throw redirect({ to: "/groups/$gid", params: { gid: params.gid } });
    }
  },
  loader: ({ context, params }: { context: any; params: { gid: string } }) =>
    Promise.all([
      context.queryClient.ensureQueryData(reqsQ(params.gid)),
      context.queryClient.ensureQueryData(membersQ(params.gid)),
      context.queryClient.ensureQueryData(groupQ(params.gid)),
    ]),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

const ROLE_LABEL: Record<string, string> = { admin: "Admin", coadmin: "Co-Admin", member: "Member" };

function Page() {
  const { gid } = Route.useParams();
  const { data: requests } = useSuspenseQuery(reqsQ(gid));
  const { data: members } = useSuspenseQuery(membersQ(gid));
  const { data: home } = useSuspenseQuery(groupQ(gid));
  const decide = useServerFn(decideJoinRequest);
  const role = useServerFn(setMemberRole);
  const rotate = useServerFn(rotateInviteCode);
  const remove = useServerFn(removeMember);
  const qc = useQueryClient();

  const pending = requests.filter((r) => r.status === "pending");
  const code = home.group.invite_code ?? "";
  const [inviteLink, setInviteLink] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  // Build the invite link client-side
  useEffect(() => {
    if (code) setInviteLink(`${window.location.origin}/?join=${code}`);
  }, [code]);

  // Auto-generate a code if none exists
  useEffect(() => {
    if (!code) {
      rotate({ data: { groupId: gid } })
        .then(() => { qc.invalidateQueries({ queryKey: ["group-home", gid] }); })
        .catch(() => {});
    }
  }, [code]); // eslint-disable-line

  // Most reliable copy: select the input text and use execCommand.
  // Works on HTTP, HTTPS, mobile, desktop — no permissions required.
  const copyRef = (ref: React.RefObject<HTMLInputElement>, label: string, setFlag: (v: boolean) => void) => {
    const el = ref.current;
    if (!el || !el.value) return;
    el.focus();
    el.select();
    el.setSelectionRange(0, 99999);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    if (!ok) {
      // Final fallback: modern clipboard API
      navigator.clipboard?.writeText(el.value).catch(() => {});
    }
    toast.success(`${label} copied`);
    setFlag(true);
    setTimeout(() => setFlag(false), 2000);
  };

  const share = async () => {
    const msg = `Join "${home.group.name}" on Fairway Club.\nInvite code: ${code}\n${inviteLink}`;
    if ((navigator as any).share) {
      try { await (navigator as any).share({ title: home.group.name, text: msg, url: inviteLink }); return; }
      catch {}
    }
    // Fallback: copy the whole message
    copyRef(linkRef, "Invite link", setLinkCopied);
  };

  return (
    <MobileShell groupId={gid} clubName="Admin" clubKicker={home.group.name} showSwitcher activeTab="admin">
      {/* INVITE SECTION */}
      <section className="px-6 mt-4">
        <h3 className="text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-2">
          Invite people
        </h3>
        <div className="bg-white rounded-2xl p-5 border border-black/5 shadow-soft space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-1.5">
              Invite code
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={codeRef}
                readOnly
                value={code}
                className="flex-1 font-mono text-2xl tracking-widest text-forest bg-paper rounded-xl py-2 px-3 text-center outline-none select-all"
              />
              <button
                onClick={() => copyRef(codeRef, "Code", setCodeCopied)}
                disabled={!code}
                className="size-11 rounded-xl bg-paper border border-border grid place-items-center disabled:opacity-40"
                aria-label="Copy code"
              >
                {codeCopied ? <CheckCircle2 className="size-4 text-forest" /> : <Copy className="size-4" />}
              </button>
              <button
                onClick={async () => {
                  try {
                    await rotate({ data: { groupId: gid } });
                    qc.invalidateQueries({ queryKey: ["group-home", gid] });
                    qc.invalidateQueries({ queryKey: ["my-groups"] });
                    toast.success("New invite code generated");
                  } catch (e: any) { toast.error(e.message); }
                }}
                className="size-11 rounded-xl bg-paper border border-border grid place-items-center"
                aria-label="Rotate code"
              >
                <RefreshCw className="size-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-1.5">
              Invite link
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={linkRef}
                readOnly
                value={inviteLink}
                className="flex-1 text-xs text-muted-foreground bg-paper rounded-xl py-2.5 px-3 truncate outline-none"
              />
              <button
                onClick={() => copyRef(linkRef, "Link", setLinkCopied)}
                disabled={!inviteLink}
                className="size-11 rounded-xl bg-paper border border-border grid place-items-center disabled:opacity-40"
                aria-label="Copy link"
              >
                {linkCopied ? <CheckCircle2 className="size-4 text-forest" /> : <Link2 className="size-4" />}
              </button>
            </div>
          </div>

          <button
            onClick={share}
            disabled={!code}
            className="w-full flex items-center justify-center gap-2 bg-forest text-cream py-3 rounded-full text-xs font-bold uppercase tracking-club disabled:opacity-50"
          >
            <Share2 className="size-4" /> Share invite
          </button>
          <p className="text-[10px] text-muted-foreground text-center">
            Anyone with the code can request to join — you approve below.
          </p>
        </div>
      </section>

      {/* PENDING REQUESTS */}
      <section className="px-6 mt-6">
        <h3 className="text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-2">
          Pending requests ({pending.length})
        </h3>
        {pending.length === 0 && (
          <p className="text-xs text-muted-foreground bg-white border border-border rounded-xl p-3">
            No pending requests.
          </p>
        )}
        <div className="space-y-2">
          {pending.map((r) => (
            <div key={r.id} className="bg-white border border-border rounded-xl p-3 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {r.requester_name ?? r.invited_name ?? r.invited_email ?? "Unknown"}
                </p>
                {r.note && <p className="text-[11px] text-muted-foreground truncate">"{r.note}"</p>}
              </div>
              <button
                onClick={async () => {
                  await decide({ data: { requestId: r.id, approve: true } });
                  qc.invalidateQueries({ queryKey: ["join-reqs", gid] });
                  qc.invalidateQueries({ queryKey: ["members", gid] });
                  toast.success("Approved");
                }}
                className="size-9 rounded-full bg-forest text-cream grid place-items-center"
                aria-label="Approve"
              >
                <Check className="size-4" />
              </button>
              <button
                onClick={async () => {
                  await decide({ data: { requestId: r.id, approve: false } });
                  qc.invalidateQueries({ queryKey: ["join-reqs", gid] });
                  toast.success("Declined");
                }}
                className="size-9 rounded-full bg-paper border border-border grid place-items-center"
                aria-label="Decline"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* MEMBERS */}
      <section className="px-6 mt-6 mb-6">
        <h3 className="text-[10px] uppercase tracking-club text-muted-foreground font-bold mb-2">
          Members ({members.length})
        </h3>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.userId} className="bg-white border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{m.name}</p>
                <p className="text-[10px] uppercase tracking-club text-muted-foreground">
                  {ROLE_LABEL[m.role] ?? m.role}
                  {m.handicap != null ? ` · HCP ${m.handicap}` : ""}
                </p>
              </div>
              {m.role !== "admin" && (
                <>
                  <button
                    onClick={async () => {
                      try {
                        await role({ data: { groupId: gid, userId: m.userId, role: m.role === "coadmin" ? "member" : "coadmin" } });
                        qc.invalidateQueries({ queryKey: ["members", gid] });
                        toast.success("Role updated");
                      } catch (e: any) { toast.error(e.message); }
                    }}
                    className="text-[10px] font-bold uppercase tracking-club text-gold px-2"
                  >
                    {m.role === "coadmin" ? "Demote" : "Make co-admin"}
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Remove ${m.name} from the group?`)) return;
                      try {
                        await remove({ data: { groupId: gid, userId: m.userId } });
                        qc.invalidateQueries({ queryKey: ["members", gid] });
                        toast.success("Member removed");
                      } catch (e: any) { toast.error(e.message); }
                    }}
                    className="size-8 rounded-full bg-paper border border-border grid place-items-center text-destructive"
                    aria-label="Remove member"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </MobileShell>
  );
}
