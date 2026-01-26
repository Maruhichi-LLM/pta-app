import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { ROLE_ADMIN } from "@/lib/roles";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

type EventPayload = {
  title?: string;
  description?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  createBudget?: boolean;
};

async function ensureAdmin(memberId: number) {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member || member.role !== ROLE_ADMIN) {
    return null;
  }
  return member;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export async function POST(request: Request) {
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

  const admin = await ensureAdmin(session.memberId);
  if (!admin) {
    return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
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

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as EventPayload;
  const title = body.title?.trim();
  const startsAt = parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);

  if (!title || !startsAt) {
    return NextResponse.json(
      { error: "タイトルと開始日時を入力してください。" },
      { status: 400 }
    );
  }

  if (endsAt && endsAt < startsAt) {
    return NextResponse.json(
      { error: "終了日時は開始日時以降を指定してください。" },
      { status: 400 }
    );
  }

  const event = await prisma.event.create({
    data: {
      groupId: admin.groupId,
      title,
      description: body.description?.trim(),
      location: body.location?.trim(),
      startsAt,
      endsAt,
    },
  });

  // イベント別収支管理を有効化する場合、EventBudgetレコードを作成
  if (body.createBudget) {
    await prisma.eventBudget.create({
      data: {
        eventId: event.id,
        groupId: admin.groupId,
        status: "PLANNING",
        actualRevenue: 0,
        actualExpense: 0,
      },
    });
  }

  revalidatePath("/events");

  return NextResponse.json({ success: true, event });
}
