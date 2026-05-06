importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js");

const search = new URL(self.location.href).searchParams;
const fallbackFirebaseConfig = {
  apiKey: "AIzaSyAN7wb7o91N_9b-zVcOwTReaoHHOSlhHKg",
  authDomain: "javani-181d5.firebaseapp.com",
  projectId: "javani-181d5",
  storageBucket: "javani-181d5.firebasestorage.app",
  messagingSenderId: "898711359281",
  appId: "1:898711359281:web:c12eb1742b54d70d2eea10",
  measurementId: "G-WHJ0TJ1VX6",
};

const firebaseConfig = {
  apiKey: search.get("apiKey") || fallbackFirebaseConfig.apiKey,
  authDomain: search.get("authDomain") || fallbackFirebaseConfig.authDomain,
  projectId: search.get("projectId") || fallbackFirebaseConfig.projectId,
  storageBucket: search.get("storageBucket") || fallbackFirebaseConfig.storageBucket,
  messagingSenderId: search.get("messagingSenderId") || fallbackFirebaseConfig.messagingSenderId,
  appId: search.get("appId") || fallbackFirebaseConfig.appId,
  measurementId: search.get("measurementId") || fallbackFirebaseConfig.measurementId,
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  return clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
    const isAppInForeground = windowClients.some((client) => client.visibilityState === "visible");
    if (isAppInForeground) return;

    const targetUrl = payload.data?.url || payload.data?.link || payload.fcmOptions?.link || "/account/orders";
    const title = payload.notification?.title || payload.data?.title || "Javani notification";
    const options = {
      body: payload.notification?.body || payload.data?.body || "You have a new Javani update.",
      icon: payload.notification?.icon || "/favicon.png",
      badge: "/favicon.png",
      image: payload.notification?.image || payload.data?.image,
      tag: payload.data?.tag || payload.data?.notificationId || "javani-notification",
      data: {
        url: targetUrl,
        link: targetUrl,
        ...payload.data,
      },
      requireInteraction: payload.data?.requireInteraction === "true",
    };

    return self.registration.showNotification(title, options);
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawTargetUrl = event.notification.data?.url || event.notification.data?.link || "/account/orders";
  const targetUrl = new URL(rawTargetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
