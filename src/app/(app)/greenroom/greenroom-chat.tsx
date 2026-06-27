"use client";

import { useState, useRef, useEffect, useCallback, type ReactElement } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { notifyGreenroomMessage, notifyMentions, notifyDM } from "./actions";

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
  members: { id: string; name: string }[];
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

  const tabs = [...rooms, { key: "direct", kind: "direct" as const, label: "Direct", productionId: null }];
  const [activeKey, setActiveKey] = useState(rooms[0]?.key ?? "direct");
  const isDirect = activeKey === "direct";
  const active = rooms.find((r) => r.key === activeKey) || rooms[0] || null;

  if (rooms.length === 0) {
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
        <div className="flex gap-5 mt-1">
          {tabs.map((r) => (
            <button
              key={r.key}
              onClick={() => setActiveKey(r.key)}
              className={`pb-2 text-body-sm border-b-2 -mb-px transition-colors ${
                activeKey === r.key
                  ? "border-brick text-ink font-medium"
                  : "border-transparent text-muted hover:text-ash"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isDirect ? (
        <DMPane
          orgId={props.orgId}
          members={props.members}
          canManage={props.canManage}
          personId={props.personId}
          personName={props.personName}
          personHeadshot={props.personHeadshot}
        />
      ) : active ? (
        <ChatRoom
          key={active.key}
          members={props.members}
          roomKind={active.kind}
          orgId={props.orgId}
          productionId={active.productionId}
          canManage={props.canManage}
          personId={props.personId}
          personName={props.personName}
          personHeadshot={props.personHeadshot}
        />
      ) : null}
    </div>
  );
}

// ---- One room (org or production), fully isolated; remounted on room switch ----

interface RoomProps {
  members: { id: string; name: string }[];
  conversationId?: string | null;
  convOrgId?: string;
  roomKind: "org" | "production";
  orgId: string;
  productionId: string | null;
  canManage: boolean;
  personId: string;
  personName: string;
  personHeadshot: string | null;
}

function ChatRoom({ members, conversationId = null, convOrgId, roomKind, orgId, productionId, canManage, personId, personName, personHeadshot }: RoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Map<string, Reaction[]>>(new Map());
  const [input, setInput] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const pickedMentions = useRef<Map<string, string>>(new Map());
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
  const [headshotUrls, setHeadshotUrls] = useState<Record<string, string>>({});

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Headshots live on people.headshot_url as private promo-assets paths (or, for
  // some uploads, full public URLs). Greenroom renders client-side, so it must
  // sign the paths here or the <img> tags break (the "?" avatars). Resolved
  // values are cached by path; realtime authors get signed as they arrive.
  useEffect(() => {
    const needed = Array.from(
      new Set(messages.map((m) => m.author_headshot).filter((v): v is string => !!v))
    ).filter((v) => !(v in headshotUrls));
    if (needed.length === 0) return;
    let cancelled = false;
    (async () => {
      const resolved: Record<string, string> = {};
      const toSign: string[] = [];
      for (const v of needed) {
        if (/^https?:\/\//i.test(v)) resolved[v] = v;
        else toSign.push(v);
      }
      if (toSign.length > 0) {
        const { data } = await supabase.storage.from("promo-assets").createSignedUrls(toSign, 3600);
        for (const sgn of data || []) if (sgn.path && sgn.signedUrl) resolved[sgn.path] = sgn.signedUrl;
      }
      if (!cancelled && Object.keys(resolved).length > 0) {
        setHeadshotUrls((prev) => ({ ...prev, ...resolved }));
      }
    })();
    return () => { cancelled = true; };
  }, [messages, headshotUrls, supabase]);

  // Scope a messages query to this room.
  const scopeQuery = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q: any) =>
      conversationId
        ? q.eq("conversation_id", conversationId)
        : productionId
          ? q.eq("production_id", productionId).is("conversation_id", null)
          : q.eq("org_id", orgId).is("production_id", null).is("conversation_id", null),
    [productionId, orgId, conversationId]
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
    const channelName = conversationId ? `dm-${conversationId}` : `greenroom-${productionId || "org-" + orgId}`;
    const filter = conversationId
      ? `conversation_id=eq.${conversationId}`
      : productionId ? `production_id=eq.${productionId}` : `org_id=eq.${orgId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter },
        async (payload) => {
          const msg = payload.new as {
            id: string; content: string; created_at: string; person_id: string;
            production_id: string | null; conversation_id: string | null; attachment_url: string | null;
            attachment_name: string | null; attachment_type: string | null;
          };
          // Org room: ignore production messages that share this org_id.
          if (!productionId && !conversationId && msg.production_id) return;
          // In a room, never surface DM/group messages (they share the org_id).
          if (!conversationId && msg.conversation_id) return;
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
  }, [productionId, orgId, supabase, conversationId]);

  // --- @mention autocomplete + rendering (CRE-49) ---
  const escapeRx = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mentionMatches = mentionOpen
    ? members.filter((mm) => mm.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];
  function handleInputChange(val: string) {
    setInput(val);
    const mm = val.match(/(?:^|\s)@([^\s@]*)$/);
    if (mm) { setMentionQuery(mm[1]); setMentionOpen(true); }
    else { setMentionOpen(false); setMentionQuery(""); }
  }
  function selectMention(mem: { id: string; name: string }) {
    setInput((prev) => prev.replace(/(^|\s)@([^\s@]*)$/, (_f, pre) => `${pre}@${mem.name} `));
    pickedMentions.current.set(mem.id, mem.name);
    setMentionOpen(false); setMentionQuery("");
    inputRef.current?.focus();
  }
  function renderContent(text: string) {
    if (!members.length || !text.includes("@")) return text;
    const names = members.map((mm) => mm.name).sort((a, b) => b.length - a.length).map(escapeRx);
    const rx = new RegExp(`@(${names.join("|")})`, "g");
    const out: Array<string | ReactElement> = [];
    let last = 0; let mm: RegExpExecArray | null;
    while ((mm = rx.exec(text)) !== null) {
      if (mm.index > last) out.push(text.slice(last, mm.index));
      out.push(<span key={mm.index} className="text-brick font-medium">@{mm[1]}</span>);
      last = mm.index + mm[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out.length ? out : text;
  }

  async function sendMessage(attachmentUrl?: string, attachmentName?: string, attachmentType?: string) {
    const text = input.trim();
    if (!text && !attachmentUrl) return;
    const msgContent = text || (attachmentName || "shared a file");
    const mentionedIds = [...pickedMentions.current.entries()].filter(([, nm]) => msgContent.includes("@" + nm)).map(([id]) => id);
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

    const { error } = await supabase.from("messages").insert(
      conversationId
        ? {
            conversation_id: conversationId,
            org_id: convOrgId ?? orgId,
            person_id: personId,
            content: msgContent,
            attachment_url: attachmentUrl || null,
            attachment_name: attachmentName || null,
            attachment_type: attachmentType || null,
          }
        : {
            org_id: orgId,
            production_id: productionId,
            person_id: personId,
            content: msgContent,
            attachment_url: attachmentUrl || null,
            attachment_name: attachmentName || null,
            attachment_type: attachmentType || null,
          }
    );

    setSending(false);
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } else if (conversationId) {
      notifyDM(conversationId, personName, msgContent).catch(() => {});
    } else {
      // High-signal @mention notifications (any room).
      if (mentionedIds.length) {
        notifyMentions(orgId, personName, msgContent, mentionedIds, productionId).catch(() => {});
      }
      // Org-room broadcast notify (production-room broadcast is a separate follow-up).
      if (roomKind === "org") {
        notifyGreenroomMessage(orgId, personId, personName, msgContent).catch(() => {});
      }
      pickedMentions.current.clear();
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
                    {msg.author_headshot && headshotUrls[msg.author_headshot] ? (
                      <img src={headshotUrls[msg.author_headshot]} alt="" className="w-6 h-6 rounded-full object-cover" />
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
                        {renderContent(msg.content)}
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
              aria-label="Attach a file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
            />
          </label>
          <div className="relative flex-1">
            {mentionOpen && mentionMatches.length > 0 && (
              <div className="absolute bottom-full mb-1 left-0 w-64 max-h-56 overflow-y-auto bg-paper border border-bone rounded-card shadow-lg z-20">
                {mentionMatches.map((mm) => (
                  <button
                    key={mm.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selectMention(mm); }}
                    className="block w-full text-left px-3 py-1.5 text-body-sm text-ink hover:bg-brick/10"
                  >
                    @{mm.name}
                  </button>
                ))}
              </div>
            )}
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (mentionOpen && mentionMatches.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
                  e.preventDefault();
                  selectMention(mentionMatches[0]);
                  return;
                }
                if (e.key === "Escape" && mentionOpen) { setMentionOpen(false); return; }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={roomKind === "production" ? "Message this production..." : "Message the company..."}
              autoFocus
              className="w-full px-4 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none transition-colors"
            />
          </div>
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

// ---- Direct messages pane (CRE-49 Phase B): conversation list + group picker + thread ----
function DMPane({
  orgId, members, canManage, personId, personName, personHeadshot,
}: {
  orgId: string;
  members: { id: string; name: string }[];
  canManage: boolean;
  personId: string;
  personName: string;
  personHeadshot: string | null;
}) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [convs, setConvs] = useState<{ id: string; label: string; isGroup: boolean }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [groupTitle, setGroupTitle] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: cs } = await supabase
      .from("conversations").select("id, is_group, title").eq("org_id", orgId)
      .order("created_at", { ascending: false });
    const ids = (cs || []).map((c) => c.id as string);
    const byConv = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("conversation_id, person_id, people(full_name, preferred_name)")
        .in("conversation_id", ids);
      for (const pr of parts || []) {
        if (pr.person_id === personId) continue;
        const pp = pr.people as unknown as { full_name: string; preferred_name: string | null } | null;
        const arr = byConv.get(pr.conversation_id as string) || [];
        arr.push(pp?.preferred_name || pp?.full_name || "Someone");
        byConv.set(pr.conversation_id as string, arr);
      }
    }
    setConvs((cs || []).map((c) => ({
      id: c.id as string,
      isGroup: !!c.is_group,
      label: (c.title as string | null) || (byConv.get(c.id as string) || []).join(", ") || "Conversation",
    })));
  }, [orgId, supabase, personId]);

  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function createConv() {
    if (picked.size === 0) { setErr("Pick at least one person."); return; }
    setBusy(true); setErr(null);
    const ids = [...picked];
    const isGroup = ids.length > 1;
    const { data, error } = await supabase.rpc("create_conversation", {
      p_org_id: orgId, p_participant_ids: ids, p_is_group: isGroup, p_title: isGroup ? (groupTitle || null) : null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setNewOpen(false); setPicked(new Set()); setGroupTitle(""); setQ("");
    await load();
    setSelected(data as string);
  }

  if (selected) {
    const conv = convs.find((c) => c.id === selected);
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-4 md:px-8 py-2 border-b border-bone shrink-0 flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-body-sm text-ash hover:text-brick">&larr; Direct</button>
          <span className="text-body-sm font-medium text-ink truncate">{conv?.label || "Conversation"}</span>
        </div>
        <ChatRoom
          key={selected}
          members={members}
          conversationId={selected}
          convOrgId={orgId}
          roomKind="org"
          orgId={orgId}
          productionId={null}
          canManage={canManage}
          personId={personId}
          personName={personName}
          personHeadshot={personHeadshot}
        />
      </div>
    );
  }

  const filtered = members.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-4">
      <div className="max-w-2xl mx-auto">
        {!newOpen ? (
          <button onClick={() => setNewOpen(true)}
            className="mb-4 px-4 py-2 text-body-sm font-medium rounded-card bg-ink text-paper hover:bg-ink/90">
            + New message
          </button>
        ) : (
          <div className="mb-4 bg-card border border-bone rounded-card p-4">
            <p className="text-body-sm font-medium text-ink mb-2">New message</p>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…"
              className="w-full px-3 py-2 text-body-sm bg-paper border border-bone rounded-card text-ink focus:border-brick focus:outline-none mb-2" />
            <div className="max-h-48 overflow-y-auto border border-bone rounded-card divide-y divide-bone mb-2">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-body-xs text-muted">No matches.</p>
              ) : filtered.map((m) => (
                <button key={m.id} onClick={() => toggle(m.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-body-sm text-left ${picked.has(m.id) ? "bg-brick/10 text-ink" : "text-ash hover:bg-paper"}`}>
                  {m.name}{picked.has(m.id) && <span className="text-brick">✓</span>}
                </button>
              ))}
            </div>
            {picked.size > 1 && (
              <input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="Group name (optional)"
                className="w-full px-3 py-2 text-body-sm bg-paper border border-bone rounded-card text-ink focus:border-brick focus:outline-none mb-2" />
            )}
            {err && <p className="text-body-xs text-brick mb-2">{err}</p>}
            <div className="flex gap-2">
              <button onClick={createConv} disabled={busy || picked.size === 0}
                className="px-4 py-2 text-body-sm font-medium rounded-card bg-ink text-paper hover:bg-ink/90 disabled:opacity-50">
                {busy ? "…" : picked.size > 1 ? `Start group (${picked.size})` : "Start"}
              </button>
              <button onClick={() => { setNewOpen(false); setPicked(new Set()); setErr(null); }} className="text-body-sm text-ash hover:text-ink">Cancel</button>
            </div>
          </div>
        )}

        {convs.length === 0 ? (
          <p className="text-body-sm text-muted">No direct messages yet. Start one above.</p>
        ) : (
          <div className="space-y-1">
            {convs.map((c) => (
              <button key={c.id} onClick={() => setSelected(c.id)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left rounded-card border border-bone bg-card hover:shadow-card-hover transition-shadow">
                <span className="text-body-sm font-medium text-ink truncate">{c.label}</span>
                {c.isGroup && <span className="text-body-xs text-muted">· group</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
