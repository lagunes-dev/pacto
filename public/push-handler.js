self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }

  if (
    payload?.v !== 1 ||
    payload?.kind !== "support-request" ||
    typeof payload?.requestId !== "string"
  ) return;

  event.waitUntil(self.registration.showNotification("Pacto", {
    body: "Tenés una nueva solicitud de apoyo.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `support-request-${payload.requestId}`,
    data: { url: "/support" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/support"));
});
