// Calltime Service Worker — push notifications + basic caching

const CACHE_NAME = "calltime-v1";

// Push notification handler
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Calltime", body: event.data.text() };
  }

  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/favicon.png",
    tag: data.tag || "calltime-notification",
    data: { url: data.url || "/home" },
    vibrate: [100, 50, 100],
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Calltime", options)
  );
});

// Click handler — open the app at the notification's URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/home";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      return clients.openWindow(url);
    })
  );
});

// Install — cache shell assets
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});
