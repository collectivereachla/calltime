"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Props {
  members: { id: string; name: string; role: string; department: string }[];
}

export function PersonFilter({ members }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("person");

  // Sort: cast first, then by name
  const sorted = [...members].sort((a, b) => {
    if (a.department === "cast" && b.department !== "cast") return -1;
    if (a.department !== "cast" && b.department === "cast") return 1;
    return a.name.localeCompare(b.name);
  });

  function handleChange(personId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (personId) {
      params.set("person", personId);
    } else {
      params.delete("person");
    }
    router.push(`/callboard?${params.toString()}`);
  }

  return (
    <select
      value={current || ""}
      onChange={(e) => handleChange(e.target.value)}
      className="text-body-sm bg-card border border-bone rounded-card px-3 py-1.5 text-ink focus:border-brick focus:outline-none transition-colors print:hidden"
    >
      <option value="">All calls</option>
      <optgroup label="Cast">
        {sorted.filter((m) => m.department === "cast").map((m) => (
          <option key={m.id} value={m.id}>{m.name} — {m.role}</option>
        ))}
      </optgroup>
      <optgroup label="Production">
        {sorted.filter((m) => m.department !== "cast").map((m) => (
          <option key={m.id} value={m.id}>{m.name}{m.role ? ` — ${m.role}` : ""}</option>
        ))}
      </optgroup>
    </select>
  );
}
