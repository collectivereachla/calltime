import type { SupabaseClient } from "@supabase/supabase-js";

// Renders the body text for "auto" rider sections from live production data.
// Used by the Booth Rider tab (preview) and the printable rider page so the
// two can never drift apart.

export type RiderAutoSource = "contacts" | "props" | "mics" | "scenery";

export const AUTO_SOURCE_LABELS: Record<RiderAutoSource, string> = {
  contacts: "Contacts (live from Company)",
  props: "Props (live from props list)",
  mics: "Wireless mics (live from mic plot)",
  scenery: "Scenery (live from set design)",
};

function fmtDim(ft: number): string {
  const whole = Math.floor(ft);
  const inches = Math.round((ft - whole) * 12);
  if (inches === 0) return `${whole}'`;
  if (whole === 0) return `${inches}"`;
  return `${whole}'${inches}"`;
}

export async function buildAutoBodies(
  supabase: SupabaseClient,
  productionId: string
): Promise<Record<RiderAutoSource, string>> {
  const [contacts, props, mics, scenery] = await Promise.all([
    buildContacts(supabase, productionId),
    buildProps(supabase, productionId),
    buildMics(supabase, productionId),
    buildScenery(supabase, productionId),
  ]);
  return { contacts, props, mics, scenery };
}

async function buildContacts(supabase: SupabaseClient, productionId: string): Promise<string> {
  const { data } = await supabase
    .from("production_assignments")
    .select("role_title, department, people!production_assignments_person_id_fkey(full_name, email, phone)")
    .eq("production_id", productionId)
    .eq("active", true)
    .in("department", ["directing", "stage_management", "design", "crew", "production"]);

  type Row = { role_title: string | null; department: string; people: { full_name: string | null; email: string | null; phone: string | null } | null };
  const rows = ((data || []) as unknown as Row[]).filter((r) => r.people != null);

  // One block per person; join multiple role titles.
  const byPerson = new Map<string, { name: string; email: string | null; phone: string | null; roles: Set<string>; dept: string }>();
  for (const r of rows) {
    const key = `${r.people!.full_name}|${r.people!.email}`;
    const entry = byPerson.get(key) || {
      name: r.people!.full_name || "",
      email: r.people!.email,
      phone: r.people!.phone,
      roles: new Set<string>(),
      dept: r.department,
    };
    if (r.role_title) entry.roles.add(r.role_title);
    byPerson.set(key, entry);
  }

  const deptOrder = ["directing", "stage_management", "production", "design", "crew"];
  const blocks = [...byPerson.values()]
    .sort((a, b) => deptOrder.indexOf(a.dept) - deptOrder.indexOf(b.dept) || a.name.localeCompare(b.name))
    .map((p) => {
      const lines = [[...p.roles].join(" / ").toUpperCase(), p.name.trim()];
      if (p.email) lines.push(p.email);
      if (p.phone) lines.push(p.phone);
      return lines.join("\n");
    });

  return blocks.join("\n\n") || "No production contacts on file.";
}

async function buildProps(supabase: SupabaseClient, productionId: string): Promise<string> {
  const { data } = await supabase
    .from("props")
    .select("prop_name, is_weapon, notes")
    .eq("production_id", productionId)
    .order("prop_name");

  const rows = data || [];
  if (rows.length === 0) return "No props on file.";
  return rows
    .map((p) => {
      const qty = p.notes?.match(/Qty (\d+)/i)?.[1] || "1";
      return `(${qty}) ${p.prop_name}${p.is_weapon ? " **See Safety Note**" : ""}`;
    })
    .join("\n");
}

async function buildMics(supabase: SupabaseClient, productionId: string): Promise<string> {
  const { data } = await supabase
    .from("wireless_mics")
    .select("pack_number, input_type, is_backup, notes")
    .eq("production_id", productionId)
    .order("pack_number");

  const rows = data || [];
  if (rows.length === 0) return "No wireless mics on file.";
  const packs = rows.filter((m) => m.input_type !== "handheld");
  const handhelds = rows.filter((m) => m.input_type === "handheld");
  const lines: string[] = [];
  if (packs.length > 0) {
    lines.push(`Show-provided wireless head-mics with beltpacks: ${packs.length}`);
    lines.push(...packs.map((m) => `• ${m.pack_number}${m.is_backup ? " (backup)" : ""}`));
  }
  if (handhelds.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`Venue-provided wireless handhelds: ${handhelds.length}`);
    lines.push(...handhelds.map((m) => `• ${m.pack_number}${m.notes ? ` — ${m.notes.replace(/^Venue-provided wireless handheld: /, "")}` : ""}`));
  }
  return lines.join("\n");
}

async function buildScenery(supabase: SupabaseClient, productionId: string): Promise<string> {
  const { data } = await supabase
    .from("design_elements")
    .select("name, description, width_ft, depth_ft, height_ft, status")
    .eq("production_id", productionId)
    .eq("department", "set")
    .neq("status", "cut")
    .order("sort_order");

  const rows = data || [];
  if (rows.length === 0) return "No set elements on file.";
  return rows
    .map((e) => {
      const dims = `${fmtDim(e.width_ft)}W x ${fmtDim(e.depth_ft)}D x ${fmtDim(e.height_ft)}H`;
      return `${e.name} — ${dims}${e.description ? `\n${e.description}` : ""}`;
    })
    .join("\n\n");
}
