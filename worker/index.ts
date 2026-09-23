const worker = self as any;

worker.addEventListener('push', (event: any) => {
  let payload: Record<string, string> = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || '' }; }
  event.waitUntil(worker.registration.showNotification(payload.title || 'Viva Leve', {
    body: payload.body || 'Você tem uma nova notificação.',
    icon: payload.icon || '/icon-192x192.png',
    badge: payload.badge || '/icon-192x192.png',
    tag: payload.tag || 'viva-leve',
    data: { url: payload.url || '/' },
  }));
});

worker.addEventListener('notificationclick', (event: any) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || '/', worker.location.origin).href;
  event.waitUntil(worker.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients: any[]) => {
    const aberta = clients.find(client => client.url.startsWith(worker.location.origin));
    if (aberta) { aberta.navigate(destino); return aberta.focus(); }
    return worker.clients.openWindow(destino);
  }));
});
