import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { FiscalYearCloseStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

type CreateOrUpdateRequest = {
  fiscalYear: number;
  startDate: string;
  endDate: string;
  previousCarryover?: number;
  action?: "create" | "recalculate" | "confirm";
};

type StatementItem = {
  accountId: number;
  accountName: string;
  amount: number;
};

type Statement = {
  revenue: StatementItem[];
  expense: StatementItem[];
  totalRevenue: number;
  totalExpense: number;
  balance: number;
  previousCarryover: number;
  nextCarryover: number;
};

// GET: 指定年度の締め情報を取得
export async function GET(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fiscalYearParam = searchParams.get("fiscalYear");

  if (!fiscalYearParam) {
    return NextResponse.json(
      { error: "fiscalYearパラメータが必要です。" },
      { status: 400 }
    );
  }

  const fiscalYear = Number(fiscalYearParam);
  if (isNaN(fiscalYear)) {
    return NextResponse.json(
      { error: "fiscalYearは数値で指定してください。" },
      { status: 400 }
    );
  }

  const fiscalYearClose = await prisma.fiscalYearClose.findUnique({
    where: {
      groupId_fiscalYear: {
        groupId: session.groupId,
        fiscalYear,
      },
    },
    include: {
      confirmedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });

  if (!fiscalYearClose) {
    return NextResponse.json(
      { error: "指定された年度の締め情報が見つかりません。" },
      { status: 404 }
    );
  }

  return NextResponse.json({ fiscalYearClose });
}

// 収支計算書を自動生成
async function generateStatement(
  groupId: number,
  fiscalYear: number,
  startDate: Date,
  endDate: Date,
  previousCarryover: number
): Promise<Statement> {
  // 期間内の全てのLedger（承認済みのみ）を取得
  const ledgers = await prisma.ledger.findMany({
    where: {
      groupId,
      status: "APPROVED",
      transactionDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      account: true,
    },
  });

  // 勘定科目ごとに集計
  const revenueMap = new Map<number, { accountName: string; amount: number }>();
  const expenseMap = new Map<number, { accountName: string; amount: number }>();

  for (const ledger of ledgers) {
    if (!ledger.account) continue;

    const accountId = ledger.account.id;
    const accountName = ledger.account.name;
    const amount = ledger.amount;

    if (ledger.account.type === "INCOME") {
      const current = revenueMap.get(accountId) ?? { accountName, amount: 0 };
      current.amount += amount;
      revenueMap.set(accountId, current);
    } else if (ledger.account.type === "EXPENSE") {
      const current = expenseMap.get(accountId) ?? { accountName, amount: 0 };
      current.amount += amount;
      expenseMap.set(accountId, current);
    }
  }

  // StatementItem配列に変換
  const revenue: StatementItem[] = Array.from(revenueMap.entries()).map(
    ([accountId, { accountName, amount }]) => ({
      accountId,
      accountName,
      amount,
    })
  );

  const expense: StatementItem[] = Array.from(expenseMap.entries()).map(
    ([accountId, { accountName, amount }]) => ({
      accountId,
      accountName,
      amount,
    })
  );

  const totalRevenue = revenue.reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = expense.reduce((sum, item) => sum + item.amount, 0);
  const balance = totalRevenue - totalExpense;
  const nextCarryover = previousCarryover + balance;

  return {
    revenue,
    expense,
    totalRevenue,
    totalExpense,
    balance,
    previousCarryover,
    nextCarryover,
  };
}

// POST: 作成/更新/確定
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
    {}) as CreateOrUpdateRequest;

  if (!body.fiscalYear || typeof body.fiscalYear !== "number") {
    return NextResponse.json(
      { error: "fiscalYearを指定してください。" },
      { status: 400 }
    );
  }

  if (!body.startDate || !body.endDate) {
    return NextResponse.json(
      { error: "startDateとendDateを指定してください。" },
      { status: 400 }
    );
  }

  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json(
      { error: "日付の形式が不正です。" },
      { status: 400 }
    );
  }

  const previousCarryover = body.previousCarryover ?? 0;
  const action = body.action ?? "create";

  // 既存の締めを確認
  const existing = await prisma.fiscalYearClose.findUnique({
    where: {
      groupId_fiscalYear: {
        groupId: session.groupId,
        fiscalYear: body.fiscalYear,
      },
    },
  });

  // 確定済みの場合は更新不可
  if (existing && existing.status === "CONFIRMED" && action !== "confirm") {
    return NextResponse.json(
      { error: "確定済みの年度は再計算できません。" },
      { status: 400 }
    );
  }

  // 収支計算書を生成
  const statement = await generateStatement(
    session.groupId,
    body.fiscalYear,
    startDate,
    endDate,
    previousCarryover
  );

  if (action === "confirm") {
    // 確定処理
    if (!existing) {
      return NextResponse.json(
        { error: "確定する前に下書きを作成してください。" },
        { status: 400 }
      );
    }

    if (existing.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "既に確定済みです。" },
        { status: 400 }
      );
    }

    const updated = await prisma.fiscalYearClose.update({
      where: { id: existing.id },
      data: {
        status: FiscalYearCloseStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedById: session.memberId,
      },
      include: {
        confirmedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    // 確定したら次年度のcarryoverAmountを更新
    await prisma.accountingSetting.updateMany({
      where: { groupId: session.groupId },
      data: { carryoverAmount: statement.nextCarryover },
    });

    revalidatePath("/accounting");
    return NextResponse.json({ success: true, fiscalYearClose: updated });
  }

  // 作成または再計算
  if (existing) {
    // 更新（再計算）
    const updated = await prisma.fiscalYearClose.update({
      where: { id: existing.id },
      data: {
        startDate,
        endDate,
        totalRevenue: statement.totalRevenue,
        totalExpense: statement.totalExpense,
        balance: statement.balance,
        previousCarryover: statement.previousCarryover,
        nextCarryover: statement.nextCarryover,
        statement: statement as any,
      },
      include: {
        confirmedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    revalidatePath("/accounting");
    return NextResponse.json({ success: true, fiscalYearClose: updated });
  } else {
    // 新規作成
    const created = await prisma.fiscalYearClose.create({
      data: {
        groupId: session.groupId,
        fiscalYear: body.fiscalYear,
        startDate,
        endDate,
        status: FiscalYearCloseStatus.DRAFT,
        totalRevenue: statement.totalRevenue,
        totalExpense: statement.totalExpense,
        balance: statement.balance,
        previousCarryover: statement.previousCarryover,
        nextCarryover: statement.nextCarryover,
        statement: statement as any,
      },
      include: {
        confirmedBy: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    revalidatePath("/accounting");
    return NextResponse.json({ success: true, fiscalYearClose: created });
  }
}
