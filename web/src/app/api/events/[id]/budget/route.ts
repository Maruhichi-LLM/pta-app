import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureEventBudgetEnabled } from "@/lib/modules";
import { revalidatePath } from "next/cache";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

type CreateBudgetRequest = {
  plannedRevenue?: number;
  plannedExpense?: number;
};

type UpdateBudgetRequest = {
  plannedRevenue?: number;
  plannedExpense?: number;
  status?: "PLANNING" | "IN_PROGRESS" | "CONFIRMED";
};

// EventBudget作成
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

  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureEventBudgetEnabled(session.groupId);

  const { id: eventIdString } = await params;
  const eventId = Number(eventIdString);

  const event = await prisma.event.findFirst({
    where: { id: eventId, groupId: session.groupId },
    include: { budget: true },
  });

  if (!event) {
    return NextResponse.json({ error: "イベントが見つかりません。" }, { status: 404 });
  }

  if (event.budget) {
    return NextResponse.json(
      { error: "既に収支管理が作成されています。" },
      { status: 400 }
    );
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as CreateBudgetRequest;

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

  const eventBudget = await prisma.eventBudget.create({
    data: {
      eventId: event.id,
      groupId: session.groupId,
      plannedRevenue: body.plannedRevenue || 0,
      plannedExpense: body.plannedExpense || 0,
      status: "PLANNING",
    },
  });

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");

  return NextResponse.json({ success: true, eventBudget });
}

// EventBudget取得
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: eventIdString } = await params;
  const eventId = Number(eventIdString);

  const eventBudget = await prisma.eventBudget.findFirst({
    where: {
      eventId,
      groupId: session.groupId,
    },
    include: {
      transactions: {
        include: {
          account: true,
          createdBy: { select: { id: true, displayName: true } },
        },
        orderBy: { transactionDate: "desc" },
      },
      imports: {
        include: {
          importedBy: { select: { id: true, displayName: true } },
        },
        orderBy: { importedAt: "desc" },
      },
    },
  });

  if (!eventBudget) {
    return NextResponse.json({ error: "収支管理が見つかりません。" }, { status: 404 });
  }

  // actualRevenue/actualExpenseを計算
  const actualRevenue = eventBudget.transactions
    .filter((t) => t.type === "REVENUE")
    .reduce((sum, t) => sum + t.amount, 0);

  const actualExpense = eventBudget.transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amount, 0);

  return NextResponse.json({
    ...eventBudget,
    actualRevenue,
    actualExpense,
  });
}

// EventBudget更新（予算・状態）
export async function PATCH(
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

  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureEventBudgetEnabled(session.groupId);

  const { id: eventIdString } = await params;
  const eventId = Number(eventIdString);

  const eventBudget = await prisma.eventBudget.findFirst({
    where: {
      eventId,
      groupId: session.groupId,
    },
  });

  if (!eventBudget) {
    return NextResponse.json({ error: "収支管理が見つかりません。" }, { status: 404 });
  }

  if (eventBudget.status === "IMPORTED") {
    return NextResponse.json(
      { error: "取込済みの収支は編集できません。" },
      { status: 400 }
    );
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as UpdateBudgetRequest;

  const updateData: {
    plannedRevenue?: number;
    plannedExpense?: number;
    status?: "PLANNING" | "IN_PROGRESS" | "CONFIRMED";
    confirmedAt?: Date;
    confirmedById?: number;
  } = {};

  if (body.plannedRevenue !== undefined) {
    updateData.plannedRevenue = body.plannedRevenue;
  }
  if (body.plannedExpense !== undefined) {
    updateData.plannedExpense = body.plannedExpense;
  }
  if (body.status) {
    updateData.status = body.status;
    if (body.status === "CONFIRMED") {
      updateData.confirmedAt = new Date();
      updateData.confirmedById = session.memberId;
    }
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

  const updated = await prisma.eventBudget.update({
    where: { id: eventBudget.id },
    data: updateData,
  });

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");

  return NextResponse.json({ success: true, eventBudget: updated });
}
