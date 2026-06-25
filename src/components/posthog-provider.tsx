"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

const KEY = "phc_BQzRHwqadE96oJAQwWJ9vhBhNEjh9HEkVEfvFtKmBXGY";
const HOST = "https://us.i.posthog.com";

if (typeof window !== "undefined") {
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: false, // captured manually below for the App Router
    capture_pageleave: true,
    autocapture: true,
    disable_session_recording: true,
    loaded: (ph) => {
      // Don't pollute analytics from local/dev builds.
      if (process.env.NODE_ENV !== "production") ph.opt_out_capturing();
    },
  });
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!pathname) return;
    let url = window.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += "?" + qs;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);
  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}
