"use client";

import { useRouter } from "next/navigation";

export function ProductionPicker({
  productions,
  selected,
}: {
  productions: { id: string; title: string }[];
  selected: string;
}) {
  const router = useRouter();
  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-body-xs text-muted">Production</span>
      <select
        value={selected}
        onChange={(e) => router.push(`/marquee?p=${e.target.value}`)}
        className="px-3 py-1.5 text-body-sm rounded-card border border-bone bg-paper text-ink focus:outline-none focus:border-brick"
      >
        {productions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    </label>
  );
}
