"use client";

import { useRouter } from "next/navigation";

interface Production {
  id: string;
  title: string;
  status: string;
}

interface Props {
  productions: Production[];
  activeId: string | null;
}

export function ProductionSwitcher({ productions, activeId }: Props) {
  const router = useRouter();

  if (productions.length <= 1) return null;

  function handleChange(productionId: string) {
    document.cookie = `calltime_active_production=${productionId};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }

  return (
    <select
      value={activeId || ""}
      onChange={(e) => handleChange(e.target.value)}
      className="w-full px-2 py-1.5 bg-paper border border-bone rounded-card text-body-xs text-ink focus:border-brick focus:outline-none transition-colors truncate"
    >
      {productions.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title}
        </option>
      ))}
    </select>
  );
}
