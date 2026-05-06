import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getToken, onMessage } from "firebase/messaging";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db, firebaseConfig, getFirebaseMessaging } from "@/lib/firebase";

const rawVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

const normalizeVapidKey = (value?: string) => (value || "").trim().replace(/\s+/g, "");
const vapidKey = normalizeVapidKey(rawVapidKey);

const getVapidKeyError = (key: string) => {
  if (!key) return "VITE_FIREBASE_VAPID_KEY is missing from the environment.";
  if (!/^[A-Za-z0-9_-]+$/.test(key) || key.length % 4 === 1) {
    return "VITE_FIREBASE_VAPID_KEY is not a valid Firebase Web Push certificate key. Copy the full public key from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates.";
  }
  return "";
};

const createTokenDocumentId = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const getSupportStatus = () => Boolean(
  typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window
);

const createServiceWorkerUrl = () => {
  const search = new URLSearchParams({
    apiKey: firebaseConfig.apiKey || "",
    authDomain: firebaseConfig.authDomain || "",
    projectId: firebaseConfig.projectId || "",
    storageBucket: firebaseConfig.storageBucket || "",
    messagingSenderId: firebaseConfig.messagingSenderId || "",
    appId: firebaseConfig.appId || "",
  });

  return `/firebase-messaging-sw.js?${search.toString()}`;
};

const waitForActivation = async (registration: ServiceWorkerRegistration) => {
  if (registration.active) return;
  const installingWorker = registration.installing || registration.waiting;
  if (!installingWorker) return;

  await new Promise<void>((resolve) => {
    installingWorker.addEventListener("statechange", () => {
      if (installingWorker.state === "activated") resolve();
    });
  });
};

export const useWebNotifications = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const autoRegisteringRef = useRef(false);
  const [permission, setPermission] = useState<NotificationPermission>(() => (
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  ));
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supported = useMemo(getSupportStatus, []);
  const configError = useMemo(() => getVapidKeyError(vapidKey), []);
  const configured = !configError;

  useEffect(() => {
    if (!supported || !("Notification" in window)) return;
    setPermission(Notification.permission);
  }, [supported]);

  useEffect(() => {
    if (!supported) return undefined;

    let unsubscribe: (() => void) | undefined;
    getFirebaseMessaging().then((messaging) => {
      if (!messaging) return;
      unsubscribe = onMessage(messaging, (payload) => {
        const title = payload.notification?.title || payload.data?.title || "Javani notification";
        const description = payload.notification?.body || payload.data?.body || "You have a new update.";
        toast({ title, description });
      });
    });

    return () => unsubscribe?.();
  }, [supported, toast]);

  const registerBrowserToken = useCallback(async (options: { showToast?: boolean } = {}) => {
    const { showToast = true } = options;
    if (!user) throw new Error("Please sign in before enabling web notifications.");
    if (!supported) throw new Error("This browser does not support web push notifications.");
    if (configError) throw new Error(configError);

    const registration = await navigator.serviceWorker.register(createServiceWorkerUrl(), { scope: "/" });
    await waitForActivation(registration);
    const messaging = await getFirebaseMessaging();
    if (!messaging) throw new Error("Firebase Messaging is not available in this browser.");

    const nextToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!nextToken) throw new Error("Firebase did not return a web push token.");
    const tokenDocumentId = await createTokenDocumentId(nextToken);
    const tokenPayload = {
      token: nextToken,
      uid: user.uid,
      enabled: true,
      platform: "web",
      userAgent: navigator.userAgent,
      browserPlatform: navigator.platform,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await Promise.all([
      setDoc(doc(db, "users", user.uid, "webPushTokens", tokenDocumentId), tokenPayload, { merge: true }),
      setDoc(doc(db, "userTokens", tokenDocumentId), tokenPayload, { merge: true }),
    ]);

    setToken(nextToken);
    if (showToast) {
      toast({ title: "Web notifications enabled", description: "This browser can now receive Javani order updates." });
    }
    return nextToken;
  }, [configError, supported, toast, user]);

  useEffect(() => {
    if (!user || !supported || !configured || permission !== "granted" || token || autoRegisteringRef.current) return;

    autoRegisteringRef.current = true;
    setLoading(true);
    registerBrowserToken({ showToast: false })
      .catch((error) => {
        console.warn("Unable to register web notification token", error);
      })
      .finally(() => {
        autoRegisteringRef.current = false;
        setLoading(false);
      });
  }, [configured, permission, registerBrowserToken, supported, token, user]);

  const enableNotifications = useCallback(async () => {
    if (!user) throw new Error("Please sign in before enabling web notifications.");
    if (!supported) throw new Error("This browser does not support web push notifications.");
    if (configError) throw new Error(configError);

    setLoading(true);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") throw new Error("Notification permission was not granted.");

      return await registerBrowserToken({ showToast: true });
    } finally {
      setLoading(false);
    }
  }, [configError, registerBrowserToken, supported, user]);

  return {
    supported,
    configured,
    configError,
    permission,
    token,
    loading,
    enableNotifications,
  };
};