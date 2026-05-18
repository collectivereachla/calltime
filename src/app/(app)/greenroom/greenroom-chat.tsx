"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";

interface Message {
  id: string;
  content: string;
  created_at: string;
  person_id: string;
  author_name: string;
  author_headshot: string | null;
}

interface Props {
  orgId: string;
  orgName: string;
  personId: string;
  personName: string;
  personHeadshot: string | null;
  canManage: boolean;
  initialMessages: Message[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - msgDay.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export function GreenroomChat({
  orgId, orgName, personId, personName, personHeadshot, canManage, initialMessages,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScroll]);

  // Scroll to bottom on mount
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView();
  }, []);

  // Track scroll position for auto-scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setAutoScroll(nearBottom);
  }, []);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("greenroom")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `org_id=eq.${orgId}` },
        async (payload) => {
          const msg = payload.new as { id: string; content: string; created_at: string; person_id: string };
          // Fetch author info
          const { data: author } = await supabase
            .from("people")
            .select("id, full_name, preferred_name, headshot_url")
            .eq("id", msg.person_id)
            .single();

          const newMsg: Message = {
            id: msg.id,
            content: msg.content,
            created_at: msg.created_at,
            person_id: msg.person_id,
            author_name: author?.preferred_name || author?.full_name || "Unknown",
            author_headshot: author?.headshot_url || null,
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const oldId = (payload.old as { id: string }).id;
          setMessages((prev) => prev.filter((m) => m.id !== oldId));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, supabase]);

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setSending(true);
    inputRef.current?.focus();

    // Optimistic add
    const optimistic: Message = {
      id: "optimistic-" + Date.now(),
      content: text,
      created_at: new Date().toISOString(),
      person_id: personId,
      author_name: personName,
      author_headshot: personHeadshot,
    };
    setMessages((prev) => [...prev, optimistic]);
    setAutoScroll(true);

    const { error } = await supabase.from("messages").insert({
      org_id: orgId,
      person_id: personId,
      content: text,
    });

    setSending(false);
    if (error) {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }
  }

  async function deleteMessage(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await supabase.from("messages").delete().eq("id", id);
  }

  async function loadOlder() {
    if (messages.length === 0 || loadingMore) return;
    setLoadingMore(true);
    const oldest = messages[0];

    const { data } = await supabase
      .from("messages")
      .select("id, content, created_at, person_id, people(id, full_name, preferred_name, headshot_url)")
      .eq("org_id", orgId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(50);

    setLoadingMore(false);
    if (!data || data.length === 0) {
      setHasMore(false);
      return;
    }

    const older: Message[] = data.reverse().map((m) => {
      const p = m.people as unknown as { id: string; full_name: string; preferred_name: string | null; headshot_url: string | null };
      return {
        id: m.id,
        content: m.content,
        created_at: m.created_at,
        person_id: m.person_id,
        author_name: p?.preferred_name || p?.full_name || "Unknown",
        author_headshot: p?.headshot_url || null,
      };
    });

    if (data.length < 50) setHasMore(false);

    // Preserve scroll position
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight || 0;
    setMessages((prev) => [...older, ...prev]);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  // Group messages: show author header only when author changes or >5 min gap
  function shouldShowHeader(msg: Message, prev: Message | null): boolean {
    if (!prev) return true;
    if (prev.person_id !== msg.person_id) return true;
    const gap = new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime();
    return gap > 5 * 60 * 1000;
  }

  function shouldShowDateHeader(msg: Message, prev: Message | null): boolean {
    if (!prev) return true;
    const d1 = new Date(msg.created_at).toDateString();
    const d2 = new Date(prev.created_at).toDateString();
    return d1 !== d2;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="px-4 md:px-8 py-3 border-b border-bone shrink-0">
        <h1 className="font-display text-display-xs text-ink">Greenroom</h1>
        <p className="text-body-xs text-muted">{orgName}</p>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 md:px-8 py-4"
      >
        {/* Load more */}
        {hasMore && (
          <div className="text-center mb-4">
            <button
              onClick={loadOlder}
              disabled={loadingMore}
              className="text-body-xs text-ash hover:text-ink transition-colors disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load older messages"}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-20">
            <p className="text-body-md text-muted text-center">
              No messages yet. Say something.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const prev = idx > 0 ? messages[idx - 1] : null;
          const showDate = shouldShowDateHeader(msg, prev);
          const showHeader = shouldShowHeader(msg, prev);
          const isOwn = msg.person_id === personId;
          const canDelete = isOwn || canManage;
          const initials = getInitials(msg.author_name);

          return (
            <div key={msg.id}>
              {/* Date separator */}
              {showDate && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 border-t border-bone" />
                  <span className="text-body-xs text-muted font-medium">
                    {formatDateHeader(msg.created_at)}
                  </span>
                  <div className="flex-1 border-t border-bone" />
                </div>
              )}

              <div className={`group ${showHeader ? "mt-3" : "mt-0.5"}`}>
                {showHeader && (
                  <div className="flex items-center gap-2 mb-0.5">
                    {msg.author_headshot ? (
                      <img src={msg.author_headshot} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-brick/10 text-brick flex items-center justify-center text-[9px] font-semibold">
                        {initials}
                      </div>
                    )}
                    <span className={`text-body-sm font-medium ${isOwn ? "text-brick" : "text-ink"}`}>
                      {msg.author_name}
                    </span>
                    <span className="text-body-xs text-muted">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                )}

                <div className={`flex items-start gap-2 ${showHeader ? "pl-8" : "pl-8"}`}>
                  <p className={`text-body-md leading-relaxed flex-1 ${
                    msg.id.startsWith("optimistic-") ? "text-ash" : "text-ink"
                  }`}>
                    {msg.content}
                  </p>
                  {canDelete && !msg.id.startsWith("optimistic-") && (
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted hover:text-brick text-body-xs transition-opacity shrink-0 mt-1"
                      title="Delete"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 md:px-8 py-3 border-t border-bone bg-paper shrink-0">
        <div className="flex gap-2 max-w-3xl">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Message the company..."
            autoFocus
            className="flex-1 px-4 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="px-4 py-2.5 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-40 shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
