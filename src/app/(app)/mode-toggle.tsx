"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setMode } from "./mode-actions";

export function ModeToggle({ dark = false }: { dark?: boolean }) {
  const router = useRouter();
  const [mode, setLocal] = useState<"ase" | "tulia">("ase");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const m = document.cookie.split("; ").find((r) => r.startsWith("calltime_mode="))?.split("=")[1];
    setLocal(m === "tulia" ? "tulia" : "ase");
  }, []);

  async function toggle() {
    const next = mode === "tulia" ? "ase" : "tulia";
    setLocal(next);
    setBusy(true);
    await setMode(next);
    router.refresh();
    setBusy(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={mode === "tulia" ? "Tulia (too-LEE-ah), Swahili: calm, rest. Tap for Àṣẹ." : "Àṣẹ (ah-SHAY), Yoruba: life force. Tap for Tulia."}
      className={`shrink-0 text-body-xs transition-colors disabled:opacity-50 ${dark ? "text-bone/70 hover:text-paper" : "text-muted hover:text-brick"}`}
    >
      {mode === "tulia" ? "☾ Tulia" : "☀ Àṣẹ"}
    </button>
  );
}
