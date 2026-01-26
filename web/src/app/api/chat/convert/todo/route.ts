import { NextRequest, NextResponse } from "next/server";
import {
  convertMessageToTodo,
  loadChatMessageForConversion,
} from "@/lib/chat-conversions";
import { getSessionFromCookies } from "@/lib/session";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

type Payload = {
  chatMessageId?: number | string;
};

function parseMessageId(value: number | string | undefined) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

export async function POST(request: NextRequest) {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { error: CSRF_ERROR_MESSAGE },
      { status: 403 }
    );
  }

  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { limit, windowSec } = getRateLimitRule("write");
  const rate = checkRateLimit({
    key: buildRateLimitKey({
      scope: "write",
      request,
      memberId: session.memberId,
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
  const payload = (await request.json().catch(() => ({}))) as Payload;
  const messageId = parseMessageId(payload.chatMessageId as number | string);
  if (!messageId) {
    return NextResponse.json({ error: "Invalid chatMessageId" }, { status: 400 });
  }
  const message = await loadChatMessageForConversion(messageId, session.groupId);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  try {
    const result = await convertMessageToTodo(message, session.memberId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "変換処理に失敗しました。",
      },
      { status: 400 }
    );
  }
}
