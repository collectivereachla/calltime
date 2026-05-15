"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/auth/actions";

interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface AppNavProps {
  displayName: string;
  orgs: Org[];
}

const rooms = [
  { name: "Home", path: "/home", icon: "◉", mobile: true },
  { name: "Callboard", path: "/callboard", icon: "▤", mobile: true },
  { name: "Company", path: "/company", icon: "◎", mobile: true },
  { name: "Greenroom", path: "/greenroom", icon: "◌", disabled: true },
  { name: "Spine", path: "/spine", icon: "▥", disabled: true },
  { name: "Run", path: "/run", icon: "▶", disabled: true },
  { name: "Booth", path: "/booth", icon: "◧" },
  { name: "Ledger", path: "/ledger", icon: "▧", disabled: true },
  { name: "Archive", path: "/archive", icon: "▣", disabled: true },
];

const mobileRooms = rooms.filter((r) => r.mobile && !r.disabled);

export function AppNav({ displayName, orgs }: AppNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <nav className="hidden md:flex w-56 shrink-0 border-r border-bone bg-paper flex-col h-screen sticky top-0">
        <div className="px-5 py-5 border-b border-bone">
          <Link href="/home" className="font-display text-display-md text-ink hover:opacity-80 transition-opacity">
            Calltime<span className="text-brick">.</span>
          </Link>
        </div>

        {orgs.length > 0 && (
          <div className="px-5 py-3 border-b border-bone">
            <p className="text-body-xs text-muted uppercase tracking-wider mb-1">Organization</p>
            <p className="text-body-sm font-medium text-ink truncate">{orgs[0].name}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-2">
          {rooms.map((room) => {
            const isActive = pathname.startsWith(room.path);
            if (room.disabled) {
              return (
                <div key={room.path} className="flex items-center gap-3 px-5 py-2 text-body-sm text-muted cursor-default">
                  <span className="text-xs w-4 text-center opacity-40">{room.icon}</span>
                  <span className="opacity-40">{room.name}</span>
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
              </Link>
            );
          })}
        </div>

        <div className="border-t border-bone px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-body-sm font-medium text-ink truncate">{displayName}</p>
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
        <div className="flex items-center gap-3">
          <p className="text-body-xs text-ash truncate max-w-[120px]">{orgs[0]?.name}</p>
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
            {rooms.filter((r) => !r.mobile || r.disabled).map((room) => {
              if (room.disabled) {
                return (
                  <div key={room.path} className="flex items-center gap-3 px-5 py-2.5 text-body-sm text-muted">
                    <span className="text-xs w-4 text-center opacity-40">{room.icon}</span>
                    <span className="opacity-40">{room.name}</span>
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
