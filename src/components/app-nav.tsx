"use client";

import Link from "next/link";
import { ModeToggle } from "@/app/(app)/mode-toggle";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { logout } from "@/app/auth/actions";
import { saveUiPrefs } from "@/app/(app)/nav-actions";
import { NotificationBell } from "./notification-bell";
import { ProductionSwitcher } from "./production-switcher";

interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface Production {
  id: string;
  title: string;
  status: string;
}

interface AppNavProps {
  displayName: string;
  orgs: Org[];
  activeOrgName?: string | null;
  activeOrgSlug?: string | null;
  initialNavWidth?: number | null;
  initialNavOrder?: string[] | null;
  badges?: Record<string, number>;
  notificationCount?: number;
  productions?: Production[];
  activeProductionId?: string | null;
  lockedRooms?: string[];
  isOwner?: boolean;
  boothAccess?: boolean;
  seatingAccess?: boolean;
  hiddenRooms?: string[];
}

const rooms = [
  { name: "Home", path: "/home", icon: "◉", mobile: true },
  { name: "Callboard", path: "/callboard", icon: "▤", mobile: true },
  { name: "Company", path: "/company", icon: "◎", mobile: true },
  { name: "Greenroom", path: "/greenroom", icon: "◌", mobile: true },
  { name: "Spine", path: "/spine", icon: "▥" },
  { name: "Lines", path: "/lines", icon: "❝", mobile: true },
  { name: "Run", path: "/run", icon: "▶" },
  { name: "Booth", path: "/booth", icon: "◧" },
  { name: "Dressing Room", path: "/dressing-room", icon: "◨" },
  { name: "Marquee", path: "/marquee", icon: "▦" },
  { name: "Playbill", path: "/playbill", icon: "❧", adminOnly: true },
  { name: "Ledger", path: "/ledger", icon: "▧" },
  { name: "Rolodex", path: "/rolodex", icon: "◈", adminOnly: true },
  { name: "Seating", path: "/seating", icon: "◍" },
  { name: "Inventory", path: "/inventory", icon: "▢", adminOnly: true },
  { name: "Applications", path: "/applications", icon: "◇", adminOnly: true },
  { name: "Archive", path: "/archive", icon: "▣" },
];

const mobileRooms = rooms.filter((r) => r.mobile);

export function AppNav({ displayName, orgs, activeOrgName = null, activeOrgSlug = null, initialNavWidth = null, initialNavOrder = null, badges = {}, notificationCount = 0, productions = [], activeProductionId = null, lockedRooms = [], isOwner = false, boothAccess = true, seatingAccess = false, hiddenRooms = [] }: AppNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const isAdmin = orgs.some((o) => o.role === "owner" || o.role === "admin");

  function isRoomLocked(room: { path: string }) {
    if (isOwner) return false;
    const key = room.path.replace("/", "");
    return lockedRooms.includes(key);
  }

  function getBadge(room: { path: string }) {
    const key = room.path.replace("/", "");
    return badges[key] || 0;
  }

  const visibleRooms = rooms.filter((r) => (!("adminOnly" in r && r.adminOnly) || isAdmin) && (r.path !== "/booth" || boothAccess) && (r.path !== "/dressing-room" || !boothAccess) && (r.path !== "/seating" || seatingAccess) && !hiddenRooms.includes(r.path.replace("/", "")));

  // Resizable + reorderable desktop rail (saved to the person's account)
  const MIN_W = 200, MAX_W = 460, DEFAULT_W = 240, COLLAPSED_W = 72, SNAP = 168;
  const [railW, setRailW] = useState(initialNavWidth && initialNavWidth >= COLLAPSED_W && initialNavWidth <= MAX_W ? initialNavWidth : DEFAULT_W);
  const [order, setOrder] = useState<string[] | null>(initialNavOrder && initialNavOrder.length ? initialNavOrder : null);
  const [dragPath, setDragPath] = useState<string | null>(null);
  const resizing = useRef(false);

  useEffect(() => {
    function move(e: PointerEvent) { if (resizing.current) setRailW(e.clientX < SNAP ? COLLAPSED_W : Math.min(MAX_W, Math.max(MIN_W, e.clientX))); }
    function up() {
      if (!resizing.current) return;
      resizing.current = false; document.body.style.userSelect = "";
      saveUiPrefs({ nav_width: railW });
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [railW]);

  const orderedRooms = (() => {
    if (!order) return visibleRooms;
    const idx = (path: string) => { const i = order.indexOf(path); return i === -1 ? 999 : i; };
    return [...visibleRooms].sort((a, b) => idx(a.path) - idx(b.path));
  })();

  function reorder(targetPath: string) {
    if (!dragPath || dragPath === targetPath) { setDragPath(null); return; }
    const base = orderedRooms.map((r) => r.path);
    const from = base.indexOf(dragPath), to = base.indexOf(targetPath);
    if (from === -1 || to === -1) { setDragPath(null); return; }
    base.splice(to, 0, base.splice(from, 1)[0]);
    setOrder(base);
    saveUiPrefs({ nav_order: base });
    setDragPath(null);
  }

  const collapsed = railW <= COLLAPSED_W + 24;


  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <nav style={{ width: railW }} className="hidden md:flex shrink-0 border-r border-white/10 bg-ink flex-col h-screen sticky top-0 relative">
        <div className={`border-b border-white/10 ${collapsed ? "py-5 flex justify-center" : "px-5 py-6"}`}>
          <Link href="/home" title="Home" className="font-marquee text-paper hover:opacity-80 transition-opacity inline-flex items-center" style={collapsed ? undefined : { fontSize: '1.7rem', lineHeight: '1.05', letterSpacing: '0', whiteSpace: 'nowrap' }}>
            {collapsed ? (
              <svg viewBox="0 0 240 240" width="42" height="42" aria-label="Calltime" role="img">
                <path d="M86 138 Q96 56 120 50 Q144 56 154 138" fill="none" stroke="#C8B79A" strokeWidth="7" strokeLinecap="round" />
                <circle cx="120" cy="92" r="15" fill="#E0301E" />
                <line x1="120" y1="104" x2="120" y2="186" stroke="#F4EFE4" strokeWidth="7" strokeLinecap="round" />
                <ellipse cx="120" cy="190" rx="40" ry="9" fill="none" stroke="#F4EFE4" strokeWidth="5" />
              </svg>
            ) : (<>Calltime<span className="text-bulb">.</span></>)}
          </Link>
        </div>

        {!collapsed && orgs.length > 0 && (
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-body-xs text-bone/50 uppercase tracking-wider mb-1">Organization</p>
              {(() => {
                const slug = activeOrgSlug || orgs.find((o) => o.name === activeOrgName)?.slug || orgs[0]?.slug;
                const label = activeOrgName || orgs[0].name;
                return slug
                  ? <Link href={`/org/${slug}`} className="text-body-sm font-medium text-paper truncate block hover:text-brick transition-colors">{label}</Link>
                  : <p className="text-body-sm font-medium text-paper truncate">{label}</p>;
              })()}
            </div>
            <NotificationBell unreadCount={notificationCount} dark />
          </div>
        )}
        {collapsed && orgs.length > 0 && (
          <div className="flex justify-center py-3 border-b border-white/10">
            <NotificationBell unreadCount={notificationCount} dark />
          </div>
        )}

        {!collapsed && productions.length > 1 && (
          <div className="px-5 py-3 border-b border-white/10">
            <p className="text-body-xs text-bone/50 uppercase tracking-wider mb-1.5">Production</p>
            <ProductionSwitcher productions={productions} activeId={activeProductionId} dark />
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {orderedRooms.map((room) => {
            const isActive = pathname.startsWith(room.path);
            if (isRoomLocked(room)) {
              return (
                <div key={room.path} title={collapsed ? room.name : undefined} className={`flex items-center text-body-sm text-bone/50 cursor-default py-2 ${collapsed ? "justify-center px-0" : "gap-3 px-5"}`}>
                  <span className={`text-center opacity-40 ${collapsed ? "text-2xl" : "text-xs w-4"}`}>{room.icon}</span>
                  {!collapsed && <span className="opacity-40">{room.name}</span>}
                  {!collapsed && <span className="ml-auto text-[10px] opacity-40">🔒</span>}
                </div>
              );
            }
            return (
              <Link key={room.path} href={room.path}
                draggable
                onDragStart={() => setDragPath(room.path)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => reorder(room.path)}
                onDragEnd={() => setDragPath(null)}
                title={collapsed ? room.name : "Drag to reorder"}
                className={`group relative flex items-center py-2 text-body-sm transition-colors ${collapsed ? "justify-center px-0" : "gap-2 pl-3 pr-5"} ${dragPath === room.path ? "opacity-40" : ""} ${
                  isActive
                    ? "text-brick font-medium bg-brick/15 border-r-2 border-brick"
                    : "text-paper hover:text-brick hover:bg-brick/15"
                }`}>
                {!collapsed && <span className="text-white/20 group-hover:text-bone/60 text-[11px] leading-none select-none cursor-grab" aria-hidden>⠿</span>}
                <span className={`text-center ${collapsed ? "text-2xl" : "text-xs w-4"} ${isActive ? "text-brick" : "text-bone/60"}`}>{room.icon}</span>
                {!collapsed && room.name}
                {!collapsed && getBadge(room) > 0 && (
                  <span className="ml-auto text-[10px] font-medium bg-brick text-paper rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {getBadge(room)}
                  </span>
                )}
                {collapsed && getBadge(room) > 0 && (
                  <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-brick" />
                )}
              </Link>
            );
          })}
        </div>

        {collapsed ? (
          <div className="border-t border-white/10 py-3 flex flex-col items-center gap-3">
            <ModeToggle dark />
            <Link href="/settings" title="Settings" className="text-2xl leading-none text-bone/50 hover:text-brick transition-colors">⚙</Link>
            <form action={logout}>
              <button type="submit" title="Sign out" className="text-2xl leading-none text-bone/50 hover:text-brick transition-colors">⏻</button>
            </form>
          </div>
        ) : (
          <div className="border-t border-white/10 px-5 py-4">
            <div className="flex items-center justify-between mb-2 gap-2">
              <p className="text-body-sm font-medium text-paper truncate">{displayName}</p>
              <ModeToggle dark />
            </div>
            <div className="flex items-center gap-3">
              <Link href="/settings" className="text-body-xs text-bone/50 hover:text-brick transition-colors">
                Settings
              </Link>
              <span className="text-bone">·</span>
              <Link href="/about" className="text-body-xs text-bone/50 hover:text-brick transition-colors">
                About
              </Link>
              <span className="text-bone">·</span>
              <form action={logout}>
                <button type="submit" title="Sign out" aria-label="Sign out" className="text-body-sm text-bone/50 hover:text-brick transition-colors leading-none">⏻</button>
              </form>
            </div>
          </div>
        )}
        {/* Drag to resize the rail */}
        <div
          onPointerDown={(e) => { resizing.current = true; document.body.style.userSelect = "none"; e.preventDefault(); }}
          onDoubleClick={() => { setRailW(DEFAULT_W); saveUiPrefs({ nav_width: DEFAULT_W }); }}
          title="Drag to resize · double-click to reset"
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-brick/30 active:bg-brick/40 transition-colors"
        />
      </nav>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-paper border-b border-bone px-4 py-3 flex items-center justify-between">
        <Link href="/home" className="font-marquee text-display-md text-ink">
          Calltime<span className="text-bulb">.</span>
        </Link>
        <div className="flex items-center gap-2">
          {productions.length > 1 && (
            <ProductionSwitcher productions={productions} activeId={activeProductionId} />
          )}
          <NotificationBell unreadCount={notificationCount} />
          <Link href="/settings" className="text-body-xs text-muted hover:text-brick transition-colors">
            ⚙
          </Link>
          <form action={logout}>
            <button type="submit" className="text-body-xs text-muted hover:text-brick transition-colors">
              Out
            </button>
          </form>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-paper border-t border-bone">
        <div className="flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {mobileRooms.map((room) => {
            const isActive = pathname.startsWith(room.path);
            if (isRoomLocked(room)) {
              return (
                <div key={room.path} className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted opacity-40">
                  <span className="text-sm">{room.icon}</span>
                  <span className="text-[10px] font-medium">🔒</span>
                </div>
              );
            }
            return (
              <Link key={room.path} href={room.path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
                  isActive ? "text-brick" : "text-ash"
                }`}>
                <span className="text-sm">{room.icon}</span>
                <span className="text-[10px] font-medium">{room.name}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${moreOpen ? "text-brick" : "text-ash"}`}>
            <span className="text-sm">⋯</span>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>

        {/* More menu */}
        {moreOpen && (
          <div className="absolute bottom-full left-0 right-0 bg-paper border-t border-bone shadow-card-hover py-2">
            {visibleRooms.filter((r) => !r.mobile).map((room) => {
              if (isRoomLocked(room)) {
                return (
                  <div key={room.path} className="flex items-center gap-3 px-5 py-2.5 text-body-sm text-muted">
                    <span className={`text-center opacity-40 ${collapsed ? "text-2xl" : "text-xs w-4"}`}>{room.icon}</span>
                    <span className="opacity-40">{room.name}</span>
                    <span className="ml-auto text-[10px] opacity-40">🔒</span>
                  </div>
                );
              }
              return (
                <Link key={room.path} href={room.path} onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 px-5 py-2.5 text-body-sm text-ink hover:bg-brick/5 transition-colors">
                  <span className="text-xs w-4 text-center text-ash">{room.icon}</span>
                  {room.name}
                </Link>
              );
            })}
          </div>
        )}
      </nav>
    </>
  );
}
