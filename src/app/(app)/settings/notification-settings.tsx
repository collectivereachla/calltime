"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/(app)/push/actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function NotificationSettings({ personId }: { personId: string }) {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<string>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      setSupported(false);
      return;
    }

    setPermission(Notification.permission);

    // Check for existing subscription
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      if (existing) setSubscribed(true);
    }).catch(() => {});
  }, []);

  async function handleEnable() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setError("Permission denied. Check your browser or device notification settings for this site.");
        setLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON();
      const result = await savePushSubscription(personId, {
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
        userAgent: navigator.userAgent,
      });

      if (result?.error) {
        setError(`Failed to save: ${result.error}`);
        setLoading(false);
        return;
      }

      setSubscribed(true);
      setSuccess("Notifications enabled. You'll receive push alerts for calls, conflicts, contracts, and more.");
    } catch (err) {
      setError(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setLoading(false);
  }

  async function handleDisable() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      setSubscribed(false);
      setSuccess("Notifications disabled.");
    } catch (err) {
      setError(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setLoading(false);
  }

  return (
    <div>
      <h3 className="font-display text-display-sm mb-1">Notifications</h3>
      <p className="text-body-sm text-ash mb-4">
        Push notifications for calls, schedule changes, conflicts, contracts, and messages.
      </p>

      {!supported ? (
        <p className="text-body-sm text-muted">
          Push notifications are not supported on this device or browser. Try opening Calltime from your home screen on iOS, or use Chrome/Edge on desktop.
        </p>
      ) : subscribed ? (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-confirmed shrink-0" />
            <p className="text-body-sm text-ink">Notifications are <span className="font-medium">enabled</span></p>
          </div>
          <button onClick={handleDisable} disabled={loading}
            className="text-body-sm text-muted hover:text-conflict transition-colors disabled:opacity-50">
            {loading ? "Disabling..." : "Turn off notifications"}
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-bone shrink-0" />
            <p className="text-body-sm text-ash">Notifications are <span className="font-medium text-ink">off</span></p>
          </div>
          <button onClick={handleEnable} disabled={loading}
            className="px-4 py-2 bg-brick text-paper text-body-sm font-medium rounded-card hover:bg-brick/90 transition-colors disabled:opacity-50">
            {loading ? "Enabling..." : "Enable push notifications"}
          </button>
          {permission === "denied" && (
            <p className="text-body-xs text-conflict mt-2">
              Notifications are blocked by your browser. Go to your device settings → Calltime → allow notifications, then try again.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-body-xs text-conflict mt-3">{error}</p>}
      {success && <p className="text-body-xs text-confirmed mt-3">{success}</p>}
    </div>
  );
}
