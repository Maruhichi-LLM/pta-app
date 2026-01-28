import type { Event, EventHint, init } from "@sentry/nextjs";

type Options = Parameters<typeof init>[0];

const REDACTED_VALUE = "[REDACTED]";
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const REDACT_KEYS = [
  "password",
  "passwd",
  "passphrase",
  "secret",
  "token",
  "authorization",
  "cookie",
  "session",
  "set-cookie",
  "email",
  "receipt",
  "signedurl",
  "presigned",
  "fileurl",
  "url",
  "uri",
];

function shouldRedactKey(key: string) {
  const normalized = key.toLowerCase();
  return REDACT_KEYS.some((entry) => normalized.includes(entry));
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (shouldRedactKey(key)) {
        result[key] = REDACTED_VALUE;
      } else {
        result[key] = redactValue(entry, depth + 1);
      }
    }
    return result;
  }
  if (typeof value === "string" && EMAIL_PATTERN.test(value)) {
    return REDACTED_VALUE;
  }
  return value;
}

function stripUrlQuery(value: string) {
  const index = value.indexOf("?");
  return index >= 0 ? value.slice(0, index) : value;
}

function sanitizeEvent<T extends Event>(event: T): T {
  if (event.request) {
    if (event.request.url) {
      event.request.url = stripUrlQuery(event.request.url);
    }
    if (event.request.data) {
      event.request.data = redactValue(event.request.data);
    }
    if (event.request.cookies) {
      event.request.cookies = undefined;
    }
    if (event.request.headers) {
      const headers = { ...event.request.headers };
      for (const key of Object.keys(headers)) {
        if (shouldRedactKey(key)) {
          delete headers[key];
        }
      }
      event.request.headers = headers;
    }
  }

  if (event.user) {
    if ("email" in event.user) {
      event.user.email = undefined;
    }
    if ("ip_address" in event.user) {
      event.user.ip_address = undefined;
    }
  }

  if (event.extra) {
    event.extra = redactValue(event.extra) as Record<string, unknown>;
  }

  if (event.contexts?.knot) {
    event.contexts.knot = redactValue(event.contexts.knot) as Record<
      string,
      unknown
    >;
  }

  return event;
}

function isSentryEnabled() {
  if (process.env.NODE_ENV === "test") return false;
  if (process.env.SENTRY_ENABLED === "false") return false;
  return Boolean(process.env.SENTRY_DSN);
}

function isDebugEnabled() {
  const value = process.env.SENTRY_DEBUG;
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true";
}

function normalizeSampleRate(value: string | undefined) {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}

export function getSentryBaseConfig(): Options {
  return {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    release: process.env.SENTRY_RELEASE,
    enabled: isSentryEnabled(),
    tracesSampleRate: normalizeSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
    sendDefaultPii: false,
    debug: isDebugEnabled(),
    beforeSend(event, _hint?: EventHint) {
      return sanitizeEvent(event);
    },
  };
}
