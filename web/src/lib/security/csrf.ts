export const CSRF_ERROR_MESSAGE = "不正なリクエストです。（CSRF）";

type SameOriginResult = {
  ok: boolean;
  reason?: string;
};

let cachedOrigins: string[] | null = null;
let cachedEnvSignature: string | null = null;

export function assertSameOrigin(request: Request): SameOriginResult {
  const allowedOrigins = resolveAllowedOrigins();
  const originHeader = request.headers.get("origin");
  if (originHeader) {
    const origin = normalizeOrigin(originHeader);
    if (origin && allowedOrigins.includes(origin)) {
      return { ok: true };
    }
    return { ok: false, reason: `Origin '${originHeader}' is not allowed` };
  }

  const referer = request.headers.get("referer");
  if (referer) {
    const refererOrigin = normalizeOrigin(referer);
    if (refererOrigin && allowedOrigins.includes(refererOrigin)) {
      return { ok: true };
    }
    return { ok: false, reason: `Referer '${referer}' is not allowed` };
  }

  // 一部のブラウザや古いクライアントではOrigin/Refererヘッダが付与されない場合がある。
  // 今回は後方互換性を優先して許可するが、将来的には厳格化を検討する。
  return { ok: true };
}

export function resolveAllowedOrigins(): string[] {
  const envSignature = [
    process.env.APP_ORIGIN,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_URL,
    process.env.NODE_ENV,
  ].join("|");

  if (cachedOrigins && cachedEnvSignature === envSignature) {
    return cachedOrigins;
  }

  const origins = new Set<string>();
  const append = (value?: string | null) => {
    if (!value) return;
    value
      .split(",")
      .map((item) => normalizeOrigin(item.trim()))
      .filter((item): item is string => Boolean(item))
      .forEach((item) => origins.add(item));
  };

  append(process.env.APP_ORIGIN);
  append(process.env.NEXT_PUBLIC_APP_URL);

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    append(vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`);
  }

  if (origins.size === 0 && process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
  }

  cachedOrigins = Array.from(origins);
  cachedEnvSignature = envSignature;
  return cachedOrigins;
}

function normalizeOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}
