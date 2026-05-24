"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/(app)/push/actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

export function PushRegistration() {
  const [permission, setPermission] = useState<string>("default");
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!VAPID_PUBLIC_KEY) return;

    // Register service worker
    navigator.serviceWorker
      .register("/sw.js")
      .then(async (registration) => {
        // Check existing subscription
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          setRegistered(true);
          setPermission("granted");
          return;
        }

        // If permission already granted, subscribe silently
        if (Notification.permission === "granted") {
          await subscribe(registration);
        }

        setPermission(Notification.permission);
      })
      .catch((err) => console.error("SW registration failed:", err));
  }, []);

  async function subscribe(registration: ServiceWorkerRegistration) {
    try {
      setLoading(true);
      setError(null);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON();
      const result = await savePushSubscription({
        endpoint: json.endpoint!,
        keys: {
          p256dh: json.keys!.p256dh!,
          auth: json.keys!.auth!,
        },
        userAgent: navigator.userAgent,
      });

      if (result?.error) {
        setError(`Save failed: ${result.error}`);
        setLoading(false);
        return;
      }

      setRegistered(true);
      setPermission("granted");
      setLoading(false);
    } catch (err) {
      setError(`Push error: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  }

  async function requestPermission() {
    try {
      setLoading(true);
      setError(null);
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        const registration = await navigator.serviceWorker.ready;
        await subscribe(registration);
      } else {
        setError(`Permission ${result}. Check your browser notification settings.`);
        setLoading(false);
      }
    } catch (err) {
      setError(`Permission error: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  }

  // Don't show anything if already registered or not supported
  if (registered || permission === "denied") return null;
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  if (!VAPID_PUBLIC_KEY) return null;

  // Show prompt to enable notifications
  if (permission === "default" || error) {
    return (
      <div className="bg-card border border-bone rounded-card px-4 py-3 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-body-sm text-ink font-medium">Enable notifications</p>
            <p className="text-body-xs text-ash">Get notified about calls, conflicts, contracts, and more.</p>
          </div>
          <button
            onClick={requestPermission}
            disabled={loading}
            className="shrink-0 px-3 py-1.5 bg-brick text-paper text-body-sm font-medium rounded-card hover:bg-brick/90 transition-colors disabled:opacity-50"
          >
            {loading ? "..." : "Enable"}
          </button>
        </div>
        {error && (
          <p className="text-body-xs text-conflict mt-2">{error}</p>
        )}
      </div>
    );
  }

  return null;
}
