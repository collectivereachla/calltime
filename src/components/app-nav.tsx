"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/auth/actions";
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
  badges?: Record<string, number>;
  notificationCount?: number;
  productions?: Production[];
  activeProductionId?: string | null;
  lockedRooms?: string[];
  isOwner?: boolean;
  boothAccess?: boolean;
}

const rooms = [
  { name: "Home", path: "/home", icon: "◉", mobile: true },
  { name: "Callboard", path: "/callboard", icon: "▤", mobile: true },
  { name: "Company", path: "/company", icon: "◎", mobile: true },
  { name: "Greenroom", path: "/greenroom", icon: "◌", mobile: true },
  { name: "Spine", path: "/spine", icon: "▥" },
  { name: "Run", path: "/run", icon: "▶" },
  { name: "Booth", path: "/booth", icon: "◧" },
  { name: "Dressing Room", path: "/dressing-room", icon: "◨" },
  { name: "Marquee", path: "/marquee", icon: "▦" },
  { name: "Ledger", path: "/ledger", icon: "▧" },
  { name: "Applications", path: "/applications", icon: "◇", adminOnly: true },
  { name: "Archive", path: "/archive", icon: "▣" },
];

const mobileRooms = rooms.filter((r) => r.mobile);

export function AppNav({ displayName, orgs, badges = {}, notificationCount = 0, productions = [], activeProductionId = null, lockedRooms = [], isOwner = false, boothAccess = true }: AppNavProps) {
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

  const visibleRooms = rooms.filter((r) => (!("adminOnly" in r && r.adminOnly) || isAdmin) && (r.path !== "/booth" || boothAccess) && (r.path !== "/dressing-room" || !boothAccess));

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <nav className="hidden md:flex w-56 shrink-0 border-r border-bone bg-paper flex-col h-screen sticky top-0">
        <div className="px-5 py-6 border-b border-bone">
          <Link href="/home" className="font-display text-ink hover:opacity-80 transition-opacity" style={{ fontSize: '2.5rem', lineHeight: '1.1', letterSpacing: '-0.03em' }}>
            Calltime<span className="text-brick">.</span>
          </Link>
        </div>

        {orgs.length > 0 && (
          <div className="px-5 py-3 border-b border-bone flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-body-xs text-muted uppercase tracking-wider mb-1">Organization</p>
              <p className="text-body-sm font-medium text-ink truncate">{orgs[0].name}</p>
            </div>
            <NotificationBell unreadCount={notificationCount} />
          </div>
        )}

        {productions.length > 1 && (
          <div className="px-5 py-3 border-b border-bone">
            <p className="text-body-xs text-muted uppercase tracking-wider mb-1.5">Production</p>
            <ProductionSwitcher productions={productions} activeId={activeProductionId} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {visibleRooms.map((room) => {
            const isActive = pathname.startsWith(room.path);
            if (isRoomLocked(room)) {
              return (
                <div key={room.path} className="flex items-center gap-3 px-5 py-2 text-body-sm text-muted cursor-default">
                  <span className="text-xs w-4 text-center opacity-40">{room.icon}</span>
                  <span className="opacity-40">{room.name}</span>
                  <span className="ml-auto text-[10px] opacity-40">🔒</span>
                </div>
              );
            }
            return (
              <Link key={room.path} href={room.path}
                className={`flex items-center gap-3 px-5 py-2 text-body-sm transition-colors ${
                  isActive
                    ? "text-brick font-medium bg-brick/5 border-r-2 border-brick"
                    : "text-ink hover:text-brick hover:bg-brick/5"
                }`}>
                <span className={`text-xs w-4 text-center ${isActive ? "text-brick" : "text-ash"}`}>{room.icon}</span>
                {room.name}
                {getBadge(room) > 0 && (
                  <span className="ml-auto text-[10px] font-medium bg-brick text-paper rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {getBadge(room)}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="border-t border-bone px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-body-sm font-medium text-ink truncate">{displayName}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-body-xs text-muted hover:text-brick transition-colors">
              Settings
            </Link>
            <span className="text-bone">·</span>
            <form action={logout}>
              <button type="submit" className="text-body-xs text-muted hover:text-brick transition-colors">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-paper border-b border-bone px-4 py-3 flex items-center justify-between">
        <Link href="/home" className="font-display text-display-md text-ink">
          Calltime<span className="text-brick">.</span>
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
                    <span className="text-xs w-4 text-center opacity-40">{room.icon}</span>
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
