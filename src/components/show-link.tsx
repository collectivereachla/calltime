"use client";

import { useRouter } from "next/navigation";

interface Props {
  productionId: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A link that first sets the active-production context (so the destination room
 * loads the right show, per the multi-org principle: rooms derive their org from
 * the selected show), then navigates. Mirrors the cookie write used by the
 * production switcher.
 */
export function ShowLink({ productionId, href, className, children }: Props) {
  const router = useRouter();

  function go(e: React.MouseEvent) {
    e.preventDefault();
    document.cookie = `calltime_active_production=${productionId};path=/;max-age=31536000;samesite=lax`;
    router.push(href);
  }

  return (
    <a href={href} onClick={go} className={className}>
      {children}
    </a>
  );
}
