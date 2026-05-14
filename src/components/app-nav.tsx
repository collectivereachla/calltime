"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  { name: "Home", path: "/home", icon: "◉" },
  { name: "Callboard", path: "/callboard", icon: "▤" },
  { name: "Company", path: "/company", icon: "◎" },
  { name: "Greenroom", path: "/greenroom", icon: "◌", disabled: true },
  { name: "Spine", path: "/spine", icon: "▥", disabled: true },
  { name: "Run", path: "/run", icon: "▶", disabled: true },
  { name: "Booth", path: "/booth", icon: "◧", disabled: true },
  { name: "Ledger", path: "/ledger", icon: "▧", disabled: true },
  { name: "Archive", path: "/archive", icon: "▣", disabled: true },
];

export function AppNav({ displayName, orgs }: AppNavProps) {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 border-r border-bone bg-paper flex flex-col h-screen sticky top-0">
      {/* Wordmark */}
      <div className="px-5 py-5 border-b border-bone">
        <Link href="/home" className="font-display text-display-sm text-ink hover:opacity-80 transition-opacity">
          Calltime<span className="text-brick">.</span>
        </Link>
      </div>

      {/* Org context */}
      {orgs.length > 0 && (
        <div className="px-5 py-3 border-b border-bone">
          <p className="text-body-xs text-muted uppercase tracking-wider mb-1">Organization</p>
          <p className="text-body-sm font-medium text-ink truncate">{orgs[0].name}</p>
        </div>
      )}

      {/* Room navigation */}
      <div className="flex-1 overflow-y-auto py-2">
        {rooms.map((room) => {
          const isActive = pathname.startsWith(room.path);
          const isDisabled = room.disabled;

          if (isDisabled) {
            return (
              <div
                key={room.path}
                className="flex items-center gap-3 px-5 py-2 text-body-sm text-muted cursor-default"
              >
                <span className="text-xs w-4 text-center opacity-40">{room.icon}</span>
                <span className="opacity-40">{room.name}</span>
              </div>
            );
          }

          return (
            <Link
              key={room.path}
              href={room.path}
              className={`flex items-center gap-3 px-5 py-2 text-body-sm transition-colors ${
                isActive
                  ? "text-brick font-medium bg-brick/5 border-r-2 border-brick"
                  : "text-ink hover:text-brick hover:bg-brick/5"
              }`}
            >
              <span className={`text-xs w-4 text-center ${isActive ? "text-brick" : "text-ash"}`}>
                {room.icon}
              </span>
              {room.name}
            </Link>
          );
        })}
      </div>

      {/* User */}
      <div className="border-t border-bone px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-body-sm font-medium text-ink truncate">{displayName}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-body-xs text-muted hover:text-brick transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
