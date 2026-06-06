import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { listMessages, postMessage } from "@/lib/api.functions";
import { fmtDateShort, fmtTime } from "@/lib/format";
import { toast } from "sonner";

const q = (gid: string) => queryOptions({
  queryKey: ["messages", gid], queryFn: () => listMessages({ data: { groupId: gid } }),
});

export const Route = createFileRoute("/groups/$gid/chat")({
  head: () => ({ meta: [{ title: "Group Chat — Fairway Club" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  loader: ({ context, params }: { context: any; params: { gid: string } }) =>
    context.queryClient.ensureQueryData(q(params.gid)),
  component: Page,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
});

function Page() {
  const { gid }  = Route.useParams();
  const { data } = useSuspenseQuery(q(gid));
  const [body, setBody] = useState("");
  const post = useServerFn(postMessage);
  const qc   = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Real-time subscription ─────────────────────────────────────────────────
  // Appends new rows directly into the React Query cache so the screen updates
  // instantly without a full refetch (no screen jump, no network round-trip).
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${gid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${gid}` },
        (payload: any) => {
          qc.setQueryData(["messages", gid], (old: any[] | undefined) => {
            if (!old) return old;
            // Avoid duplicates (e.g. our own message already added optimistically)
            if (old.some(m => m.id === payload.new.id)) return old;
            return [...old, { ...payload.new, author: "Member" }];
          });
          // Refresh only to resolve the author name (profiles join)
          qc.invalidateQueries({ queryKey: ["messages", gid] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [gid, qc]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody("");
    // Optimistic append — appears instantly
    const tempId = `temp-${Date.now()}`;
    qc.setQueryData(["messages", gid], (old: any[] | undefined) =>
      [...(old ?? []), { id: tempId, body: text, kind: "message", created_at: new Date().toISOString(), author: "You" }]
    );
    try {
      await post({ data: { groupId: gid, body: text } });
      // Replace optimistic with real data
      qc.invalidateQueries({ queryKey: ["messages", gid] });
    } catch (err: any) {
      // Roll back optimistic message on failure
      qc.setQueryData(["messages", gid], (old: any[] | undefined) =>
        (old ?? []).filter((m: any) => m.id !== tempId)
      );
      toast.error(err.message);
      setBody(text);
    }
  };

  return (
    <MobileShell groupId={gid} clubName="Chat" clubKicker="Group conversation" showSwitcher>
      <section className="px-6 -mt-6 space-y-3 pb-32">
        {data.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No messages yet. Say hello!</p>
        )}
        {data.map((m) => (
          <div
            key={m.id}
            className={`rounded-2xl p-3 ${m.kind === "announcement" ? "bg-gold/15 border border-gold/30" : "bg-white border border-border"}`}
          >
            <div className="flex justify-between items-baseline mb-1">
              <p className="text-[11px] font-semibold text-forest">{m.author}</p>
              <p className="text-[9px] uppercase tracking-club text-muted-foreground">{fmtDateShort(m.created_at)} · {fmtTime(m.created_at)}</p>
            </div>
            <p className="text-sm leading-relaxed">{m.body}</p>
          </div>
        ))}
        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </section>

      <form onSubmit={send} className="fixed bottom-20 left-1/2 -translate-x-1/2 w-full max-w-md px-4 pb-2 flex gap-2 bg-cream">
        <input
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Message the group"
          className="flex-1 bg-white border border-border rounded-full px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-forest"
        />
        <button
          type="submit"
          disabled={!body.trim()}
          className="bg-forest text-cream px-5 rounded-full text-xs font-bold uppercase tracking-club disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </MobileShell>
  );
}
