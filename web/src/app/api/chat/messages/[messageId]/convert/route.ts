import { NextRequest, NextResponse } from "next/server";
import {
  convertMessageToDocument,
  convertMessageToLedgerDraft,
  convertMessageToTodo,
  loadChatMessageForConversion,
} from "@/lib/chat-conversions";
import { getSessionFromCookies } from "@/lib/session";
import { assertWriteRequestSecurity } from "@/lib/security";

type ConversionTarget = "todo" | "accounting" | "document";

function parseMessageIdParam(param: string | string[] | undefined) {
  if (Array.isArray(param)) {
    param = param[0];
  }
  if (!param) {
    return null;
  }
  const match = String(param).match(/\d+/);
  if (!match) {
    return null;
  }
  const id = Number.parseInt(match[0], 10);
  return Number.isNaN(id) ? null : id;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ messageId: string }> }
) {
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = (await request.json().catch(() => ({}))) as {
    target?: ConversionTarget;
    messageId?: number;
  };
  const { messageId: rawMessageId } = await context.params;
  const messageId =
    parseMessageIdParam(rawMessageId) ??
    (Number.isInteger(payload.messageId) ? Number(payload.messageId) : null);
  if (messageId === null) {
    return NextResponse.json({ error: "Invalid message id" }, { status: 400 });
  }
  if (!payload.target || !["todo", "accounting", "document"].includes(payload.target)) {
    return NextResponse.json({ error: "Invalid conversion target" }, { status: 400 });
  }

  const message = await loadChatMessageForConversion(messageId, session.groupId);
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  try {
    switch (payload.target) {
      case "todo":
        return NextResponse.json(
          await convertMessageToTodo(message, session.memberId)
        );
      case "accounting":
        return NextResponse.json(
          await convertMessageToLedgerDraft(message, session.memberId)
        );
      case "document":
        return NextResponse.json(
          await convertMessageToDocument(message, session.memberId)
        );
      default:
        return NextResponse.json(
          { error: "Unsupported target" },
          { status: 400 }
        );
    }
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
