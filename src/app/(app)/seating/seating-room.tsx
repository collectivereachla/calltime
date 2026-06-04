"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  addSeatingTable,
  updateSeatingTable,
  removeSeatingTable,
  addSeatingGuest,
  updateSeatingGuest,
  removeSeatingGuest,
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

type Table = { id: string; number: number; name: string | null; capacity: number; x: number; y: number };
type Guest = { id: string; name: string; party_size: number; amount: number | null; source: string | null; status: string; table_id: string | null; notes: string | null };
type Totals = { collected: number; heads: number; seated: number; bySource: Record<string, number>; outstanding: Guest[]; projected: number | null };

const persist = (p: Promise<unknown>) => { p.catch((e) => console.error("seating save failed:", e)); };

export function SeatingRoom({
  productionId, productionTitle, canEdit, initialTables, initialGuests, initialPrice,
}: {
  productionId: string; productionTitle: string; canEdit: boolean;
  initialTables: Table[]; initialGuests: Guest[]; initialPrice: string;
}) {
  const [tab, setTab] = useState<"roster" | "floor">("roster");
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

  const totals = (() => {
    const collected = guests.reduce((s, g) => s + (Number(g.amount) || 0), 0);
    const heads = guests.reduce((s, g) => s + (Number(g.party_size) || 0), 0);
    const seated = guests.filter((g) => g.table_id).reduce((s, g) => s + (Number(g.party_size) || 0), 0);
    const bySource: Record<string, number> = {};
    SOURCES.forEach((s) => (bySource[s] = 0));
    guests.forEach((g) => { if (g.source) bySource[g.source] = (bySource[g.source] || 0) + (Number(g.amount) || 0); });
    const outstanding = guests.filter((g) => g.status === "Unpaid" || g.status === "Partial");
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
        <div style={{ display: "flex", gap: 26 }} className="no-print">
          <button className={`ct-tab ${tab === "roster" ? "active" : ""}`} onClick={() => setTab("roster")}>
            <ClipboardList size={16} /> Guests &amp; Payments
          </button>
          <button className={`ct-tab ${tab === "floor" ? "active" : ""}`} onClick={() => setTab("floor")}>
            <MapPin size={16} /> Floor Plan
          </button>
        </div>
      </div>

      {/* Summary band */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 0, borderBottom: `1px solid ${C.line}`, background: C.paperDeep }}>
        <Stat label="Collected" value={money(totals.collected)} accent={C.green} />
        <Stat label="Guests" value={totals.heads} />
        <Stat label="Seated" value={`${totals.seated} / ${totals.heads}`} />
        <Stat label="Tables" value={tables.length} />
        {totals.projected != null && <Stat label="Projected" value={money(totals.projected)} sub={`@ ${money(Number(price))}/seat`} />}
        <Stat label="Outstanding" value={totals.outstanding.length} accent={totals.outstanding.length ? C.brick : C.ash} />
      </div>

      {tab === "roster" ? (
        <Roster
          guests={guests} tables={tables} totals={totals} price={price} canEdit={canEdit}
          changePrice={changePrice} addParty={addParty} updateGuest={updateGuest} removeGuest={removeGuest} occupancyOf={occupancyOf}
        />
      ) : (
        <FloorPlan
          tables={tables} guests={guests} canEdit={canEdit}
          addTable={addTable} updateTable={updateTable} removeTable={removeTable}
          updateGuest={updateGuest} addGuestToTable={addGuestToTable} occupancyOf={occupancyOf}
          selectedTable={selectedTable} setSelectedTable={setSelectedTable}
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
  tables: Table[]; guests: Guest[]; canEdit: boolean;
  addTable: () => void; updateTable: (id: string, patch: Partial<Table>, save?: boolean) => void; removeTable: (id: string) => void;
  updateGuest: (id: string, patch: Partial<Guest>, save?: boolean) => void; addGuestToTable: (tableId: string, name: string, size: number) => void;
  occupancyOf: (id: string) => number; selectedTable: string | null; setSelectedTable: (id: string | null) => void;
};

function FloorPlan({ tables, guests, canEdit, addTable, updateTable, removeTable, updateGuest, addGuestToTable, occupancyOf, selectedTable, setSelectedTable }: FloorProps) {
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

  return (
    <div style={{ padding: "20px 34px", display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 560px", minWidth: 320 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }} className="no-print">
          <div style={{ fontSize: 12, color: C.ash }}>{canEdit ? "Drag tables to arrange the room. Tap a table to name it and seat guests." : "Tap a table to see who's seated."}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ct-btn" style={{ background: C.paperDeep, color: C.ink, border: `1px solid ${C.line}`, padding: "8px 13px", fontSize: 13 }} onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
            {canEdit && (
              <button className="ct-btn" style={{ background: C.brick, color: C.paper, padding: "8px 14px", fontSize: 13 }} onClick={addTable}>
                <Plus size={15} /> Add table
              </button>
            )}
          </div>
        </div>

        <div ref={canvasRef} style={{
          position: "relative", width: "100%", height: 980, background: C.paper,
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

        <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 11, color: C.ash, flexWrap: "wrap" }}>
          <Legend color={C.paper} ring={C.line} label="Empty" />
          <Legend color="#E8C9BC" ring={C.brick} label="Partly seated" />
          <Legend color={C.brick} ring={C.brick} label="Full" />
          <Legend color="#7A1E12" ring="#7A1E12" label="Over capacity" />
        </div>
      </div>

      {/* side panel */}
      <div style={{ flex: "0 1 320px", minWidth: 280 }} className="no-print">
        {sel ? (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ background: C.paperDeep, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ fontFamily: serif, fontSize: 19, fontWeight: 500 }}>Table {sel.number}{sel.name ? ` · ${sel.name}` : ""}</div>
              <button className="ct-btn" style={{ background: "none", padding: 4 }} onClick={() => setSelectedTable(null)}><X size={16} color={C.ash} /></button>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C.ash, fontWeight: 600 }}>Name (optional)</label>
              <input className="ct-input" data-nodrag value={sel.name || ""} placeholder="e.g. Ochsner, Head Table" disabled={!canEdit} style={{ marginTop: 4, marginBottom: 14 }}
                onChange={(e) => updateTable(sel.id, { name: e.target.value }, false)} onBlur={(e) => updateTable(sel.id, { name: e.target.value })} />

              <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C.ash, fontWeight: 600 }}>Capacity</label>
              <input className="ct-input" data-nodrag type="number" min="1" value={sel.capacity} disabled={!canEdit} style={{ marginTop: 4, marginBottom: 14 }}
                onChange={(e) => updateTable(sel.id, { capacity: Number(e.target.value) || 1 })} />

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
