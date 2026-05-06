import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  User,
} from "firebase/auth";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import app, { db } from "@/lib/firebase";

const auth = getAuth(app);

export interface UserProfile {
  uid: string;
  username: string;
  email: string;
  phone?: string;
  whatsappNumber?: string;
  callNumber?: string;
  role: "admin" | "user";
  createdAt?: Timestamp;
}

export interface HistoryEntry {
  id: string;
  uid: string;
  action: string;
  description: string;
  timestamp: Timestamp;
  meta?: Record<string, unknown>;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  history: HistoryEntry[];
  login: (email: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logHistory: (action: string, description: string, meta?: Record<string, unknown>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  history: [],
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
  logHistory: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Listen to auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setUserProfile(null);
        setHistory([]);
        setLoading(false);
        return;
      }
      setLoading(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (profileDoc) => {
      if (profileDoc.exists()) {
        setUserProfile(profileDoc.data() as UserProfile);
        setLoading(false);
        return;
      }

      setUserProfile({
        uid: user.uid,
        username: user.displayName || "User",
        email: user.email || "",
        role: "user",
      });
      setLoading(false);
    }, (error) => {
      console.error("Error fetching user profile:", error);
      setUserProfile({
        uid: user.uid,
        username: user.displayName || "User",
        email: user.email || "",
        role: "user",
      });
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  // Listen to user history when logged in
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "history"),
      where("uid", "==", user.uid),
      orderBy("timestamp", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HistoryEntry)));
    }, (err) => {
      console.error("Error fetching history:", err);
    });
    return unsub;
  }, [user]);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // Log login history
    await addDoc(collection(db, "history"), {
      uid: cred.user.uid,
      action: "login",
      description: "User logged in",
      timestamp: serverTimestamp(),
    });
  };

  const signup = async (username: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: username.trim() });

    // Store user data in Firebase "users" collection with unique UID
    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      username: username.trim(),
      email: email.trim(),
      role: "user",
      createdAt: serverTimestamp(),
    });

    // Log signup history
    await addDoc(collection(db, "history"), {
      uid: cred.user.uid,
      action: "signup",
      description: "Account created",
      timestamp: serverTimestamp(),
    });
  };

  const logout = async () => {
    if (user) {
      await addDoc(collection(db, "history"), {
        uid: user.uid,
        action: "logout",
        description: "User logged out",
        timestamp: serverTimestamp(),
      });
    }
    await signOut(auth);
  };

  const logHistory = async (action: string, description: string, meta?: Record<string, unknown>) => {
    if (!user) return;
    await addDoc(collection(db, "history"), {
      uid: user.uid,
      action,
      description,
      timestamp: serverTimestamp(),
      ...(meta ? { meta } : {}),
    });
  };

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, history, login, signup, logout, logHistory }}>
      {children}
    </AuthContext.Provider>
  );
};
