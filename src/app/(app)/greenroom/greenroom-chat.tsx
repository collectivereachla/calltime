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
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
}

interface Reaction {
  id: string;
  message_id: string;
  person_id: string;
  emoji: string;
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

const REACTION_EMOJIS = ["❤️", "😂", "👍", "👏", "🔥", "😮"];

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
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
  const [reactions, setReactions] = useState<Map<string, Reaction[]>>(new Map());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialMessages.length >= 50);
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Auto-scroll
  useEffect(() => {
    if (autoScroll) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, autoScroll]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView();
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 100);
  }, []);

  // Fetch initial reactions
  useEffect(() => {
    async function loadReactions() {
      const ids = messages.filter((m) => !m.id.startsWith("optimistic-")).map((m) => m.id);
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("message_reactions")
        .select("id, message_id, person_id, emoji")
        .in("message_id", ids);
      if (data) {
        const map = new Map<string, Reaction[]>();
        for (const r of data) {
          if (!map.has(r.message_id)) map.set(r.message_id, []);
          map.get(r.message_id)!.push(r);
        }
        setReactions(map);
      }
    }
    loadReactions();
  }, [messages.length, supabase]);

  // Real-time: messages + reactions
  useEffect(() => {
    const channel = supabase
      .channel("greenroom-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `org_id=eq.${orgId}` },
        async (payload) => {
          const msg = payload.new as { id: string; content: string; created_at: string; person_id: string; attachment_url: string | null; attachment_name: string | null; attachment_type: string | null };
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
            attachment_url: msg.attachment_url,
            attachment_name: msg.attachment_name,
            attachment_type: msg.attachment_type,
          };
          setMessages((prev) => {
            // Remove optimistic version if it exists (match by content + person)
            const withoutOptimistic = prev.filter((m) =>
              !(m.id.startsWith("optimistic-") && m.person_id === newMsg.person_id && m.content === newMsg.content)
            );
            if (withoutOptimistic.some((m) => m.id === newMsg.id)) return withoutOptimistic;
            return [...withoutOptimistic, newMsg];
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const r = payload.new as Reaction;
          setReactions((prev) => {
            const next = new Map(prev);
            const arr = next.get(r.message_id) || [];
            if (arr.some((x) => x.id === r.id)) return prev;
            next.set(r.message_id, [...arr, r]);
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          const old = payload.old as { id: string; message_id: string };
          setReactions((prev) => {
            const next = new Map(prev);
            const arr = next.get(old.message_id) || [];
            next.set(old.message_id, arr.filter((x) => x.id !== old.id));
            return next;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, supabase]);

  async function sendMessage(attachmentUrl?: string, attachmentName?: string, attachmentType?: string) {
    const text = input.trim();
    if (!text && !attachmentUrl) return;
    const msgContent = text || (attachmentName || "shared a file");
    setInput("");
    setSending(true);
    inputRef.current?.focus();

    const optimistic: Message = {
      id: "optimistic-" + Date.now(),
      content: msgContent,
      created_at: new Date().toISOString(),
      person_id: personId,
      author_name: personName,
      author_headshot: personHeadshot,
      attachment_url: attachmentUrl || null,
      attachment_name: attachmentName || null,
      attachment_type: attachmentType || null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setAutoScroll(true);

    const { error } = await supabase.from("messages").insert({
      org_id: orgId,
      person_id: personId,
      content: msgContent,
      attachment_url: attachmentUrl || null,
      attachment_name: attachmentName || null,
      attachment_type: attachmentType || null,
    });

    setSending(false);
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("File must be under 10MB"); return; }

    setUploading(true);
    const ext = file.name.split(".").pop() || "bin";
    const path = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("greenroom-files")
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setUploading(false);
      alert("Upload failed: " + uploadError.message);
      return;
    }

    const { data: urlData } = supabase.storage.from("greenroom-files").getPublicUrl(path);
    setUploading(false);

    // Reset file input
    if (fileRef.current) fileRef.current.value = "";

    await sendMessage(urlData.publicUrl, file.name, file.type);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    setPickerOpenFor(null);
    const msgReactions = reactions.get(messageId) || [];
    const existing = msgReactions.find((r) => r.person_id === personId && r.emoji === emoji);

    if (existing) {
      // Remove
      setReactions((prev) => {
        const next = new Map(prev);
        next.set(messageId, (next.get(messageId) || []).filter((r) => r.id !== existing.id));
        return next;
      });
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      // Add
      const tempId = "temp-" + Date.now();
      const temp: Reaction = { id: tempId, message_id: messageId, person_id: personId, emoji };
      setReactions((prev) => {
        const next = new Map(prev);
        next.set(messageId, [...(next.get(messageId) || []), temp]);
        return next;
      });
      const { data, error } = await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, person_id: personId, emoji })
        .select("id")
        .single();
      if (error) {
        setReactions((prev) => {
          const next = new Map(prev);
          next.set(messageId, (next.get(messageId) || []).filter((r) => r.id !== tempId));
          return next;
        });
      } else if (data) {
        setReactions((prev) => {
          const next = new Map(prev);
          next.set(messageId, (next.get(messageId) || []).map((r) => r.id === tempId ? { ...r, id: data.id } : r));
          return next;
        });
      }
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
      .select("id, content, created_at, person_id, attachment_url, attachment_name, attachment_type, people(id, full_name, preferred_name, headshot_url)")
      .eq("org_id", orgId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(50);
    setLoadingMore(false);
    if (!data || data.length === 0) { setHasMore(false); return; }
    const older: Message[] = data.reverse().map((m) => {
      const p = m.people as unknown as { id: string; full_name: string; preferred_name: string | null; headshot_url: string | null };
      return {
        id: m.id, content: m.content, created_at: m.created_at, person_id: m.person_id,
        author_name: p?.preferred_name || p?.full_name || "Unknown",
        author_headshot: p?.headshot_url || null,
        attachment_url: m.attachment_url, attachment_name: m.attachment_name, attachment_type: m.attachment_type,
      };
    });
    if (data.length < 50) setHasMore(false);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight || 0;
    setMessages((prev) => [...older, ...prev]);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
  }

  function shouldShowHeader(msg: Message, prev: Message | null): boolean {
    if (!prev) return true;
    if (prev.person_id !== msg.person_id) return true;
    return new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
  }

  function shouldShowDateHeader(msg: Message, prev: Message | null): boolean {
    if (!prev) return true;
    return new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString();
  }

  function renderAttachment(msg: Message) {
    if (!msg.attachment_url) return null;
    const isImage = msg.attachment_type?.startsWith("image/");
    if (isImage) {
      return (
        <img
          src={msg.attachment_url}
          alt={msg.attachment_name || "Image"}
          className="max-w-xs md:max-w-sm rounded-card border border-bone mt-1 cursor-pointer"
          onClick={() => window.open(msg.attachment_url!, "_blank")}
        />
      );
    }
    return (
      <a
        href={msg.attachment_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 mt-1 px-3 py-1.5 bg-bone/30 border border-bone rounded-card text-body-xs text-ink hover:text-brick transition-colors"
      >
        📎 {msg.attachment_name || "File"}
      </a>
    );
  }

  function renderReactions(messageId: string) {
    const msgReactions = reactions.get(messageId) || [];
    if (msgReactions.length === 0 && pickerOpenFor !== messageId) return null;

    // Group by emoji
    const grouped = new Map<string, { count: number; mine: boolean }>();
    for (const r of msgReactions) {
      const existing = grouped.get(r.emoji) || { count: 0, mine: false };
      existing.count++;
      if (r.person_id === personId) existing.mine = true;
      grouped.set(r.emoji, existing);
    }

    return (
      <div className="flex flex-wrap items-center gap-1 mt-1 pl-8">
        {Array.from(grouped.entries()).map(([emoji, { count, mine }]) => (
          <button
            key={emoji}
            onClick={() => toggleReaction(messageId, emoji)}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-body-xs transition-colors ${
              mine
                ? "bg-brick/10 border border-brick/30 text-brick"
                : "bg-bone/40 border border-bone text-ash hover:border-ash"
            }`}
          >
            <span>{emoji}</span>
            <span className="font-mono text-[10px]">{count}</span>
          </button>
        ))}
        {/* Add reaction button */}
        <button
          onClick={() => setPickerOpenFor(pickerOpenFor === messageId ? null : messageId)}
          className="w-6 h-6 rounded-full bg-bone/30 text-muted hover:text-ink hover:bg-bone/60 text-body-xs transition-colors flex items-center justify-center"
        >
          +
        </button>
        {/* Emoji picker */}
        {pickerOpenFor === messageId && (
          <div className="flex gap-1 bg-card border border-bone rounded-card px-2 py-1 shadow-sm">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => toggleReaction(messageId, emoji)}
                className="w-7 h-7 rounded hover:bg-bone/50 flex items-center justify-center transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    );
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
        onClick={() => { if (pickerOpenFor) setPickerOpenFor(null); }}
      >
        {hasMore && (
          <div className="text-center mb-4">
            <button onClick={loadOlder} disabled={loadingMore} className="text-body-xs text-ash hover:text-ink transition-colors disabled:opacity-50">
              {loadingMore ? "Loading..." : "Load older messages"}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-20">
            <p className="text-body-md text-muted text-center">No messages yet. Say something.</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const prev = idx > 0 ? messages[idx - 1] : null;
          const showDate = shouldShowDateHeader(msg, prev);
          const showHeader = shouldShowHeader(msg, prev);
          const isOwn = msg.person_id === personId;
          const canDelete = isOwn || canManage;
          const initials = getInitials(msg.author_name);
          const isOptimistic = msg.id.startsWith("optimistic-");

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 border-t border-bone" />
                  <span className="text-body-xs text-muted font-medium">{formatDateHeader(msg.created_at)}</span>
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
                    <span className={`text-body-sm font-medium ${isOwn ? "text-brick" : "text-ink"}`}>{msg.author_name}</span>
                    <span className="text-body-xs text-muted">{formatTime(msg.created_at)}</span>
                  </div>
                )}

                <div className="flex items-start gap-2 pl-8">
                  <div className="flex-1 min-w-0">
                    {/* Text content — skip if it's just the auto-generated file label */}
                    {msg.content && !(msg.attachment_url && msg.content === (msg.attachment_name || "shared a file")) && (
                      <p className={`text-body-md leading-relaxed ${isOptimistic ? "text-ash" : "text-ink"}`}>
                        {msg.content}
                      </p>
                    )}
                    {renderAttachment(msg)}
                  </div>
                  {canDelete && !isOptimistic && (
                    <button
                      onClick={() => deleteMessage(msg.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted hover:text-brick text-body-xs transition-opacity shrink-0 mt-1"
                      title="Delete"
                    >
                      ×
                    </button>
                  )}
                </div>

                {!isOptimistic && renderReactions(msg.id)}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 md:px-8 py-3 border-t border-bone bg-paper shrink-0">
        <div className="flex gap-2 max-w-3xl items-center">
          <label className={`shrink-0 w-10 h-10 rounded-card border border-bone flex items-center justify-center cursor-pointer transition-colors ${uploading ? "opacity-50" : "hover:border-ash hover:text-ink text-muted"}`}>
            {uploading ? (
              <span className="text-body-xs">...</span>
            ) : (
              <span className="text-body-md">📎</span>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
            />
          </label>
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
            onClick={() => sendMessage()}
            disabled={sending || (!input.trim() && !uploading)}
            className="px-4 py-2.5 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-40 shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
