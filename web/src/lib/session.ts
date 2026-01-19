import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "pta_session";

export type SessionPayload = {
  memberId: number;
  groupId: number;
};

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return secret;
}

export function encodeSession(payload: SessionPayload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getSecret())
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

export function decodeSession(value: string | undefined | null) {
  if (!value) return null;
  const [data, signature] = value.split(".");
  if (!data || !signature) return null;

  const expectedSignature = createHmac("sha256", getSecret())
    .update(data)
    .digest("base64url");

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const json = Buffer.from(data, "base64url").toString("utf8");
    return JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSessionFromCookies() {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE_NAME)?.value;
  return decodeSession(value);
}

export function buildSessionCookie(payload: SessionPayload) {
  return {
    name: SESSION_COOKIE_NAME,
    value: encodeSession(payload),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function buildClearSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
  };
}
