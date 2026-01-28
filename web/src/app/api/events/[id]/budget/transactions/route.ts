import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureEventBudgetEnabled } from "@/lib/modules";
import { revalidatePath } from "next/cache";
import { EventTransactionType } from "@prisma/client";
import { assertWriteRequestSecurity } from "@/lib/security";

type CreateTransactionRequest = {
  type: "REVENUE" | "EXPENSE";
  accountId: number;
  amount: number;
  description: string;
  transactionDate: string;
  receiptUrl?: string;
  notes?: string;
};

// EventTransaction作成
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
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
    return NextResponse.json(
      { error: "収支管理が見つかりません。先に収支管理を作成してください。" },
      { status: 404 }
    );
  }

  if (eventBudget.status === "IMPORTED") {
    return NextResponse.json(
      { error: "取込済みの収支には記録を追加できません。" },
      { status: 400 }
    );
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as CreateTransactionRequest;

  if (!body.type || !["REVENUE", "EXPENSE"].includes(body.type)) {
    return NextResponse.json(
      { error: "収入・支出の種別を指定してください。" },
      { status: 400 }
    );
  }

  if (!body.accountId || typeof body.accountId !== "number") {
    return NextResponse.json(
      { error: "勘定科目を選択してください。" },
      { status: 400 }
    );
  }

  if (!body.amount || typeof body.amount !== "number" || body.amount <= 0) {
    return NextResponse.json(
      { error: "金額は正の整数で入力してください。" },
      { status: 400 }
    );
  }

  if (!body.description || typeof body.description !== "string" || !body.description.trim()) {
    return NextResponse.json(
      { error: "摘要を入力してください。" },
      { status: 400 }
    );
  }

  if (!body.transactionDate) {
    return NextResponse.json(
      { error: "取引日を入力してください。" },
      { status: 400 }
    );
  }

  // 勘定科目の存在確認
  const account = await prisma.account.findFirst({
    where: {
      id: body.accountId,
      groupId: session.groupId,
    },
  });

  if (!account) {
    return NextResponse.json(
      { error: "指定された勘定科目が見つかりません。" },
      { status: 404 }
    );
  }

  // 収入は INCOME、支出は EXPENSE の科目のみ
  if (body.type === "REVENUE" && account.type !== "INCOME") {
    return NextResponse.json(
      { error: "収入には収入科目（INCOME）を選択してください。" },
      { status: 400 }
    );
  }

  if (body.type === "EXPENSE" && account.type !== "EXPENSE") {
    return NextResponse.json(
      { error: "支出には支出科目（EXPENSE）を選択してください。" },
      { status: 400 }
    );
  }

  const transaction = await prisma.eventTransaction.create({
    data: {
      eventBudgetId: eventBudget.id,
      type: body.type as EventTransactionType,
      accountId: body.accountId,
      amount: body.amount,
      description: body.description.trim(),
      transactionDate: new Date(body.transactionDate),
      receiptUrl: body.receiptUrl?.trim() || null,
      notes: body.notes?.trim() || null,
      createdByMemberId: session.memberId,
    },
    include: {
      account: true,
      createdBy: { select: { id: true, displayName: true } },
    },
  });

  // actualRevenue/actualExpenseを更新
  const transactions = await prisma.eventTransaction.findMany({
    where: { eventBudgetId: eventBudget.id },
  });

  const actualRevenue = transactions
    .filter((t) => t.type === "REVENUE")
    .reduce((sum, t) => sum + t.amount, 0);

  const actualExpense = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amount, 0);

  await prisma.eventBudget.update({
    where: { id: eventBudget.id },
    data: {
      actualRevenue,
      actualExpense,
    },
  });

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");

  return NextResponse.json({ success: true, transaction });
}
