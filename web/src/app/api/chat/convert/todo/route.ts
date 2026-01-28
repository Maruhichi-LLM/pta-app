import { NextRequest, NextResponse } from "next/server";
import {
  convertMessageToTodo,
  loadChatMessageForConversion,
} from "@/lib/chat-conversions";
import { getSessionFromCookies } from "@/lib/session";
import { assertWriteRequestSecurity } from "@/lib/security";

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
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
