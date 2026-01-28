import { NextResponse } from "next/server";
import { assertSameOrigin, CSRF_ERROR_MESSAGE } from "./csrf";
import {
  buildRateLimitKey,
  checkRateLimit,
  getRateLimitRule,
  RATE_LIMIT_ERROR_MESSAGE,
  RateLimitScope,
} from "./rate-limit";

export type WriteRequestSecurityOptions = {
  rateKey?: string;
  scope?: RateLimitScope;
  memberId?: number | null;
};

export function assertWriteRequestSecurity(
  request: Request,
  options: WriteRequestSecurityOptions = {}
) {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { error: CSRF_ERROR_MESSAGE },
      { status: 403 }
    );
  }

  const scope = options.scope ?? "write";
  const { limit, windowSec } = getRateLimitRule(scope);
  const rate = checkRateLimit({
    key: buildRateLimitKey({
      scope,
      request,
      memberId: options.memberId ?? null,
      action: options.rateKey,
    }),
    limit,
    windowSec,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: RATE_LIMIT_ERROR_MESSAGE },
      {
        status: 429,
        headers: rate.retryAfterSec
          ? { "Retry-After": String(rate.retryAfterSec) }
          : undefined,
      }
    );
  }

  return null;
}
