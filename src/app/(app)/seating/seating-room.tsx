"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  addSeatingTable,
  updateSeatingTable,
  removeSeatingTable,
  addSeatingGuest,
  updateSeatingGuest,
  removeSeatingGuest,
  setGuestCheckedIn,
  setSeatingPrice,
} from "./actions";

const C = {
  paper: "#FAF7F1", ink: "#1A1A1B", brick: "#C4522D", ash: "#7A726A",
  paperDeep: "#F1EBDF", line: "#E3DBCC", gold: "#B08A2E", green: "#3E5C4A",
};
const SOURCES = ["Zeffy", "Cash App", "Zelle", "Venmo", "Check", "Cash", "Card / Eventbrite", "Other"];
const STATUSES = ["Paid", "Partial", "Unpaid", "Comp"];
const STATUS_COLOR: Record<string, string> = { Paid: C.green, Partial: C.gold, Unpaid: C.brick, Comp: C.ash };
const serif = "'Newsreader', Georgia, 'Times New Roman', serif";
const sans = "'Inter', system-ui, -apple-system, sans-serif";
const money = (n: number) => "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Lightweight inline glyphs (the app uses text glyphs, not an icon library)
type IcoProps = { size?: number; color?: string; style?: React.CSSProperties };
const glyph = (ch: string) => function Ico({ size = 14, color = "currentColor", style }: IcoProps) {
  return <span style={{ fontSize: size, color, lineHeight: 1, display: "inline-block", ...style }}>{ch}</span>;
};
const Plus = glyph("+");
const Trash2 = glyph("✕");
const Printer = glyph("⎙");
const MapPin = glyph("◍");
const Users = glyph("◎");
const ClipboardList = glyph("▤");
const X = glyph("✕");
const CircleDollarSign = glyph("$");

type Table = { id: string; number: number; name: string | null; capacity: number; x: number; y: number; amount: number | null; source: string | null; status: string };
type Guest = { id: string; name: string; party_size: number; amount: number | null; source: string | null; status: string; table_id: string | null; notes: string | null; checked_in?: boolean; event_tag?: string | null };
type Totals = { collected: number; heads: number; seated: number; bySource: Record<string, number>; outstanding: Guest[]; projected: number | null };

const persist = (p: Promise<unknown>) => { p.catch((e) => console.error("seating save failed:", e)); };

export function SeatingRoom({
  productionId, productionTitle, canEdit, initialTables, initialGuests, initialPrice,
}: {
  productionId: string; productionTitle: string; canEdit: boolean;
  initialTables: Table[]; initialGuests: Guest[]; initialPrice: string;
}) {
  const [tab, setTab] = useState<"roster" | "floor" | "checkin">("roster");
  const [eventFilter, setEventFilter] = useState<"both" | "jubilee" | "show">("both");
  const [tables, setTables] = useState<Table[]>(initialTables);
  const [guests, setGuests] = useState<Guest[]>(initialGuests);
  const [price, setPrice] = useState(initialPrice);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  useEffect(() => {
    try {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Inter:wght@400;500;600&display=swap";
      document.head.appendChild(l);
    } catch { /* noop */ }
  }, []);

  const occupancyOf = useCallback(
    (tableId: string) => guests.filter((g) => g.table_id === tableId).reduce((s, g) => s + (Number(g.party_size) || 0), 0),
    [guests]
  );

  // Event filter (Jubilee / Performance / Both). Drives the check-in tab,
  // the guests list, and the floor plan. A production only has event tags if
  // its guests were imported with one (TJS does); otherwise this is inert and
  // every view shows the full roster, exactly as before.
  const hasEventData = guests.some((g) => g.event_tag === "show" || g.event_tag === "jubilee");
  const jubileeGuests = guests.filter((g) => g.event_tag === "jubilee");
  const showGuests = guests.filter((g) => g.event_tag === "show");
  const filteredGuests =
    !hasEventData || eventFilter === "both"
      ? guests
      : eventFilter === "jubilee"
      ? jubileeGuests
      : showGuests;

  const totals = (() => {
    // Tables are sold as a unit; GA (unseated) is sold per seat. Seated guests
    // carry no payment — the table holds it. Counts follow the event filter.
    const tableMoney = tables.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const gaMoney = filteredGuests.reduce((s, g) => s + (Number(g.amount) || 0), 0);
    const collected = tableMoney + gaMoney;
    const heads = filteredGuests.reduce((s, g) => s + (Number(g.party_size) || 0), 0);
    const seated = filteredGuests.filter((g) => g.table_id).reduce((s, g) => s + (Number(g.party_size) || 0), 0);
    const bySource: Record<string, number> = {};
    SOURCES.forEach((s) => (bySource[s] = 0));
    tables.forEach((t) => { if (t.source) bySource[t.source] = (bySource[t.source] || 0) + (Number(t.amount) || 0); });
    filteredGuests.forEach((g) => { if (g.source) bySource[g.source] = (bySource[g.source] || 0) + (Number(g.amount) || 0); });
    const outstanding = filteredGuests.filter((g) => g.status === "Unpaid" || g.status === "Partial");
    const projected = price ? Number(price) * heads : null;
    return { collected, heads, seated, bySource, outstanding, projected };
  })();

  // ---- guest ops ----
  const addParty = async () => {
    const row = await addSeatingGuest(productionId, null, "", 1);
    if (row) setGuests((g) => [...g, row as Guest]);
  };
  const updateGuest = (id: string, patch: Partial<Guest>, save = true) => {
    setGuests((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    if (save) persist(updateSeatingGuest(id, patch as Record<string, unknown>));
  };
  const removeGuest = (id: string) => {
    setGuests((gs) => gs.filter((g) => g.id !== id));
    persist(removeSeatingGuest(id));
  };
  const addGuestToTable = async (tableId: string, name: string, size: number) => {
    const row = await addSeatingGuest(productionId, tableId, name, size);
    if (row) setGuests((g) => [...g, row as Guest]);
  };
  const checkIn = (id: string, value: boolean) => {
    setGuests((gs) => gs.map((g) => (g.id === id ? { ...g, checked_in: value } : g)));
    persist(setGuestCheckedIn(id, value));
  };
  const addWalkIn = async (name: string, tableId: string | null) => {
    const row = (await addSeatingGuest(productionId, tableId, name, 1)) as Guest | undefined;
    if (!row) return;
    setGuests((g) => [...g, { ...row, checked_in: true }]);
    persist(setGuestCheckedIn(row.id, true));
  };

  // ---- table ops ----
  const addTable = async () => {
    const row = await addSeatingTable(productionId);
    if (row) setTables((t) => [...t, row as Table]);
  };
  const updateTable = (id: string, patch: Partial<Table>, save = true) => {
    setTables((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (save) persist(updateSeatingTable(id, patch as Record<string, unknown>));
  };
  const removeTable = (id: string) => {
    setTables((ts) => ts.filter((t) => t.id !== id));
    setGuests((gs) => gs.map((g) => (g.table_id === id ? { ...g, table_id: null } : g)));
    if (selectedTable === id) setSelectedTable(null);
    persist(removeSeatingTable(id));
  };

  const changePrice = (v: string) => {
    const clean = v.replace(/[^0-9.]/g, "");
    setPrice(clean);
    persist(setSeatingPrice(productionId, clean));
  };

  return (
    <div style={{ fontFamily: sans, background: C.paper, color: C.ink, minHeight: 720, padding: "0 0 40px" }}>
      <style>{`
        .ct-input { font-family:${sans}; font-size:13px; color:${C.ink}; background:${C.paper};
          border:1px solid ${C.line}; border-radius:6px; padding:6px 8px; outline:none; width:100%; }
        .ct-input:focus { border-color:${C.brick}; }
        .ct-input:disabled { background:${C.paperDeep}; color:${C.ink}; opacity:1; }
        .ct-btn { font-family:${sans}; cursor:pointer; border:none; border-radius:8px; display:inline-flex;
          align-items:center; gap:7px; font-weight:500; transition:.15s; }
        .ct-tab { cursor:pointer; padding:10px 4px; font-weight:500; font-size:14px; letter-spacing:.01em;
          border:none; background:none; color:${C.ash}; border-bottom:2px solid transparent; display:inline-flex; gap:8px; align-items:center; }
        .ct-tab.active { color:${C.ink}; border-bottom-color:${C.brick}; }
        .ct-row:hover { background:${C.paperDeep}; }
        @media print { .no-print { display:none !important; } }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.line}`, padding: "26px 34px 0", background: C.paper }}>
        <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: C.brick, fontWeight: 600 }}>
          {productionTitle}
        </div>
        <h1 style={{ fontFamily: serif, fontSize: 34, fontWeight: 500, margin: "6px 0 2px", lineHeight: 1.05 }}>Seating</h1>
        <div style={{ color: C.ash, fontSize: 14, marginBottom: 20 }}>
          Seating &amp; payment ledger{!canEdit && " · view only"}
        </div>
        <div style={{ display: "flex", gap: 26, alignItems: "center", flexWrap: "wrap" }} className="no-print">
          <button className={`ct-tab ${tab === "roster" ? "active" : ""}`} onClick={() => setTab("roster")}>
            <ClipboardList size={16} /> Guests &amp; Payments
          </button>
          <button className={`ct-tab ${tab === "checkin" ? "active" : ""}`} onClick={() => setTab("checkin")}>
            <Users size={16} /> Check-in
          </button>
          <button className={`ct-tab ${tab === "floor" ? "active" : ""}`} onClick={() => setTab("floor")}>
            <MapPin size={16} /> Floor Plan
          </button>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Printer size={14} color={C.ash} />
            <select
              className="ct-input"
              style={{ width: "auto", minWidth: 190, cursor: "pointer", paddingRight: 24 }}
              value=""
              onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) printReport(v, guests, tables, productionTitle); }}
            >
              <option value="">Print a report…</option>
              <option value="checkin">Check-in sheet (A–Z, with tables)</option>
              <option value="alpha_tables">Guest list (A–Z, with tables)</option>
              <option value="alpha_names">Guest list (A–Z, names only)</option>
              <option value="bytable">Seating by table</option>
            </select>
          </span>
        </div>

        {hasEventData && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "16px 0 18px", flexWrap: "wrap" }} className="no-print">
            <span style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C.ash, fontWeight: 600, marginRight: 4 }}>Event</span>
            {([
              ["both", "Both", guests.length],
              ["show", "Performance", showGuests.length],
              ["jubilee", "Jubilee", jubileeGuests.length],
            ] as const).map(([key, label, count]) => {
              const active = eventFilter === key;
              return (
                <button key={key} className="ct-btn" onClick={() => setEventFilter(key)}
                  style={{
                    background: active ? C.brick : C.paper, color: active ? C.paper : C.ink,
                    border: `1px solid ${active ? C.brick : C.line}`, padding: "6px 13px", fontSize: 13,
                  }}>
                  {label}<span style={{ opacity: 0.7, marginLeft: 6, fontSize: 12 }}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary band */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 0, borderBottom: `1px solid ${C.line}`, background: C.paperDeep }}>
        <Stat label="Collected" value={money(totals.collected)} accent={C.green} />
        <Stat label="Guests" value={totals.heads} />
        {!hasEventData && <Stat label="Seated" value={`${totals.seated} / ${totals.heads}`} />}
        {!hasEventData && <Stat label="Tables" value={tables.length} />}
        {totals.projected != null && <Stat label="Projected" value={money(totals.projected)} sub={`@ ${money(Number(price))}/seat`} />}
        <Stat label="Outstanding" value={totals.outstanding.length} accent={totals.outstanding.length ? C.brick : C.ash} />
      </div>

      {tab === "roster" ? (
        <Roster
          guests={filteredGuests} tables={tables} totals={totals} price={price} canEdit={canEdit}
          changePrice={changePrice} addParty={addParty} updateGuest={updateGuest} removeGuest={removeGuest} occupancyOf={occupancyOf}
        />
      ) : tab === "checkin" ? (
        <CheckIn
          guests={filteredGuests} tables={tables} canEdit={canEdit}
          checkIn={checkIn} addWalkIn={addWalkIn} occupancyOf={occupancyOf}
        />
      ) : (
        <FloorPlan
          tables={tables} guests={guests} canEdit={canEdit} productionTitle={productionTitle}
          addTable={addTable} updateTable={updateTable} removeTable={removeTable}
          updateGuest={updateGuest} addGuestToTable={addGuestToTable} occupancyOf={occupancyOf}
          selectedTable={selectedTable} setSelectedTable={setSelectedTable}
          hasEventData={hasEventData} eventFilter={eventFilter} showGuests={showGuests} jubileeGuests={jubileeGuests}
        />
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div style={{ padding: "14px 22px", borderRight: `1px solid ${C.line}`, minWidth: 110 }}>
      <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: C.ash, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 500, color: accent || C.ink, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.ash }}>{sub}</div>}
    </div>
  );
}

type RosterProps = {
  guests: Guest[]; tables: Table[]; totals: Totals;
  price: string; canEdit: boolean; changePrice: (v: string) => void; addParty: () => void;
  updateGuest: (id: string, patch: Partial<Guest>, save?: boolean) => void; removeGuest: (id: string) => void; occupancyOf: (id: string) => number;
};

function Roster({ guests, tables, totals, price, canEdit, changePrice, addParty, updateGuest, removeGuest, occupancyOf }: RosterProps) {
  const cell = { padding: "7px 10px", borderBottom: `1px solid ${C.line}`, verticalAlign: "middle" as const };
  const th = { ...cell, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" as const, color: C.ash, fontWeight: 600, textAlign: "left" as const, background: C.paper };

  return (
    <div style={{ padding: "22px 34px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap", gap: 12 }} className="no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CircleDollarSign size={15} color={C.ash} />
          <span style={{ fontSize: 12, color: C.ash }}>Seat price (optional)</span>
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 8, color: C.ash, fontSize: 13 }}>$</span>
            <input className="ct-input" style={{ width: 90, paddingLeft: 18 }} value={price} disabled={!canEdit}
              onChange={(e) => changePrice(e.target.value)} placeholder="0.00" />
          </span>
        </div>
        {canEdit && (
          <button className="ct-btn" style={{ background: C.brick, color: C.paper, padding: "9px 16px", fontSize: 13 }} onClick={addParty}>
            <Plus size={15} /> Add party
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {SOURCES.filter((s) => totals.bySource[s] > 0).map((s) => (
          <div key={s} style={{ background: C.paperDeep, border: `1px solid ${C.line}`, borderRadius: 999, padding: "5px 13px", fontSize: 12 }}>
            <span style={{ color: C.ash }}>{s}</span>
            <span style={{ color: C.ink, fontWeight: 600, marginLeft: 8 }}>{money(totals.bySource[s])}</span>
          </div>
        ))}
        {totals.collected === 0 && <div style={{ color: C.ash, fontSize: 13, fontStyle: "italic" }}>No payments entered yet.</div>}
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "22%" }}>Party / Name</th>
              <th style={{ ...th, width: 70 }}>Size</th>
              <th style={{ ...th, width: 110 }}>Amount</th>
              <th style={{ ...th, width: 150 }}>Source</th>
              <th style={{ ...th, width: 110 }}>Status</th>
              <th style={{ ...th, width: 90 }}>Table</th>
              <th style={th}>Notes</th>
              {canEdit && <th style={{ ...th, width: 40 }}></th>}
            </tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id} className="ct-row">
                <td style={cell}><input className="ct-input" value={g.name} placeholder="Name or party" disabled={!canEdit}
                  onChange={(e) => updateGuest(g.id, { name: e.target.value }, false)} onBlur={(e) => updateGuest(g.id, { name: e.target.value })} /></td>
                <td style={cell}><input className="ct-input" type="number" min="1" value={g.party_size} disabled={!canEdit}
                  onChange={(e) => updateGuest(g.id, { party_size: Number(e.target.value) || 1 })} /></td>
                <td style={cell}><input className="ct-input" value={g.amount == null ? "" : String(g.amount)} placeholder="0.00" disabled={!canEdit}
                  onChange={(e) => updateGuest(g.id, { amount: (e.target.value.replace(/[^0-9.]/g, "") || null) as unknown as number | null }, false)}
                  onBlur={(e) => updateGuest(g.id, { amount: (e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, ""))) })} /></td>
                <td style={cell}>
                  <select className="ct-input" value={g.source || ""} disabled={!canEdit} onChange={(e) => updateGuest(g.id, { source: e.target.value })}>
                    <option value="">—</option>
                    {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={cell}>
                  <select className="ct-input" value={g.status} disabled={!canEdit} style={{ color: STATUS_COLOR[g.status], fontWeight: 600 }}
                    onChange={(e) => updateGuest(g.id, { status: e.target.value })}>
                    {STATUSES.map((s) => <option key={s} value={s} style={{ color: C.ink }}>{s}</option>)}
                  </select>
                </td>
                <td style={cell}>
                  <select className="ct-input" value={g.table_id || ""} disabled={!canEdit} onChange={(e) => updateGuest(g.id, { table_id: e.target.value || null })}>
                    <option value="">—</option>
                    {tables.map((t) => {
                      const occ = occupancyOf(t.id);
                      const full = occ >= t.capacity && g.table_id !== t.id;
                      return <option key={t.id} value={t.id}>{`T${t.number}${t.name ? " " + t.name : ""}${full ? " (full)" : ""}`}</option>;
                    })}
                  </select>
                </td>
                <td style={cell}><input className="ct-input" value={g.notes || ""} placeholder="" disabled={!canEdit}
                  onChange={(e) => updateGuest(g.id, { notes: e.target.value }, false)} onBlur={(e) => updateGuest(g.id, { notes: e.target.value })} /></td>
                {canEdit && (
                  <td style={{ ...cell, textAlign: "center" }}>
                    <button className="ct-btn no-print" style={{ background: "none", padding: 4 }} onClick={() => removeGuest(g.id)}>
                      <Trash2 size={14} color={C.ash} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {guests.length === 0 && (
              <tr><td colSpan={canEdit ? 8 : 7} style={{ padding: "34px", textAlign: "center", color: C.ash, fontStyle: "italic" }}>
                No parties yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totals.outstanding.length > 0 && (
        <div style={{ marginTop: 16, background: "#FBEEE8", border: `1px solid ${C.brick}33`, borderRadius: 8, padding: "12px 16px" }}>
          <span style={{ fontWeight: 600, color: C.brick, fontSize: 13 }}>{totals.outstanding.length} outstanding</span>
          <span style={{ color: C.ash, fontSize: 13 }}> — {totals.outstanding.map((g) => g.name || "unnamed").join(", ")}</span>
        </div>
      )}
    </div>
  );
}

type FloorProps = {
  tables: Table[]; guests: Guest[]; canEdit: boolean; productionTitle: string;
  addTable: () => void; updateTable: (id: string, patch: Partial<Table>, save?: boolean) => void; removeTable: (id: string) => void;
  updateGuest: (id: string, patch: Partial<Guest>, save?: boolean) => void; addGuestToTable: (tableId: string, name: string, size: number) => void;
  occupancyOf: (id: string) => number; selectedTable: string | null; setSelectedTable: (id: string | null) => void;
  hasEventData: boolean; eventFilter: "both" | "jubilee" | "show"; showGuests: Guest[]; jubileeGuests: Guest[];
};

function FloorPlan({ tables, guests, canEdit, productionTitle, addTable, updateTable, removeTable, updateGuest, addGuestToTable, occupancyOf, selectedTable, setSelectedTable, hasEventData, eventFilter, showGuests, jubileeGuests }: FloorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [newName, setNewName] = useState("");
  const [newSize, setNewSize] = useState(1);
  const [seatQuery, setSeatQuery] = useState("");

  // latest tables, so pointer-up can persist final coords from a stable closure
  const tablesRef = useRef(tables);
  tablesRef.current = tables;
  const persistMove = (id: string, x: number, y: number) => updateTable(id, { x, y });

  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.width - 120, e.clientX - rect.left - drag.current.dx));
    const y = Math.max(8, Math.min(rect.height - 120, e.clientY - rect.top - drag.current.dy));
    updateTable(drag.current.id, { x, y }, false);
  };
  const onPointerUp = () => {
    if (drag.current) {
      const t = tablesRef.current.find((x) => x.id === drag.current!.id);
      if (t) persistMove(t.id, t.x, t.y);
    }
    drag.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  const onPointerDown = (e: React.PointerEvent, t: Table) => {
    if (!canEdit) return;
    if ((e.target as HTMLElement).dataset && (e.target as HTMLElement).dataset.nodrag) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    drag.current = { id: t.id, dx: e.clientX - rect.left - t.x, dy: e.clientY - rect.top - t.y };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const sel = tables.find((t) => t.id === selectedTable) || null;
  const seatedAt = sel ? guests.filter((g) => g.table_id === sel.id) : [];
  const others = sel ? guests.filter((g) => g.table_id !== sel.id) : [];

  const tableColor = (occ: number, cap: number) => {
    if (occ === 0) return { fill: C.paper, ring: C.line, text: C.ash };
    if (occ > cap) return { fill: "#7A1E12", ring: "#7A1E12", text: C.paper };
    if (occ >= cap) return { fill: C.brick, ring: C.brick, text: C.paper };
    return { fill: "#E8C9BC", ring: C.brick, text: C.ink };
  };

  // The Juneteenth Story (and any production imported with Jubilee/Performance
  // tags) gets the venue seat map + Jubilee list instead of the banquet-table
  // canvas. Productions without event tags keep the original table planner.
  if (hasEventData) {
    return (
      <EventFloorPlan
        eventFilter={eventFilter}
        showGuests={showGuests}
        jubileeGuests={jubileeGuests}
        productionTitle={productionTitle}
      />
    );
  }

  return (
    <div style={{ padding: "20px 34px", display: "flex", flexDirection: "column", gap: 20, alignItems: "stretch" }}>
      <div style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }} className="no-print">
          <div style={{ fontSize: 12, color: C.ash }}>{canEdit ? "Drag tables to arrange the room. Tap a table to name it and seat guests." : "Tap a table to see who's seated."}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ct-btn" style={{ background: C.paperDeep, color: C.ink, border: `1px solid ${C.line}`, padding: "8px 13px", fontSize: 13 }} onClick={() => printFloorPlan(tables, guests, productionTitle)}>
              <Printer size={14} /> Print map
            </button>
            {canEdit && (
              <button className="ct-btn" style={{ background: C.brick, color: C.paper, padding: "8px 14px", fontSize: 13 }} onClick={addTable}>
                <Plus size={15} /> Add table
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowX: "auto", width: "100%" }}>
        <div ref={canvasRef} style={{
          position: "relative", width: 1040, height: 900, margin: "0 auto", background: C.paper,
          border: `1px solid ${C.line}`, borderRadius: 10,
          backgroundImage: `radial-gradient(${C.line} 1px, transparent 1px)`, backgroundSize: "26px 26px",
        }}>
          {/* stage marker + center runway */}
          <div style={{
            position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
            border: `1px dashed ${C.ash}`, color: C.ash, fontSize: 10, letterSpacing: ".2em",
            padding: "4px 26px", borderRadius: 4, textTransform: "uppercase",
          }}>Stage</div>
          <div title="Runway" style={{
            position: "absolute", top: 36, left: "50%", transform: "translateX(-50%)",
            width: 34, height: 118, background: `${C.brick}14`, border: `1px dashed ${C.brick}`,
            borderTop: "none", borderRadius: "0 0 6px 6px",
          }} />

          {tables.map((t) => {
            const occ = occupancyOf(t.id);
            const col = tableColor(occ, t.capacity);
            const isSel = selectedTable === t.id;
            return (
              <div key={t.id} onPointerDown={(e) => onPointerDown(e, t)} onClick={() => setSelectedTable(t.id)}
                style={{
                  position: "absolute", left: t.x, top: t.y, width: 104, height: 104, borderRadius: "50%",
                  background: col.fill, border: `2px solid ${isSel ? C.ink : col.ring}`,
                  boxShadow: isSel ? "0 6px 18px rgba(0,0,0,.18)" : "0 2px 6px rgba(0,0,0,.08)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  cursor: canEdit ? "grab" : "pointer", touchAction: "none", userSelect: "none", padding: 4, textAlign: "center",
                }}>
                <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 600, color: col.text, lineHeight: 1 }}>{t.number}</div>
                {t.name && <div style={{ fontSize: 9.5, color: col.text, marginTop: 2, lineHeight: 1.1, maxWidth: 92, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>}
                <div style={{ fontSize: 11, color: col.text, marginTop: 2 }}>{occ}/{t.capacity}</div>
              </div>
            );
          })}
          {tables.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.ash, fontStyle: "italic", fontSize: 14 }}>
              No tables yet.
            </div>
          )}
        </div>
        </div>

        <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 11, color: C.ash, flexWrap: "wrap" }}>
          <Legend color={C.paper} ring={C.line} label="Empty" />
          <Legend color="#E8C9BC" ring={C.brick} label="Partly seated" />
          <Legend color={C.brick} ring={C.brick} label="Full" />
          <Legend color="#7A1E12" ring="#7A1E12" label="Over capacity" />
        </div>
      </div>

      {/* table detail panel — below the map */}
      <div style={{ width: "100%", maxWidth: 640, margin: "0 auto" }} className="no-print">
        {sel ? (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ background: C.paperDeep, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ fontFamily: serif, fontSize: 19, fontWeight: 500 }}>Table {sel.number}{sel.name ? ` · ${sel.name}` : ""}</div>
              <button className="ct-btn" style={{ background: "none", padding: 4 }} onClick={() => setSelectedTable(null)}><X size={16} color={C.ash} /></button>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C.ash, fontWeight: 600 }}>Table number</label>
              <input className="ct-input" data-nodrag type="number" min="1" value={sel.number} disabled={!canEdit} style={{ marginTop: 4, marginBottom: 14 }}
                onChange={(e) => updateTable(sel.id, { number: Number(e.target.value) || 1 })} />

              <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C.ash, fontWeight: 600 }}>Name (optional)</label>
              <input className="ct-input" data-nodrag value={sel.name || ""} placeholder="e.g. Ochsner, Head Table" disabled={!canEdit} style={{ marginTop: 4, marginBottom: 14 }}
                onChange={(e) => updateTable(sel.id, { name: e.target.value }, false)} onBlur={(e) => updateTable(sel.id, { name: e.target.value })} />

              <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C.ash, fontWeight: 600 }}>Capacity</label>
              <input className="ct-input" data-nodrag type="number" min="1" value={sel.capacity} disabled={!canEdit} style={{ marginTop: 4, marginBottom: 14 }}
                onChange={(e) => updateTable(sel.id, { capacity: Number(e.target.value) || 1 })} />

              <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C.ash, fontWeight: 600 }}>Table purchase</label>
              <div style={{ display: "flex", gap: 6, marginTop: 4, marginBottom: 14 }}>
                <span style={{ position: "relative", display: "inline-flex", alignItems: "center", flex: "0 0 86px" }}>
                  <span style={{ position: "absolute", left: 8, color: C.ash, fontSize: 13 }}>$</span>
                  <input className="ct-input" data-nodrag value={sel.amount == null ? "" : String(sel.amount)} placeholder="0" disabled={!canEdit} style={{ paddingLeft: 18 }}
                    onChange={(e) => updateTable(sel.id, { amount: (e.target.value.replace(/[^0-9.]/g, "") || null) as unknown as number | null }, false)}
                    onBlur={(e) => updateTable(sel.id, { amount: (e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, ""))) })} />
                </span>
                <select className="ct-input" data-nodrag value={sel.source || ""} disabled={!canEdit} onChange={(e) => updateTable(sel.id, { source: e.target.value })}>
                  <option value="">—</option>
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="ct-input" data-nodrag value={sel.status} disabled={!canEdit} style={{ color: STATUS_COLOR[sel.status], fontWeight: 600, flex: "0 0 92px" }} onChange={(e) => updateTable(sel.id, { status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s} style={{ color: C.ink }}>{s}</option>)}
                </select>
              </div>

              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C.ash, fontWeight: 600, marginBottom: 6 }}>
                <Users size={12} style={{ verticalAlign: "middle", marginRight: 6 }} />
                Seated ({occupancyOf(sel.id)}/{sel.capacity})
              </div>
              {seatedAt.length === 0 && <div style={{ fontSize: 13, color: C.ash, fontStyle: "italic", marginBottom: 10 }}>No one seated here yet.</div>}
              {seatedAt.map((g) => (
                <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ fontSize: 13 }}>{g.name || "unnamed"} <span style={{ color: C.ash }}>· {g.party_size}</span></span>
                  {canEdit && <button className="ct-btn" style={{ background: "none", padding: 2, color: C.brick, fontSize: 12 }} onClick={() => updateGuest(g.id, { table_id: null })}>remove</button>}
                </div>
              ))}

              {canEdit && (
                <>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C.ash, fontWeight: 600, margin: "16px 0 6px" }}>Add a name to this table</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                    <input className="ct-input" data-nodrag value={newName} placeholder="Guest name"
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) { addGuestToTable(sel.id, newName, newSize); setNewName(""); setNewSize(1); } }} />
                    <input className="ct-input" data-nodrag type="number" min="1" value={newSize} style={{ width: 64 }} onChange={(e) => setNewSize(Number(e.target.value) || 1)} />
                    <button className="ct-btn" data-nodrag style={{ background: C.brick, color: C.paper, padding: "0 12px", fontSize: 13 }}
                      onClick={() => { if (newName.trim()) { addGuestToTable(sel.id, newName, newSize); setNewName(""); setNewSize(1); } }}>
                      <Plus size={14} />
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: C.ash, marginBottom: 4, lineHeight: 1.35 }}>
                    For a bought table, set the purchase row’s size to 0 (or delete it) once you name individuals, so the head count isn’t counted twice.
                  </div>

                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C.ash, fontWeight: 600, margin: "16px 0 6px" }}>Seat someone from the list</div>
                  <input className="ct-input" data-nodrag value={seatQuery} placeholder="Search guests…" style={{ marginBottom: 6 }} onChange={(e) => setSeatQuery(e.target.value)} />
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {others.filter((g) => (g.name || "").toLowerCase().includes(seatQuery.trim().toLowerCase())).slice(0, 50).map((g) => {
                      const cur = g.table_id ? tables.find((t) => t.id === g.table_id) : null;
                      return (
                        <button key={g.id} className="ct-btn" data-nodrag style={{ width: "100%", justifyContent: "space-between", background: C.paper, border: `1px solid ${C.line}`, padding: "8px 11px", marginBottom: 6, fontSize: 13, color: C.ink }}
                          onClick={() => updateGuest(g.id, { table_id: sel.id })}>
                          <span>{g.name || "unnamed"} <span style={{ color: C.ash }}>· {g.party_size}{cur ? ` · now at T${cur.number}` : " · unseated"}</span></span>
                          <Plus size={14} color={C.brick} />
                        </button>
                      );
                    })}
                    {others.length === 0 && <div style={{ fontSize: 13, color: C.ash, fontStyle: "italic" }}>Everyone is seated here.</div>}
                  </div>

                  <button className="ct-btn" style={{ marginTop: 16, background: "none", color: C.brick, padding: "6px 0", fontSize: 13 }} onClick={() => removeTable(sel.id)}>
                    <Trash2 size={14} /> Delete table {sel.number}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: "30px 20px", textAlign: "center", color: C.ash, fontSize: 13 }}>
            Tap a table to {canEdit ? "name it and seat guests" : "see who's seated"}.
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, ring, label }: { color: string; ring: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 14, height: 14, borderRadius: "50%", background: color, border: `2px solid ${ring}`, display: "inline-block" }} />
      {label}
    </span>
  );
}

/* ----------------------- Check-in (day-of door tool) ----------------------- */

const surnameKey = (name: string) => {
  const parts = (name || "").trim().split(/\s+/);
  const last = parts.length ? parts[parts.length - 1] : "";
  return (last + " " + (name || "")).toLowerCase();
};

function tableLabelFor(g: Guest, tables: Table[]): string {
  if (!g.table_id) return "—";
  const t = tables.find((x) => x.id === g.table_id);
  if (!t) return "—";
  return `Table ${t.number}${t.name ? " · " + t.name : ""}`;
}

// Show-seat buyers carry their seat assignment in notes as "Show: <Section> <seats>".
// Return just the seat designation for display, or null if this row has no show seats.
function showSeatLabel(notes?: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/^\s*Show:\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

type CheckInProps = {
  guests: Guest[]; tables: Table[]; canEdit: boolean;
  checkIn: (id: string, value: boolean) => void;
  addWalkIn: (name: string, tableId: string | null) => void;
  occupancyOf: (id: string) => number;
};

function CheckIn({ guests, tables, canEdit, checkIn, addWalkIn, occupancyOf }: CheckInProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "remaining" | "arrived">("all");
  const [walkName, setWalkName] = useState("");
  const [walkTable, setWalkTable] = useState("");
  const [showWalk, setShowWalk] = useState(false);

  const totalHeads = guests.reduce((s, g) => s + (Number(g.party_size) || 0), 0);
  const arrivedHeads = guests.filter((g) => g.checked_in).reduce((s, g) => s + (Number(g.party_size) || 0), 0);
  const arrivedParties = guests.filter((g) => g.checked_in).length;

  const q = query.trim().toLowerCase();
  const list = guests
    .filter((g) => (filter === "all" ? true : filter === "arrived" ? g.checked_in : !g.checked_in))
    .filter((g) => {
      if (!q) return true;
      return (g.name || "").toLowerCase().includes(q) || tableLabelFor(g, tables).toLowerCase().includes(q) || (showSeatLabel(g.notes) || "").toLowerCase().includes(q);
    })
    .sort((a, b) => surnameKey(a.name).localeCompare(surnameKey(b.name)));

  const openTables = tables
    .map((t) => ({ t, open: t.capacity - occupancyOf(t.id) }))
    .filter((o) => o.open > 0)
    .sort((a, b) => a.t.number - b.t.number);

  const doWalkIn = () => {
    const name = walkName.trim();
    if (!name) return;
    addWalkIn(name, walkTable || null);
    setWalkName(""); setWalkTable("");
  };

  return (
    <div style={{ padding: "20px 34px", maxWidth: 760, margin: "0 auto" }}>
      {/* arrival tally */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontFamily: serif, fontSize: 30, fontWeight: 600, color: C.green, lineHeight: 1 }}>
          {arrivedHeads} <span style={{ color: C.ash, fontWeight: 400, fontSize: 20 }}>/ {totalHeads} guests in</span>
        </div>
        <div style={{ fontSize: 12, color: C.ash }}>{arrivedParties} of {guests.length} parties checked in</div>
      </div>

      {/* search */}
      <input
        className="ct-input"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a name (first or last) or a table…"
        style={{ fontSize: 16, padding: "11px 13px", marginBottom: 10 }}
      />

      {/* filter toggles + walk-in */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }} className="no-print">
        {(["all", "remaining", "arrived"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="ct-btn"
            style={{
              padding: "7px 14px", fontSize: 13, textTransform: "capitalize",
              background: filter === f ? C.ink : C.paperDeep, color: filter === f ? C.paper : C.ink,
              border: `1px solid ${filter === f ? C.ink : C.line}`,
            }}>
            {f === "remaining" ? "Not yet in" : f}
          </button>
        ))}
        {canEdit && (
          <button onClick={() => setShowWalk((s) => !s)} className="ct-btn"
            style={{ marginLeft: "auto", padding: "7px 14px", fontSize: 13, background: C.brick, color: C.paper }}>
            <Plus size={14} /> Walk-in
          </button>
        )}
      </div>

      {showWalk && canEdit && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center", background: C.paperDeep, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12 }} className="no-print">
          <input className="ct-input" style={{ flex: "1 1 200px" }} value={walkName} placeholder="Walk-in name"
            onChange={(e) => setWalkName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doWalkIn(); }} />
          <select className="ct-input" style={{ flex: "0 1 230px" }} value={walkTable} onChange={(e) => setWalkTable(e.target.value)}>
            <option value="">No table (seat later)</option>
            {openTables.map(({ t, open }) => (
              <option key={t.id} value={t.id}>{`Table ${t.number}${t.name ? " · " + t.name : ""} — ${open} open`}</option>
            ))}
          </select>
          <button className="ct-btn" style={{ background: C.green, color: C.paper, padding: "9px 15px", fontSize: 13 }} onClick={doWalkIn}>
            Add &amp; check in
          </button>
        </div>
      )}

      {/* the list */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
        {list.map((g) => {
          const inHere = !!g.checked_in;
          const placement = g.table_id ? tableLabelFor(g, tables) : showSeatLabel(g.notes);
          return (
            <div key={g.id} onClick={() => canEdit && checkIn(g.id, !inHere)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                borderBottom: `1px solid ${C.line}`, cursor: canEdit ? "pointer" : "default",
                background: inHere ? "#EAF1EC" : C.paper,
              }}>
              <span style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${inHere ? C.green : C.line}`, background: inHere ? C.green : C.paper,
                color: C.paper, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
              }}>{inHere ? "✓" : ""}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, color: C.ink, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {g.name || "(unnamed)"}{Number(g.party_size) > 1 ? <span style={{ color: C.ash, fontWeight: 400 }}> · party of {g.party_size}</span> : null}
                </div>
                <div style={{ fontSize: 12, color: placement ? C.ash : C.brick }}>{placement || "No table assigned"}</div>
              </div>
              {inHere && <span style={{ fontSize: 11, color: C.green, fontWeight: 600, flexShrink: 0 }}>IN</span>}
            </div>
          );
        })}
        {list.length === 0 && (
          <div style={{ padding: 28, textAlign: "center", color: C.ash, fontStyle: "italic" }}>
            {q ? `No one matches “${query}.”` : "No guests."}
          </div>
        )}
      </div>

      {/* open-seats helper for anyone without a table */}
      {openTables.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 12, color: C.ash }} className="no-print">
          <span style={{ fontWeight: 600, color: C.ink }}>Tables with open seats:</span>{" "}
          {openTables.map(({ t, open }) => `${t.number}${t.name ? " (" + t.name + ")" : ""} +${open}`).join(",  ")}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Print reports ------------------------------ */

function printReport(kind: string, guests: Guest[], tables: Table[], productionTitle: string) {
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const tLabel = (g: Guest) => {
    if (!g.table_id) return "";
    const t = tables.find((x) => x.id === g.table_id);
    return t ? `${t.number}${t.name ? " " + t.name : ""}` : "";
  };
  const byName = [...guests].sort((a, b) => surnameKey(a.name).localeCompare(surnameKey(b.name)));
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  let title = "Guest List";
  let body = "";

  if (kind === "checkin") {
    title = "Check-in Sheet";
    body = `<table><thead><tr><th class="box"></th><th>Name</th><th class="c">Party</th><th>Table</th></tr></thead><tbody>` +
      byName.map((g) => `<tr><td class="box">☐</td><td>${esc(g.name) || "<i>unnamed</i>"}</td><td class="c">${Number(g.party_size) > 1 ? g.party_size : ""}</td><td>${esc(tLabel(g))}</td></tr>`).join("") +
      `</tbody></table>`;
  } else if (kind === "alpha_tables") {
    title = "Guest List — by name";
    body = `<table><thead><tr><th>Name</th><th>Table</th></tr></thead><tbody>` +
      byName.map((g) => `<tr><td>${esc(g.name) || "<i>unnamed</i>"}</td><td>${esc(tLabel(g))}</td></tr>`).join("") +
      `</tbody></table>`;
  } else if (kind === "alpha_names") {
    title = "Guest List — names";
    body = `<table><thead><tr><th>Name</th></tr></thead><tbody>` +
      byName.map((g) => `<tr><td>${esc(g.name) || "<i>unnamed</i>"}</td></tr>`).join("") +
      `</tbody></table>`;
  } else if (kind === "bytable") {
    title = "Seating — by table";
    const ordered = [...tables].sort((a, b) => a.number - b.number);
    body = ordered.map((t) => {
      const gs = guests.filter((g) => g.table_id === t.id).sort((a, b) => surnameKey(a.name).localeCompare(surnameKey(b.name)));
      const occ = gs.reduce((s, g) => s + (Number(g.party_size) || 0), 0);
      const rows = gs.length
        ? gs.map((g) => `<li>${esc(g.name)}${Number(g.party_size) > 1 ? ` (party of ${g.party_size})` : ""}</li>`).join("")
        : `<li class="muted"><i>no guests yet</i></li>`;
      return `<div class="tbl"><h2>Table ${t.number}${t.name ? " — " + esc(t.name) : ""} <span class="cap">${occ}/${t.capacity}</span></h2><ul>${rows}</ul></div>`;
    }).join("");
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} — ${esc(productionTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; color:#1A1A1B; margin:28px; }
    h1 { font-family:'Newsreader',Georgia,serif; font-size:24px; margin:0 0 2px; }
    .sub { color:#7A726A; font-size:12px; margin-bottom:18px; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { text-align:left; text-transform:uppercase; letter-spacing:.08em; font-size:10px; color:#7A726A; border-bottom:2px solid #1A1A1B; padding:6px 8px; }
    td { padding:7px 8px; border-bottom:1px solid #E3DBCC; }
    .box { width:30px; font-size:16px; text-align:center; }
    .c { text-align:center; width:54px; }
    tr { page-break-inside: avoid; }
    .tbl { display:inline-block; width:48%; vertical-align:top; margin:0 1% 14px; page-break-inside:avoid; }
    .tbl h2 { font-family:'Newsreader',Georgia,serif; font-size:15px; margin:0 0 4px; border-bottom:1px solid #C4522D; padding-bottom:3px; }
    .tbl .cap { color:#7A726A; font-size:11px; font-weight:400; float:right; }
    .tbl ul { margin:0; padding-left:18px; } .tbl li { font-size:12.5px; padding:1px 0; } .muted { list-style:none; margin-left:-18px; color:#7A726A; }
    @media print { @page { margin:14mm; } }
  </style></head><body>
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(productionTitle)} · ${esc(today)} · ${guests.length} parties · ${guests.reduce((s, g) => s + (Number(g.party_size) || 0), 0)} guests</div>
  ${body}
  <script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups to print the report."); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

/* ------------------ Floor plan: one-page landscape print ------------------ */

function printFloorPlan(tables: Table[], guests: Guest[], productionTitle: string) {
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const occ = (id: string) => guests.filter((g) => g.table_id === id).reduce((s, g) => s + (Number(g.party_size) || 0), 0);
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const maxX = Math.max(940, ...tables.map((t) => t.x + 104));
  const maxY = Math.max(900, ...tables.map((t) => t.y + 104));

  const circles = tables.map((t) => {
    const o = occ(t.id);
    const cls = o > t.capacity ? "t over" : o >= t.capacity ? "t full" : o > 0 ? "t part" : "t";
    return `<div class="${cls}" style="left:${t.x}px;top:${t.y}px;">
      <div class="num">${t.number}</div><div class="nm">${esc(t.name)}</div><div class="cap">${o}/${t.capacity}</div></div>`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Floor Plan — ${esc(productionTitle)}</title>
  <style>
    *{box-sizing:border-box;} body{font-family:'Inter',system-ui,sans-serif;color:#1A1A1B;margin:0;padding:10px 14px;}
    h1{font-family:'Newsreader',Georgia,serif;font-size:20px;margin:0;}
    .sub{color:#7A726A;font-size:11px;margin:0 0 6px;}
    .plan{position:relative;width:${maxX}px;height:${maxY}px;zoom:0.78;}
    .stage{position:absolute;left:50%;top:6px;transform:translateX(-50%);border:1px dashed #C4522D;border-radius:6px;padding:5px 30px;font-size:11px;letter-spacing:.18em;color:#7A726A;background:#F3E9DF;}
    .runway{position:absolute;left:50%;top:32px;transform:translateX(-50%);width:34px;height:112px;border:1px dashed #C4522D;border-top:none;background:#F8F0E6;}
    .t{position:absolute;width:104px;height:104px;border-radius:50%;border:1.5px solid #C9BBA6;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:5px;}
    .t.part{background:#F3E5DC;} .t.full{background:#E8C9BC;border-color:#C4522D;} .t.over{background:#7A1E12;color:#fff;border-color:#7A1E12;}
    .t .num{font-family:'Newsreader',Georgia,serif;font-size:21px;font-weight:600;line-height:1;}
    .t .nm{font-size:9.5px;line-height:1.12;margin-top:2px;max-width:94px;overflow:hidden;}
    .t .cap{font-size:9px;color:#7A726A;margin-top:2px;} .t.over .cap{color:#f0d8d2;}
    @media print{ @page{ size:landscape; margin:8mm; } body{padding:0;} }
  </style></head><body>
  <h1>Floor Plan</h1><div class="sub">${esc(productionTitle)} · ${esc(today)}</div>
  <div class="plan"><div class="stage">STAGE</div><div class="runway"></div>${circles}</div>
  <script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups to print the floor plan."); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

/* ====================================================================== */
/* The Juneteenth Story — event-aware floor plan                          */
/* Venue: Acadiana Center for the Arts (Moncus Theater), Lafayette.       */
/* Layout traced from the SimpleTix seat map. Occupancy comes from the    */
/* ticket export (seating_guests.notes), never from the map's colors —    */
/* those colors are live availability for the buyer, not our guest data.  */
/* ====================================================================== */

type Cell = {
  key: string;
  label: string;        // number shown on the seat
  id: string | null;    // canonical id matched against the export; null = never assignable
  seatLabel: string;    // human label for tooltips
  ada?: boolean;
  partial?: boolean;    // partial-view seat (rendered half-toned)
};

// Export Section Titles, longest first so a prefix never mis-binds.
const SHOW_SECTIONS = [
  "Front Orchestra", "Rear Orchestra", "Orchestra Left", "Orchestra Right",
  "Mezzanine Center", "Mezzanine Right", "Mezzanine Left",
].sort((a, b) => b.length - a.length);

// "Show: Front Orchestra A1, A2; Rear Orchestra G16" -> canonical seat ids.
function parseShowSeats(notes: string | null | undefined): string[] {
  if (!notes) return [];
  const body = notes.replace(/^\s*Show:\s*/i, "");
  const ids: string[] = [];
  for (const seg of body.split(";")) {
    const s = seg.trim();
    if (!s) continue;
    const section = SHOW_SECTIONS.find((sec) => s.toLowerCase().startsWith(sec.toLowerCase()));
    if (!section) continue;
    const rest = s.slice(section.length).trim();
    for (const tok of rest.split(",")) {
      const t = tok.trim();
      if (t) ids.push(`${section}|${t}`);
    }
  }
  return ids;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Orchestra rows: seats carry a row letter (A1, K19...). Export = "<Section> <Row><Seat>".
const orchSeats = (section: string, row: string, nums: number[]): Cell[] =>
  nums.map((n) => ({ key: `${section}-${row}-${n}`, label: String(n), id: `${section}|${row}${n}`, seatLabel: `${section} ${row}${n}` }));

const adaCell = (key: string): Cell => ({ key, label: "", id: null, seatLabel: "Accessible seating", ada: true });

// --- Center orchestra (no center aisle; even rows are staggered/inset) ---
const FRONT_ORCH: Cell[][] = [
  orchSeats("Front Orchestra", "A", range(1, 16)),
  orchSeats("Front Orchestra", "B", range(1, 15)),
  orchSeats("Front Orchestra", "C", range(1, 16)),
  orchSeats("Front Orchestra", "D", range(1, 15)),
  orchSeats("Front Orchestra", "E", range(1, 16)),
];
const REAR_ORCH: Cell[][] = [
  orchSeats("Rear Orchestra", "F", range(1, 14)),
  orchSeats("Rear Orchestra", "G", range(1, 16)),
  orchSeats("Rear Orchestra", "H", range(1, 16)),
  orchSeats("Rear Orchestra", "I", range(1, 16)),
  orchSeats("Rear Orchestra", "J", range(1, 16)),
  orchSeats("Rear Orchestra", "K", range(1, 19)),
];

// --- Orchestra Left/Right: two-seat-wide blocks flanking the front orchestra.
// Export uses bare seat numbers (1..12). Odd seats sit on the aisle (inner) side.
const orchSideRows = (section: string, innerOnLeft: boolean): Cell[][] => {
  const mk = (n: number): Cell => ({ key: `${section}-${n}`, label: String(n), id: `${section}|${n}`, seatLabel: `${section} ${n}` });
  const rows: Cell[][] = [];
  for (let p = 0; p < 6; p++) {
    const odd = p * 2 + 1, even = p * 2 + 2;
    rows.push(innerOnLeft ? [mk(odd), mk(even)] : [mk(even), mk(odd)]);
  }
  rows.push([adaCell(`${section}-ada1`), adaCell(`${section}-ada2`)]);
  return rows;
};
const ORCH_LEFT: Cell[][] = orchSideRows("Orchestra Left", false);  // aisle on the right
const ORCH_RIGHT: Cell[][] = orchSideRows("Orchestra Right", true); // aisle on the left

// --- Mezzanine side banks. Top three rows are pairs: the odd seat (1,3,5) sits
// inboard toward the stage, the even seat (2,4,6) sits outboard toward the wall and
// is partial-view. Seats 7-14 are a single column aligned under the inboard column.
const bankRows = (section: string, evenOutboardLeft: boolean): Cell[][] => {
  const mk = (n: number): Cell => ({
    key: `${section}-${n}`, label: String(n), id: `${section}|${n}`,
    seatLabel: `${section} ${n}`, partial: n % 2 === 0 && n <= 6,
  });
  const rows: Cell[][] = [];
  for (const odd of [1, 3, 5]) {
    const even = odd + 1;
    rows.push(evenOutboardLeft ? [mk(even), mk(odd)] : [mk(odd), mk(even)]);
  }
  for (const n of [7, 8, 9, 10, 11, 12, 13, 14]) rows.push([mk(n)]);
  return rows;
};
const MEZZ_LEFT_BANK = bankRows("Mezzanine Left", true);    // evens on the outer (left) side
const MEZZ_RIGHT_BANK = bankRows("Mezzanine Right", false); // evens on the outer (right) side

// --- Mezzanine / Balcony block. Export calls rows L & M "Mezzanine Center".
const BALCONY: Cell[][] = [
  orchSeats("Mezzanine Center", "L", range(2, 23)),
  orchSeats("Mezzanine Center", "M", range(1, 25)),
  [adaCell("balc-n-l1"), adaCell("balc-n-l2"), ...orchSeats("Mezzanine Center", "N", range(1, 21)), adaCell("balc-n-r1"), adaCell("balc-n-r2")],
];

const ALL_SEAT_IDS: Set<string> = (() => {
  const s = new Set<string>();
  for (const block of [FRONT_ORCH, REAR_ORCH, ORCH_LEFT, ORCH_RIGHT, BALCONY, MEZZ_LEFT_BANK, MEZZ_RIGHT_BANK]) for (const row of block) for (const c of row) if (c.id) s.add(c.id);
  return s;
})();

const rowLetterOf = (cells: Cell[]): string | undefined => {
  const c = cells.find((x) => !x.ada && x.id);
  const m = c?.seatLabel.match(/\s([A-Za-z])\d+$/);
  return m ? m[1] : undefined;
};

function SeatDot({ cell, guest }: { cell: Cell; guest?: Guest }) {
  const SIZE = 25;
  const base: React.CSSProperties = {
    width: SIZE, height: SIZE, borderRadius: "50%", display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: 10.5, flex: "0 0 auto",
  };
  if (cell.ada) {
    return <div title="Accessible seating" style={{ ...base, background: C.paperDeep, color: C.ash, border: `1px solid ${C.line}` }}>♿</div>;
  }
  const occupied = !!guest;
  const bg = occupied ? (guest!.checked_in ? C.green : C.brick) : (cell.partial ? "#EFE7D8" : C.paper);
  const fg = occupied ? C.paper : C.ash;
  const ring = occupied ? bg : C.line;
  const tip = occupied
    ? `${guest!.name || "Reserved"} — ${cell.seatLabel}${guest!.checked_in ? " (checked in)" : ""}`
    : `${cell.seatLabel} — open`;
  return (
    <div title={tip} style={{
      ...base, background: bg, color: fg, fontWeight: occupied ? 600 : 500, border: `1.5px solid ${ring}`,
      boxShadow: cell.partial && !occupied ? `inset -6px 0 0 ${C.line}` : "none", cursor: "default",
    }}>{cell.label}</div>
  );
}

function SeatRow({ cells, occ, label }: { cells: Cell[]; occ: Map<string, Guest>; label?: string }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "center" }}>
      {label !== undefined && <span style={{ width: 14, textAlign: "right", fontSize: 11, color: C.ash, fontWeight: 700 }}>{label}</span>}
      {cells.map((c) => <SeatDot key={c.key} cell={c} guest={c.id ? occ.get(c.id) : undefined} />)}
      {label !== undefined && <span style={{ width: 14, textAlign: "left", fontSize: 11, color: C.ash, fontWeight: 700 }}>{label}</span>}
    </div>
  );
}

function SeatBlock({ rows, occ, rowLabels }: { rows: Cell[][]; occ: Map<string, Guest>; rowLabels?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map((r, i) => <SeatRow key={i} cells={r} occ={occ} label={rowLabels ? rowLetterOf(r) : undefined} />)}
    </div>
  );
}

function ColumnBank({ title, rows, inboard, occ }: { title: string; rows: Cell[][]; inboard: "left" | "right"; occ: Map<string, Guest> }) {
  const ROW_W = 25 * 2 + 4; // two seats + gap
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: C.paperDeep, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 7px", alignSelf: "flex-start" }}>
      <div style={{ fontSize: 9, letterSpacing: ".04em", textTransform: "uppercase", color: C.ash, fontWeight: 700, marginBottom: 2, whiteSpace: "nowrap" }}>{title}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 4, width: ROW_W, justifyContent: r.length > 1 ? "space-between" : (inboard === "right" ? "flex-end" : "flex-start") }}>
          {r.map((c) => <SeatDot key={c.key} cell={c} guest={c.id ? occ.get(c.id) : undefined} />)}
        </div>
      ))}
    </div>
  );
}

function SeatMap({ occ, placed }: { occ: Map<string, Guest>; placed: number }) {
  const open = ALL_SEAT_IDS.size - placed;
  return (
    <div style={{ width: "100%" }}>
      <div style={{ overflowX: "auto", paddingBottom: 6 }}>
        <div style={{ width: "fit-content", minWidth: 820, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <span style={{ display: "inline-block", border: `1px dashed ${C.ash}`, color: C.ash, fontSize: 10, letterSpacing: ".24em", padding: "5px 64px", borderRadius: 4, textTransform: "uppercase" }}>Stage</span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "center" }}>
            <ColumnBank title="Mezz. Left" rows={MEZZ_LEFT_BANK} inboard="right" occ={occ} />
            <div style={{ alignSelf: "flex-start" }}><SeatBlock rows={ORCH_LEFT} occ={occ} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <SeatBlock rows={FRONT_ORCH} occ={occ} rowLabels />
              <div style={{ height: 18 }} />
              <SeatBlock rows={REAR_ORCH} occ={occ} rowLabels />
            </div>
            <div style={{ alignSelf: "flex-start" }}><SeatBlock rows={ORCH_RIGHT} occ={occ} /></div>
            <ColumnBank title="Mezz. Right" rows={MEZZ_RIGHT_BANK} inboard="left" occ={occ} />
          </div>
          <div style={{ marginTop: 18, background: C.paperDeep, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 10px" }}>
            <div style={{ textAlign: "center", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: C.ash, fontWeight: 700, marginBottom: 10 }}>Mezzanine / Balcony</div>
            <SeatBlock rows={BALCONY} occ={occ} rowLabels />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 11, color: C.ash, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
        <Legend color={C.brick} ring={C.brick} label="Reserved" />
        <Legend color={C.green} ring={C.green} label="Checked in" />
        <Legend color={C.paper} ring={C.line} label="Open" />
        <span style={{ marginLeft: 4 }}>{placed} reserved · {open} open</span>
      </div>
    </div>
  );
}

function JubileeList({ guests }: { guests: Guest[] }) {
  const groups: Record<string, Guest[]> = {};
  for (const g of guests) {
    const k = (g.notes || "").trim() || "Jubilee";
    (groups[k] = groups[k] || []).push(g);
  }
  const keys = Object.keys(groups).sort();
  const heads = guests.reduce((s, g) => s + (Number(g.party_size) || 0), 0);
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ background: C.paperDeep, padding: "12px 16px", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontFamily: serif, fontSize: 18, fontWeight: 500 }}>Jubilee</div>
        <div style={{ fontSize: 12, color: C.ash }}>No assigned seats · {guests.length} entries · {heads} guests</div>
      </div>
      <div style={{ padding: "6px 0" }}>
        {keys.length === 0 && <div style={{ padding: "16px", fontSize: 13, color: C.ash, fontStyle: "italic" }}>No Jubilee guests.</div>}
        {keys.map((k) => (
          <div key={k} style={{ padding: "8px 16px", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: C.ash, fontWeight: 700, marginBottom: 4 }}>
              <span>{k}</span><span>{groups[k].length}</span>
            </div>
            {groups[k].map((g) => (
              <div key={g.id} style={{ fontSize: 13, padding: "2px 0", color: C.ink }}>
                {g.name || "unnamed"}
                {g.checked_in && <span style={{ color: C.green, fontSize: 11, marginLeft: 6 }}>✓ in</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventFloorPlan({ eventFilter, showGuests, jubileeGuests }: {
  eventFilter: "both" | "jubilee" | "show"; showGuests: Guest[]; jubileeGuests: Guest[]; productionTitle: string;
}) {
  const occ = new Map<string, Guest>();
  for (const g of showGuests) for (const id of parseShowSeats(g.notes)) if (!occ.has(id)) occ.set(id, g);
  const reserved = [...occ.keys()];
  const placed = reserved.filter((id) => ALL_SEAT_IDS.has(id));
  const unplaced = reserved.filter((id) => !ALL_SEAT_IDS.has(id));

  const showMap = eventFilter !== "jubilee";
  const showJub = eventFilter !== "show";

  return (
    <div style={{ padding: "20px 34px" }}>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {showMap && (
          <div style={{ flex: "1 1 620px", minWidth: 0 }}>
            <SeatMap occ={occ} placed={placed.length} />
            {unplaced.length > 0 && (
              <div style={{ marginTop: 12, background: "#FBEEE8", border: `1px solid ${C.brick}33`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.brick }}>
                {unplaced.length} reserved seat(s) didn’t match the map: {unplaced.map((s) => s.replace("|", " ")).join(", ")}
              </div>
            )}
          </div>
        )}
        {showJub && (
          <div style={{ flex: showMap ? "0 0 300px" : "1 1 100%", maxWidth: showMap ? 320 : 560, width: "100%" }}>
            <JubileeList guests={jubileeGuests} />
          </div>
        )}
      </div>
    </div>
  );
}
