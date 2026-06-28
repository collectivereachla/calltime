import type { ReactNode } from "react";

// Safe lightweight markdown → React. No dangerouslySetInnerHTML: text is rendered
// as React text nodes (auto-escaped), links are validated to http(s)/mailto only,
// so there is no HTML/script injection surface. Supports **bold**, *italic*,
// `code`, [text](url), # headings, and - / 1. lists.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const rx =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyPrefix}-i${i++}`;
    if (m[1] !== undefined) {
      nodes.push(
        <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-brick underline break-words">{m[1]}</a>
      );
    } else if (m[3] !== undefined) {
      nodes.push(<strong key={key}>{m[3]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<em key={key}>{m[4]}</em>);
    } else if (m[5] !== undefined) {
      nodes.push(<code key={key} className="px-1 py-0.5 rounded bg-bone/40 text-[0.9em]">{m[5]}</code>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function renderRichText(text: string | null | undefined): ReactNode {
  if (!text) return null;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: ReactNode[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      const k = `b${blocks.length}`;
      blocks.push(<p key={k} className="mb-2 last:mb-0">{renderInline(para.join(" "), k)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `b${blocks.length}`;
      blocks.push(
        list.type === "ul"
          ? <ul key={k} className="list-disc pl-5 mb-2 space-y-0.5">{list.items}</ul>
          : <ol key={k} className="list-decimal pl-5 mb-2 space-y-0.5">{list.items}</ol>
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") { flushPara(); flushList(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushPara(); flushList();
      blocks.push(<hr key={`b${blocks.length}`} className="my-3 border-0 border-t border-bone" />);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    const ol = line.match(/^\s*\d+\.\s+(.*)/);
    if (h) {
      flushPara(); flushList();
      const k = `b${blocks.length}`;
      blocks.push(<p key={k} className="font-display text-ink font-semibold mb-1">{renderInline(h[2], k)}</p>);
    } else if (ul) {
      flushPara();
      if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
      list.items.push(<li key={`li${list.items.length}-${blocks.length}`}>{renderInline(ul[1], `li${list.items.length}-${blocks.length}`)}</li>);
    } else if (ol) {
      flushPara();
      if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; }
      list.items.push(<li key={`li${list.items.length}-${blocks.length}`}>{renderInline(ol[1], `li${list.items.length}-${blocks.length}`)}</li>);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara(); flushList();
  return <>{blocks}</>;
}
