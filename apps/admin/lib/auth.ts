import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createUserWithProject, getAdminProject, getUserByEmail } from "./store";

export type AdminSession = {
  email: string;
  projectId?: string;
  expiresAt: number;
};

export const adminSessionCookieName = "smartup_admin_session";
export const adminSessionMaxAgeSeconds = 8 * 60 * 60;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function adminCredentials() {
  const email = (process.env.ADMIN_EMAIL || process.env.SMARTUP_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = (process.env.ADMIN_PASSWORD || process.env.SMARTUP_ADMIN_PASSWORD || "").trim();

  if (email && password) {
    return { email, password };
  }

  if (isProduction()) {
    return null;
  }

  return {
    email: email || "admin@smartup.local",
    password: password || "smartup-admin"
  };
}

function sessionSecret() {
  const secret = (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ""
  ).trim();

  if (secret) {
    return secret;
  }

  if (isProduction()) {
    throw new Error("ADMIN_SESSION_SECRET, AUTH_SECRET, or NEXTAUTH_SECRET must be configured in production.");
  }

  return "local-development-smartup-session-secret";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function hashPassword(password: string, salt = randomBytes(16).toString("base64url")) {
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, storedHash] = passwordHash.split(":");
  if (algorithm !== "scrypt" || !salt || !storedHash) {
    return false;
  }

  const calculatedHash = scryptSync(password, salt, 64).toString("base64url");
  return safeEqual(calculatedHash, storedHash);
}

async function defaultProjectId() {
  const project = await getAdminProject();
  return project?.id;
}

export async function verifyAdminCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await getUserByEmail(normalizedEmail);

  if (user) {
    return verifyPassword(password, user.passwordHash)
      ? { email: user.email, projectId: user.projectId }
      : null;
  }

  const fallbackAdmin = adminCredentials();
  if (fallbackAdmin && safeEqual(normalizedEmail, fallbackAdmin.email) && safeEqual(password, fallbackAdmin.password)) {
    return { email: normalizedEmail, projectId: await defaultProjectId() };
  }

  return null;
}

export async function registerAdminUser(input: {
  email: string;
  password: string;
  projectName?: string;
}) {
  const fallbackAdmin = adminCredentials();
  if (fallbackAdmin && input.email.trim().toLowerCase() === fallbackAdmin.email) {
    return null;
  }

  const created = await createUserWithProject({
    email: input.email,
    passwordHash: hashPassword(input.password),
    projectName: input.projectName
  });

  return created;
}

export function createAdminSessionToken(email: string, projectId?: string) {
  const payload = Buffer.from(
    JSON.stringify({
      email: email.trim().toLowerCase(),
      projectId,
      expiresAt: Date.now() + adminSessionMaxAgeSeconds * 1000
    })
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function readAdminSessionToken(token?: string | null): AdminSession | null {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
    if (!session.email || !session.expiresAt || session.expiresAt <= Date.now()) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  return readAdminSessionToken(cookieStore.get(adminSessionCookieName)?.value);
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    maxAge: adminSessionMaxAgeSeconds,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production"
  };
}
