import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

type AttendanceRequest = {
  status?: "YES" | "NO" | "MAYBE";
  comment?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { error: CSRF_ERROR_MESSAGE },
      { status: 403 }
    );
  }

  const { id } = await params;
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

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as AttendanceRequest;
  const status = body.status;

  if (status !== "YES" && status !== "NO" && status !== "MAYBE") {
    return NextResponse.json(
      { error: "出欠ステータスを選択してください。" },
      { status: 400 }
    );
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, groupId: session.groupId },
  });

  if (!event) {
    return NextResponse.json({ error: "イベントが見つかりません。" }, { status: 404 });
  }

  const attendance = await prisma.attendance.upsert({
    where: {
      eventId_memberId: {
        eventId,
        memberId: session.memberId,
      },
    },
    update: {
      status,
      comment: body.comment?.trim() || null,
      respondedAt: new Date(),
    },
    create: {
      eventId,
      memberId: session.memberId,
      status,
      comment: body.comment?.trim(),
    },
    include: {
      member: true,
    },
  });

  revalidatePath("/events");

  return NextResponse.json({ success: true, attendance });
}
