"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { importScript } from "./spine-actions";

export function ImportScript({ productionId, defaultTitle }: { productionId: string; defaultTitle?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(defaultTitle || "");
  const [text, setText] = useState("");
  const [attest, setAttest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setLoading(true);
    setError(null);
    const result = await importScript(productionId, title, text, attest);
    setLoading(false);
    if (result?.error) { setError(result.error); return; }
    router.refresh();
  }

  return (
    <div className="max-w-2xl mx-auto w-full text-left">
      <h3 className="font-display text-display-sm text-ink mb-2">Import your script</h3>
      <p className="text-body-sm text-ash mb-5 leading-relaxed">
        Paste your script below. We keep your text exactly as written and do a first
        pass at structure: act and scene breaks, who&apos;s speaking, and stage directions.
        You can correct any line afterward. For best results, put each character cue on
        its own line as <span className="font-mono">NAME:</span> and mark scenes as
        <span className="font-mono"> ACT ONE</span> / <span className="font-mono">SCENE 1</span>.
      </p>

      <label className="block text-body-xs text-ash mb-1.5">Script title</label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Sister Act"
        className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-md text-ink placeholder:text-muted focus:border-brick focus:outline-none mb-4"
      />

      <label className="block text-body-xs text-ash mb-1.5">Script text</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        placeholder={"ACT ONE\nSCENE 1\n\n(Lights up on a convent.)\n\nDELORIS: I have got to get out of here."}
        className="w-full px-3 py-2.5 bg-card border border-bone rounded-card text-body-sm text-ink font-mono placeholder:text-muted focus:border-brick focus:outline-none mb-4"
      />

      <label className="flex items-start gap-2 mb-5 cursor-pointer">
        <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5" />
        <span className="text-body-xs text-ash leading-relaxed">
          I confirm my organization holds the rights to use this material (an original
          work, or a licensed production), and that I&apos;m responsible for complying with
          its license. This script stays private to my organization.
        </span>
      </label>

      {error && <p className="text-body-sm text-brick mb-3">{error}</p>}

      <button
        onClick={handleImport}
        disabled={loading || !attest || text.trim().length === 0}
        className="px-4 py-2 bg-ink text-paper text-body-sm font-medium rounded-card hover:bg-ink/90 transition-colors disabled:opacity-40"
      >
        {loading ? "Importing..." : "Import script"}
      </button>
    </div>
  );
}
