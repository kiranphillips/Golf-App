import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { supabase } from "@/integrations/supabase/client";
import { listMessages, postMessage } from "@/lib/api.functions";
import { fmtDateShort, fmtTime } from "@/lib/format";
import { toast } from "sonner";
import {
  CalendarDays, Bell, Trash2, Zap, Megaphone, Info,
} from "lucide-react";

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

// ── helpers ───────────────────────────────────────────────────────────────────
function dayKey(iso: string) {
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

function friendlyDay(iso: string) {
  const d = new Date(iso);
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d.toISOString()) === dayKey(today.toISOString()))     return "Today";
  if (dayKey(d.toISOString()) === dayKey(yesterday.toISOString())) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// Parse the special body prefixes used by system events
function parseSystemBody(body: string): { icon: React.ReactNode; text: string } | null {
  if (body.startsWith("casual_round_started:")) {
    const course = body.replace("casual_round_started:", "");
    return { icon: <Zap className="size-3.5 text-gold shrink-0" />, text: `Started a casual round at ${course}` };
  }
  if (/^New tee time scheduled:/i.test(body)) {
    return { icon: <CalendarDays className="size-3.5 text-forest shrink-0" />, text: body };
  }
  if (/^Tee time (updated|cancelled)/i.test(body)) {
    return { icon: <CalendarDays className="size-3.5 text-muted-foreground shrink-0" />, text: body };
  }
  if (/^(Friendly reminder|RSVP)/i.test(body)) {
    return { icon: <Bell className="size-3.5 text-gold shrink-0" />, text: body };
  }
  if (/^Tee time cancelled/i.test(body)) {
    return { icon: <Trash2 className="size-3.5 text-destructive shrink-0" />, text: body };
  }
  // Generic announcement fallback
  return { icon: <Info className="size-3.5 text-muted-foreground shrink-0" />, text: body };
}

// ── subcomponents ─────────────────────────────────────────────────────────────
function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-border/60" />
      <span className="text-[10px] uppercase tracking-club text-muted-foreground font-bold shrink-0">{label}</span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

function SystemPill({ icon, text, author, time }: { icon: React.ReactNode; text: string; author: string; time: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-1">
      <div className="flex items-center gap-2 bg-paper border border-border/50 rounded-full px-3 py-1.5 max-w-[90%]">
        {icon}
        <span className="text-[11px] text-muted-foreground leading-snug text-center">{text}</span>
      </div>
      <span className="text-[9px] text-muted-foreground/60">{author} · {time}</span>
    </div>
  );
}

function ChatBubble({ author, body, time, isMe }: { author: string; body: string; time: string; isMe: boolean }) {
  return (
    <div className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      {!isMe && (
        <div className="size-8 rounded-full bg-forest/10 grid place-items-center text-[10px] font-bold text-forest shrink-0 mt-1">
          {author.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
        {!isMe && (
          <span className="text-[10px] font-semibold text-forest/80 px-1">{author}</span>
        )}
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isMe
            ? "bg-forest text-cream rounded-tr-sm"
            : "bg-white border border-border/60 text-charcoal rounded-tl-sm"
        }`}>
          {body}
        </div>
        <span className={`text-[9px] text-muted-foreground/60 px-1 ${isMe ? "text-right" : "text-left"}`}>{time}</span>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
function Page() {
  const { gid }  = Route.useParams();
  const { data } = useSuspenseQuery(q(gid));
  const [body, setBody] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const post = useServerFn(postMessage);
  const qc   = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => setMyUserId(s.session?.user?.id ?? null));
  }, []);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${gid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${gid}` },
        (payload: any) => {
          qc.setQueryData(["messages", gid], (old: any[] | undefined) => {
            if (!old) return old;
            if (old.some(m => m.id === payload.new.id)) return old;
            return [...old, { ...payload.new, author: "Member" }];
          });
          qc.invalidateQueries({ queryKey: ["messages", gid] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [gid, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBody("");
    const tempId = `temp-${Date.now()}`;
    qc.setQueryData(["messages", gid], (old: any[] | undefined) =>
      [...(old ?? []), { id: tempId, body: text, kind: "message", created_at: new Date().toISOString(), author: "You", user_id: myUserId }]
    );
    try {
      await post({ data: { groupId: gid, body: text } });
      qc.invalidateQueries({ queryKey: ["messages", gid] });
    } catch (err: any) {
      qc.setQueryData(["messages", gid], (old: any[] | undefined) =>
        (old ?? []).filter((m: any) => m.id !== tempId)
      );
      toast.error(err.message);
      setBody(text);
    }
  };

  // Build list with date separator markers
  const items: Array<{ type: "separator"; label: string } | { type: "msg"; msg: any }> = [];
  let lastDay = "";
  for (const m of data) {
    const day = dayKey(m.created_at);
    if (day !== lastDay) {
      items.push({ type: "separator", label: friendlyDay(m.created_at) });
      lastDay = day;
    }
    items.push({ type: "msg", msg: m });
  }

  return (
    <MobileShell groupId={gid} clubName="Chat" clubKicker="Group conversation" showSwitcher activeTab="chat">
      <section className="px-4 -mt-4 space-y-2 pb-36">
        {data.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Say hello!</p>
        )}

        {items.map((item, i) => {
          if (item.type === "separator") {
            return <DateSeparator key={`sep-${i}`} label={item.label} />;
          }

          const m = item.msg;
          const time = fmtTime(m.created_at);

          if (m.kind === "announcement") {
            const parsed = parseSystemBody(m.body);
            if (parsed) {
              return (
                <SystemPill
                  key={m.id}
                  icon={parsed.icon}
                  text={parsed.text}
                  author={m.author ?? "System"}
                  time={time}
                />
              );
            }
          }

          const isMe = m.user_id === myUserId;
          return (
            <ChatBubble
              key={m.id}
              author={m.author ?? "Member"}
              body={m.body}
              time={time}
              isMe={isMe}
            />
          );
        })}

        <div ref={bottomRef} />
      </section>

      <form onSubmit={send} className="fixed bottom-20 left-1/2 -translate-x-1/2 w-full max-w-md px-4 pb-2 flex gap-2 bg-cream/95 backdrop-blur-sm">
        <input
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Message the group…"
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
