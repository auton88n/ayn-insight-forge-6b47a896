/**
 * MessageThread.tsx — v3.163.0
 *
 * Shared by both sides of the inbox: EmployerHub's own proposal view and
 * the candidate's ProposalsTab. One component so the two never drift apart
 * (blueprint.md's own rule: don't build two things doing the same job).
 *
 * Reads messages directly via a real RLS-protected query (inboxMessages) —
 * a candidate can never see a blocked message here because the database
 * itself refuses to return it, not because this component remembers to
 * filter. Sends go through resume-hub (inboxSend), which is where the
 * safety screen actually runs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Send, ShieldCheck, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { employerApi, inboxMessages, type InboxMessage } from "@/lib/employer";

function when(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const mins = Math.round(d / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function MessageThread({
  revealRequestId,
  role,
  twoWayEnabled,
  candidateBlocked,
  onTwoWayChange,
  onBlockChange,
}: {
  revealRequestId: string;
  role: "employer" | "candidate";
  twoWayEnabled: boolean;
  candidateBlocked: boolean;
  onTwoWayChange?: (enabled: boolean) => void;
  onBlockChange?: (blocked: boolean) => void;
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [busyControl, setBusyControl] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const rows = await inboxMessages(revealRequestId);
      setMessages(rows);
      // Every message from the other side that isn't marked read yet.
      const otherRole = role === "employer" ? "candidate" : "employer";
      if (rows.some(m => m.sender_role === otherRole && !m.read_at)) {
        void employerApi.inboxMarkRead(revealRequestId, role);
      }
    } catch { /* silent, same pattern as the rest of this surface */ }
    finally { setLoading(false); }
  }, [revealRequestId, role]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  const canSend = role === "employer" || (twoWayEnabled && !candidateBlocked);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      const r = await employerApi.inboxSend([revealRequestId], text);
      if (!r.ok || r.blocked) {
        toast({ title: "Message not sent", description: r.reason || "This message didn't pass AYN's safety check.", variant: "destructive" });
      } else {
        setBody("");
      }
      await load();
    } catch (e) {
      toast({ title: "Couldn't send", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  };

  const toggleTwoWay = async (enabled: boolean) => {
    setBusyControl(true);
    try {
      await employerApi.inboxSetTwoWay(revealRequestId, enabled);
      onTwoWayChange?.(enabled);
      toast({ title: enabled ? "Replies turned on" : "Replies turned off", description: enabled ? "The candidate can now reply to you." : "The candidate can no longer reply on this thread." });
    } catch (e) {
      toast({ title: "Couldn't update", description: (e as Error).message, variant: "destructive" });
    } finally { setBusyControl(false); }
  };

  const toggleBlock = async (blocked: boolean) => {
    setBusyControl(true);
    try {
      await employerApi.inboxBlockCandidate(revealRequestId, blocked);
      onBlockChange?.(blocked);
      toast({ title: blocked ? "Candidate blocked" : "Candidate unblocked", description: blocked ? "They can no longer send you messages on this thread." : "They can send messages again, if replies are on." });
    } catch (e) {
      toast({ title: "Couldn't update", description: (e as Error).message, variant: "destructive" });
    } finally { setBusyControl(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading messages…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {role === "employer" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Switch checked={twoWayEnabled} disabled={busyControl} onCheckedChange={toggleTwoWay} />
            <span>{twoWayEnabled ? "Candidate can reply" : "One-way — candidate can't reply"}</span>
          </div>
          <Button
            size="sm" variant={candidateBlocked ? "destructive" : "outline"}
            disabled={busyControl}
            onClick={() => toggleBlock(!candidateBlocked)}
          >
            <Ban className="w-3.5 h-3.5 mr-1.5" />
            {candidateBlocked ? "Unblock candidate" : "Block candidate"}
          </Button>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto space-y-2 rounded-lg border border-border/50 p-3 bg-background">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No messages yet.</p>
        )}
        {messages.map(m => {
          const mine = m.sender_role === role;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.kind === "call_invite" ? (
                  <div className="space-y-1">
                    <p className="font-medium">📞 Call scheduled</p>
                    {m.call_scheduled_at && <p className="text-xs opacity-80">{new Date(m.call_scheduled_at).toLocaleString()}</p>}
                    {m.call_url && (
                      <a href={m.call_url} target="_blank" rel="noreferrer" className="underline text-xs">Join call</a>
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                )}
                <p className={`text-[10px] mt-1 ${mine ? "opacity-70" : "text-muted-foreground"}`}>{when(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {canSend ? (
        <div className="space-y-1.5">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a message…"
            rows={2}
            disabled={sending}
            className="text-sm"
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Every message here is checked before it's delivered.
            </p>
            <Button size="sm" disabled={sending || !body.trim()} onClick={send}>
              {sending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
              Send
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-1">
          {candidateBlocked ? "This employer has turned off messages on this thread." : "This employer hasn't opened this conversation to replies yet."}
        </p>
      )}
    </div>
  );
}
