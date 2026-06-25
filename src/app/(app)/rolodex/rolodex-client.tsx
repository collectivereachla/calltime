"use client";

import { useMemo, useState } from "react";

interface Contact {
  id: string;
  type: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  zip: string | null;
  tags: string[] | null;
  lifetime_total: number | null;
  steward_tier: string | null;
  subscribed: boolean;
  first_season: number | null;
  source: string | null;
  notes: string | null;
  affiliated_contact_id?: string | null;
  affiliation_role?: string | null;
  affiliated_name?: string | null;
  in_kind?: string | null;
}
interface ActivityRow {
  contact_id: string;
  event_type: string | null;
  season: number | null;
  tickets_qty: number | null;
  tickets_amount: number | null;
  donation_amount: number | null;
  check_in_status: string | null;
  email_engagement: string | null;
  promo_code: string | null;
  platform: string | null;
}

const money = (n: number | null) =>
  "$" + (Number(n || 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RolodexClient({
  orgName,
  contacts,
  activity,
}: {
  orgName: string;
  contacts: Contact[];
  activity: ActivityRow[];
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [sub, setSub] = useState<string>("all");
  const [sort, setSort] = useState<"giving" | "name">("giving");
  const [open, setOpen] = useState<string | null>(null);

  const actByContact = useMemo(() => {
    const m = new Map<string, ActivityRow[]>();
    for (const a of activity) {
      if (!m.has(a.contact_id)) m.set(a.contact_id, []);
      m.get(a.contact_id)!.push(a);
    }
    return m;
  }, [activity]);

  const types = useMemo(() => {
    const s = new Set(contacts.map((c) => c.type));
    return ["all", ...Array.from(s).sort()];
  }, [contacts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = contacts.filter((c) => {
      if (type !== "all" && c.type !== type) return false;
      if (sub === "subscribed" && !c.subscribed) return false;
      if (sub === "unsubscribed" && c.subscribed) return false;
      if (needle) {
        const hay = `${c.full_name ?? ""} ${c.email ?? ""} ${c.city ?? ""} ${c.zip ?? ""} ${c.affiliated_name ?? ""} ${c.in_kind ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) =>
      sort === "name"
        ? (a.full_name ?? "").localeCompare(b.full_name ?? "")
        : Number(b.lifetime_total || 0) - Number(a.lifetime_total || 0)
    );
    return rows;
  }, [contacts, q, type, sub, sort]);

  const totalGiving = filtered.reduce((s, c) => s + Number(c.lifetime_total || 0), 0);
  const subscribedCount = filtered.filter((c) => c.subscribed).length;

  const tierColor = (t: string | null) =>
    t === "Major" ? "bg-brick/10 text-brick" : t === "Mid" ? "bg-ink/10 text-ink" : "bg-bone text-ash";

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
        <h1 className="font-display text-display-md text-ink">Rolodex</h1>
        <p className="text-body-xs text-muted uppercase tracking-wider">{orgName}</p>
      </div>
      <p className="text-body-sm text-ash mb-5">
        {filtered.length} of {contacts.length} contacts · {subscribedCount} subscribed · {money(totalGiving)} shown
      </p>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, city, zip…"
          className="flex-1 min-w-[200px] border border-bone rounded-md px-3 py-2 text-body-sm bg-paper text-ink placeholder:text-muted focus:outline-none focus:border-brick"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as "giving" | "name")}
          className="border border-bone rounded-md px-2 py-2 text-body-sm bg-paper text-ink">
          <option value="giving">Sort: Giving</option>
          <option value="name">Sort: Name</option>
        </select>
        <select value={sub} onChange={(e) => setSub(e.target.value)}
          className="border border-bone rounded-md px-2 py-2 text-body-sm bg-paper text-ink">
          <option value="all">All</option>
          <option value="subscribed">Subscribed</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {types.map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`text-body-xs px-3 py-1 rounded-full border transition-colors ${
              type === t ? "bg-brick text-paper border-brick" : "bg-paper text-ash border-bone hover:border-brick hover:text-brick"
            }`}>
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="border border-bone rounded-lg overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_2fr_1fr_1fr_0.8fr] gap-3 px-4 py-2 bg-bone/40 text-body-xs uppercase tracking-wider text-muted">
          <span>Name</span><span>Email</span><span>Location</span><span className="text-right">Lifetime</span><span className="text-right">Tier</span>
        </div>
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-body-sm text-ash">No contacts match.</p>
        )}
        {filtered.map((c) => {
          const acts = actByContact.get(c.id) ?? [];
          const isOpen = open === c.id;
          return (
            <div key={c.id} className="border-t border-bone first:border-t-0">
              <button onClick={() => setOpen(isOpen ? null : c.id)}
                className="w-full text-left grid grid-cols-1 md:grid-cols-[2fr_2fr_1fr_1fr_0.8fr] gap-1 md:gap-3 px-4 py-3 hover:bg-brick/5 transition-colors items-center">
                <span className="min-w-0">
                  <span className="text-body-sm text-ink font-medium">{c.full_name || "—"}</span>
                  {!c.subscribed && <span className="ml-2 text-[10px] uppercase tracking-wide text-ash">unsub</span>}
                  <span className="md:hidden block text-body-xs text-muted truncate">{c.email}</span>
                </span>
                <span className="hidden md:block text-body-sm text-ash truncate">{c.email || "—"}</span>
                <span className="hidden md:block text-body-sm text-ash truncate">{[c.city, c.zip].filter(Boolean).join(" ") || "—"}</span>
                <span className="text-body-sm text-ink md:text-right">{money(c.lifetime_total)}</span>
                <span className="md:text-right">
                  {c.steward_tier && (
                    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${tierColor(c.steward_tier)}`}>{c.steward_tier}</span>
                  )}
                </span>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pt-1 bg-bone/20 text-body-sm">
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-ash mb-3">
                    <span>Type: <span className="text-ink capitalize">{c.type}</span></span>
                    {c.phone && <span>Phone: <span className="text-ink">{c.phone}</span></span>}
                    {c.first_season && <span>First season: <span className="text-ink">{c.first_season}</span></span>}
                    {c.source && <span>Source: <span className="text-ink">{c.source}</span></span>}
                    {c.affiliated_name && <span>{c.affiliation_role || "Affiliated"}: <span className="text-ink">{c.affiliated_name}</span></span>}
                    {c.in_kind && <span>In-kind: <span className="text-ink">{c.in_kind}</span></span>}
                    {c.tags && c.tags.length > 0 && <span>Tags: <span className="text-ink">{c.tags.join(", ")}</span></span>}
                  </div>
                  {c.notes && <p className="text-ash mb-3 italic">{c.notes}</p>}
                  {acts.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-body-xs">
                        <thead>
                          <tr className="text-muted uppercase tracking-wider text-left">
                            <th className="py-1 pr-3 font-normal">Event</th>
                            <th className="py-1 pr-3 font-normal">Tickets</th>
                            <th className="py-1 pr-3 font-normal">Tickets $</th>
                            <th className="py-1 pr-3 font-normal">Donation</th>
                            <th className="py-1 pr-3 font-normal">Check-in</th>
                            <th className="py-1 pr-3 font-normal">Email</th>
                            <th className="py-1 pr-3 font-normal">Promo</th>
                            <th className="py-1 pr-3 font-normal">Platform</th>
                          </tr>
                        </thead>
                        <tbody className="text-ink">
                          {acts.map((a, i) => (
                            <tr key={i} className="border-t border-bone/60">
                              <td className="py-1 pr-3">{a.event_type || "—"}</td>
                              <td className="py-1 pr-3">{a.tickets_qty ?? 0}</td>
                              <td className="py-1 pr-3">{money(a.tickets_amount)}</td>
                              <td className="py-1 pr-3">{money(a.donation_amount)}</td>
                              <td className="py-1 pr-3">{a.check_in_status || "—"}</td>
                              <td className="py-1 pr-3">{a.email_engagement || "—"}</td>
                              <td className="py-1 pr-3">{a.promo_code || "—"}</td>
                              <td className="py-1 pr-3">{a.platform || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-ash">No recorded activity.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
