"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { notifyGreenroomMessage } from "./actions";

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

const MSG_SELECT =
  "id, content, created_at, person_id, attachment_url, attachment_name, attachment_type, people(id, full_name, preferred_name, headshot_url)";

function mapRow(m: Record<string, unknown>): Message {
  const p = m.people as unknown as {
    id: string; full_name: string; preferred_name: string | null; headshot_url: string | null;
  } | null;
  return {
    id: m.id as string,
    content: m.content as string,
    created_at: m.created_at as string,
    person_id: m.person_id as string,
    author_name: p?.preferred_name || p?.full_name || "Unknown",
    author_headshot: p?.headshot_url || null,
    attachment_url: (m.attachment_url as string) || null,
    attachment_name: (m.attachment_name as string) || null,
    attachment_type: (m.attachment_type as string) || null,
  };
}

// ---- Wrapper: tabs for the Org room and the Production room ----

interface WrapperProps {
  orgId: string;
  orgName: string;
  productionId: string | null;
  productionName: string | null;
  canSeeOrg: boolean;
  canSeeProduction: boolean;
  canManage: boolean;
  personId: string;
  personName: string;
  personHeadshot: string | null;
}

export function GreenroomChat(props: WrapperProps) {
  const rooms: { key: string; kind: "org" | "production"; label: string; productionId: string | null }[] = [];
  if (props.canSeeProduction && props.productionId) {
    rooms.push({
      key: "prod:" + props.productionId,
      kind: "production",
      label: props.productionName || "Production",
      productionId: props.productionId,
    });
  }
  if (props.canSeeOrg) {
    rooms.push({ key: "org:" + props.orgId, kind: "org", label: "Company", productionId: null });
  }

  const [activeKey, setActiveKey] = useState(rooms[0]?.key ?? "");
  const active = rooms.find((r) => r.key === activeKey) || rooms[0];

  if (!active) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <p className="text-body-md text-ash">No greenroom available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">
      <div className="px-4 md:px-8 pt-3 border-b border-bone shrink-0">
        <h1 className="font-display text-display-xs text-ink">Greenroom</h1>
        {rooms.length > 1 ? (
          <div className="flex gap-5 mt-1">
            {rooms.map((r) => (
              <button
                key={r.key}
                onClick={() => setActiveKey(r.key)}
                className={`pb-2 text-body-sm border-b-2 -mb-px transition-colors ${
                  active.key === r.key
                    ? "border-brick text-ink font-medium"
                    : "border-transparent text-muted hover:text-ash"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-body-xs text-muted pb-2">
            {active.kind === "org" ? props.orgName : active.label}
          </p>
        )}
      </div>

      <ChatRoom
        key={active.key}
        roomKind={active.kind}
        orgId={props.orgId}
        productionId={active.productionId}
        canManage={props.canManage}
        personId={props.personId}
        personName={props.personName}
        personHeadshot={props.personHeadshot}
      />
    </div>
  );
}

// ---- One room (org or production), fully isolated; remounted on room switch ----

interface RoomProps {
  roomKind: "org" | "production";
  orgId: string;
  productionId: string | null;
  canManage: boolean;
  personId: string;
  personName: string;
  personHeadshot: string | null;
}

function ChatRoom({ roomKind, orgId, productionId, canManage, personId, personName, personHeadshot }: RoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Map<string, Reaction[]>>(new Map());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Scope a messages query to this room.
  const scopeQuery = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q: any) => (productionId ? q.eq("production_id", productionId) : q.eq("org_id", orgId).is("production_id", null)),
    [productionId, orgId]
  );

  // Initial load for this room.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await scopeQuery(supabase.from("messages").select(MSG_SELECT))
        .order("created_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      const rows = (data || []) as Record<string, unknown>[];
      setMessages(rows.slice().reverse().map(mapRow));
      setHasMore(rows.length >= 50);
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView());
    })();
    return () => { cancelled = true; };
  }, [scopeQuery, supabase]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 100);
  }, []);

  // Fetch reactions for loaded messages
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

  // Real-time for THIS room only.
  useEffect(() => {
    const channelName = `greenroom-${productionId || "org-" + orgId}`;
    const filter = productionId ? `production_id=eq.${productionId}` : `org_id=eq.${orgId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter },
        async (payload) => {
          const msg = payload.new as {
            id: string; content: string; created_at: string; person_id: string;
            production_id: string | null; attachment_url: string | null;
            attachment_name: string | null; attachment_type: string | null;
          };
          // Org room: ignore production messages that share this org_id.
          if (!productionId && msg.production_id) return;
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
        { event: "DELETE", schema: "public", table: "messages", filter },
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
  }, [productionId, orgId, supabase]);

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
      production_id: productionId,
      person_id: personId,
      content: msgContent,
      attachment_url: attachmentUrl || null,
      attachment_name: attachmentName || null,
      attachment_type: attachmentType || null,
    });

    setSending(false);
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } else if (roomKind === "org") {
      // Org-room push/in-app notify to org members (production-room notifications
      // to assignees are a separate follow-up).
      notifyGreenroomMessage(orgId, personId, personName, msgContent).catch(() => {});
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
    if (fileRef.current) fileRef.current.value = "";
    await sendMessage(urlData.publicUrl, file.name, file.type);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    setActiveMessageId(null);
    const msgReactions = reactions.get(messageId) || [];
    const existing = msgReactions.find((r) => r.person_id === personId && r.emoji === emoji);

    if (existing) {
      setReactions((prev) => {
        const next = new Map(prev);
        next.set(messageId, (next.get(messageId) || []).filter((r) => r.id !== existing.id));
        return next;
      });
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
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
    const { data } = await scopeQuery(supabase.from("messages").select(MSG_SELECT))
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(50);
    setLoadingMore(false);
    const rows = (data || []) as Record<string, unknown>[];
    if (rows.length === 0) { setHasMore(false); return; }
    const older: Message[] = rows.slice().reverse().map(mapRow);
    if (rows.length < 50) setHasMore(false);
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
          onClick={(e) => { e.stopPropagation(); setLightboxUrl(msg.attachment_url); }}
        />
      );
    }
    return (
      <a
        href={msg.attachment_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-2 mt-1 px-3 py-1.5 bg-bone/30 border border-bone rounded-card text-body-xs text-ink hover:text-brick transition-colors"
      >
        📎 {msg.attachment_name || "File"}
      </a>
    );
  }

  function renderReactions(messageId: string) {
    const msgReactions = reactions.get(messageId) || [];
    if (msgReactions.length === 0) return null;
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
            onClick={(e) => { e.stopPropagation(); toggleReaction(messageId, emoji); }}
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
      </div>
    );
  }

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 md:px-8 py-4"
        onClick={() => setActiveMessageId(null)}
      >
        {hasMore && (
          <div className="text-center mb-4">
            <button onClick={loadOlder} disabled={loadingMore} className="text-body-xs text-ash hover:text-ink transition-colors disabled:opacity-50">
              {loadingMore ? "Loading..." : "Load older messages"}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-20 px-4">
            <span className="text-3xl mb-3 opacity-40">💬</span>
            <h3 className="font-display text-display-sm text-ink mb-2">The Greenroom is quiet</h3>
            <p className="text-body-sm text-ash text-center max-w-sm">
              {roomKind === "production"
                ? "Everyone in this production can talk here — cast, crew, families, and the team."
                : "Your company's group chat. Share updates, ask questions, or just say hello."}
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

                <div
                  className="flex items-start gap-2 pl-8 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isOptimistic) setActiveMessageId(activeMessageId === msg.id ? null : msg.id);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    {msg.content && !(msg.attachment_url && msg.content === (msg.attachment_name || "shared a file")) && (
                      <p className={`text-body-md leading-relaxed ${isOptimistic ? "text-ash" : "text-ink"}`}>
                        {msg.content}
                      </p>
                    )}
                    {renderAttachment(msg)}
                  </div>
                </div>

                {!isOptimistic && activeMessageId === msg.id && (
                  <div className="flex items-center gap-1 pl-8 mt-1">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, emoji); setActiveMessageId(null); }}
                        className="w-7 h-7 rounded hover:bg-bone/50 flex items-center justify-center transition-colors text-sm"
                      >
                        {emoji}
                      </button>
                    ))}
                    {canDelete && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); setActiveMessageId(null); }}
                        className="ml-1 px-2 py-1 text-body-xs text-muted hover:text-brick transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}

                {!isOptimistic && renderReactions(msg.id)}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      <div className="px-4 md:px-8 py-3 border-t border-bone bg-paper shrink-0">
        <div className="flex gap-2 max-w-3xl items-center">
          <label className={`shrink-0 w-10 h-10 rounded-card border border-bone flex items-center justify-center cursor-pointer transition-colors ${uploading ? "opacity-50" : "hover:border-ash hover:text-ink text-muted"}`}>
            {uploading ? <span className="text-body-xs">...</span> : <span className="text-body-md">📎</span>}
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
            placeholder={roomKind === "production" ? "Message this production..." : "Message the company..."}
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

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-ink/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-paper/70 hover:text-paper text-2xl transition-colors"
          >
            ✕
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-full object-contain rounded-card"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
