const DEFAULT_WINDOW_SEC = parseEnvNumber(
  process.env.RATE_LIMIT_WINDOW_SECONDS,
  60
);
const DEFAULT_LOGIN_LIMIT = parseEnvNumber(
  process.env.RATE_LIMIT_LOGIN_LIMIT,
  5
);
const DEFAULT_WRITE_LIMIT = parseEnvNumber(
  process.env.RATE_LIMIT_WRITE_LIMIT,
  20
);

export type RateLimitScope = "login" | "write";

export const RATE_LIMIT_ERROR_MESSAGE =
  "リクエストが多すぎます。しばらく待ってから再試行してください。";

type RateLimitEntry = {
  windowStart: number;
  count: number;
  windowMs: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();
let lastCleanup = 0;

export type RateLimitResult = {
  ok: boolean;
  retryAfterSec?: number;
  remaining?: number;
};

export type RateLimitOptions = {
  key: string;
  limit: number;
  windowSec: number;
};

export function checkRateLimit({
  key,
  limit,
  windowSec,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  cleanupEntries(now);
  const windowMs = Math.max(1000, windowSec * 1000);
  const existing = rateLimitStore.get(key);

  if (!existing || now - existing.windowStart >= existing.windowMs) {
    rateLimitStore.set(key, {
      windowStart: now,
      count: 1,
      windowMs,
    });
    return { ok: true, remaining: Math.max(0, limit - 1) };
  }

  if (existing.count >= limit) {
    const retryAfterSec = Math.ceil(
      (existing.windowStart + existing.windowMs - now) / 1000
    );
    return { ok: false, retryAfterSec: Math.max(retryAfterSec, 1) };
  }

  existing.count += 1;
  existing.windowMs = windowMs;
  return { ok: true, remaining: Math.max(0, limit - existing.count) };
}

export function getRateLimitRule(scope: RateLimitScope) {
  const windowSec = DEFAULT_WINDOW_SEC;
  const limit =
    scope === "login" ? DEFAULT_LOGIN_LIMIT : DEFAULT_WRITE_LIMIT;
  return { windowSec, limit };
}

export function buildRateLimitKey({
  scope,
  request,
  memberId,
  action,
}: {
  scope: RateLimitScope;
  request: Request;
  memberId?: number | null;
  action?: string;
}) {
  const identifier =
    typeof memberId === "number"
      ? `member:${memberId}`
      : `ip:${getClientIp(request)}`;
  const prefix = action ?? scope;
  return `${prefix}:${identifier}`;
}

export function getClientIp(request: Request): string {
  const headerCandidates = [
    request.headers.get("x-forwarded-for"),
    request.headers.get("x-real-ip"),
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-client-ip"),
  ];

  for (const candidate of headerCandidates) {
    if (!candidate) continue;
    const ip = candidate.split(",")[0]?.trim();
    if (ip) return ip;
  }

  const forwarded = request.headers.get("forwarded");
  if (forwarded) {
    const match = forwarded.match(/for=(?:"?\[?)([^;\"]+)/i);
    if (match?.[1]) {
      const ip = match[1].replace(/["\]\s]/g, "").trim();
      if (ip) return ip;
    }
  }

  const reqWithIp = request as Request & { ip?: string | null };
  if (reqWithIp.ip) {
    return reqWithIp.ip;
  }

  const remoteAddr = (request as Request & { socket?: { remoteAddress?: string } })
    .socket?.remoteAddress;
  if (remoteAddr) {
    return remoteAddr;
  }

  return "unknown";
}

function cleanupEntries(now: number) {
  if (now - lastCleanup < DEFAULT_WINDOW_SEC * 1000) {
    return;
  }
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart >= entry.windowMs) {
      rateLimitStore.delete(key);
    }
  }
}

function parseEnvNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
