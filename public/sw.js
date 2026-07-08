// HRL push service worker. Receives Web Push events and shows the notification;
// tapping it focuses (or opens) the installed PWA.

self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "HRL", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "HRL";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "hrl",
    renotify: true,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
          // Focus an already-open HRL window if we have one.
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client && target !== "/") client.navigate(target);
            return;
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      }),
  );
});
