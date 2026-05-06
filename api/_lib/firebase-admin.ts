import { existsSync, readFileSync, readdirSync } from "node:fs";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

let initialized = false;

const readLocalServiceAccount = (): ServiceAccount | null => {
  const configuredPath = process.env.FIREBASE_ADMIN_SDK_FILE;
  const candidatePath = configuredPath && existsSync(configuredPath)
    ? configuredPath
    : readdirSync(process.cwd()).find((fileName) => /firebase-adminsdk.*\.json$/i.test(fileName));

  if (!candidatePath) return null;

  const parsed = JSON.parse(readFileSync(candidatePath, "utf8")) as ServiceAccount & {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
  const projectId = parsed.projectId || parsed.project_id;
  const clientEmail = parsed.clientEmail || parsed.client_email;
  const privateKey = parsed.privateKey || parsed.private_key;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Local Firebase Admin SDK file is missing projectId, clientEmail, or privateKey.");
  }

  return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
};

const parseServiceAccount = (): ServiceAccount => {
  if (process.env.FIREBASE_ADMIN_SDK_BASE64) {
    const decoded = Buffer.from(process.env.FIREBASE_ADMIN_SDK_BASE64, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as ServiceAccount & {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    const projectId = parsed.projectId || parsed.project_id;
    const clientEmail = parsed.clientEmail || parsed.client_email;
    const privateKey = parsed.privateKey || parsed.private_key;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("FIREBASE_ADMIN_SDK_BASE64 is missing projectId, clientEmail, or privateKey.");
    }
    return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount & {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    const projectId = parsed.projectId || parsed.project_id;
    const clientEmail = parsed.clientEmail || parsed.client_email;
    const privateKey = parsed.privateKey || parsed.private_key;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is missing projectId, clientEmail, or privateKey.");
    }
    return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    const localServiceAccount = readLocalServiceAccount();
    if (localServiceAccount) return localServiceAccount;
    throw new Error("Firebase Admin environment variables are missing.");
  }

  return { projectId, clientEmail, privateKey };
};

const initializeFirebaseAdmin = () => {
  if (initialized || getApps().length > 0) {
    initialized = true;
    return;
  }

  initializeApp({
    credential: cert(parseServiceAccount()),
  });
  initialized = true;
};

export const getFirebaseAdminAuth = () => {
  initializeFirebaseAdmin();
  return getAuth();
};

export const getFirebaseAdminDb = () => {
  initializeFirebaseAdmin();
  return getFirestore();
};

export const getFirebaseAdminMessaging = () => {
  initializeFirebaseAdmin();
  return getMessaging();
};

export { FieldValue };