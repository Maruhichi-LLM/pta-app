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

// EventTransaction削除
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; transactionId: string }> }
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

  const { id: eventIdString, transactionId: transactionIdString } = await params;
  const eventId = Number(eventIdString);
  const transactionId = Number(transactionIdString);

  const transaction = await prisma.eventTransaction.findFirst({
    where: {
      id: transactionId,
    },
    include: {
      eventBudget: true,
    },
  });

  if (!transaction) {
    return NextResponse.json(
      { error: "取引が見つかりません。" },
      { status: 404 }
    );
  }

  if (transaction.eventBudget.groupId !== session.groupId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (transaction.eventBudget.eventId !== eventId) {
    return NextResponse.json(
      { error: "イベントIDが一致しません。" },
      { status: 400 }
    );
  }

  if (transaction.eventBudget.status === "IMPORTED") {
    return NextResponse.json(
      { error: "取込済みの取引は削除できません。" },
      { status: 400 }
    );
  }

  await prisma.eventTransaction.delete({
    where: { id: transaction.id },
  });

  // actualRevenue/actualExpenseを再計算
  const transactions = await prisma.eventTransaction.findMany({
    where: { eventBudgetId: transaction.eventBudgetId },
  });

  const actualRevenue = transactions
    .filter((t) => t.type === "REVENUE")
    .reduce((sum, t) => sum + t.amount, 0);

  const actualExpense = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amount, 0);

  await prisma.eventBudget.update({
    where: { id: transaction.eventBudgetId },
    data: {
      actualRevenue,
      actualExpense,
    },
  });

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");

  return NextResponse.json({ success: true });
}
