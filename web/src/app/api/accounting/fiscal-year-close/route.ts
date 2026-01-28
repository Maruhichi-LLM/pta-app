import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { FiscalYearCloseStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { assertWriteRequestSecurity } from "@/lib/security";
import {
  assertFiscalYearCloseEditable,
  computeFiscalYearPeriod,
  summarizeLedgersForStatement,
} from "@/lib/accounting/fiscalYearClose";

type CreateOrUpdateRequest = {
  fiscalYear: number;
  startDate: string;
  endDate: string;
  action?: "create" | "recalculate" | "confirm";
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

// POST: 作成/更新/確定
export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const action = body.action ?? "create";

  // 繰越金をサーバー側で解決: 前年度確定 → フォールバック accountingSetting.carryoverAmount
  const [previousYearClose, accountingSetting] = await Promise.all([
    prisma.fiscalYearClose.findUnique({
      where: {
        groupId_fiscalYear: {
          groupId: session.groupId,
          fiscalYear: body.fiscalYear - 1,
        },
      },
      select: { status: true, nextCarryover: true },
    }),
    prisma.accountingSetting.findUnique({
      where: { groupId: session.groupId },
      select: { carryoverAmount: true },
    }),
  ]);

  const previousCarryover =
    previousYearClose && previousYearClose.status === "CONFIRMED"
      ? previousYearClose.nextCarryover
      : (accountingSetting?.carryoverAmount ?? 0);

  // 既存の締めを確認
  const existing = await prisma.fiscalYearClose.findUnique({
    where: {
      groupId_fiscalYear: {
        groupId: session.groupId,
        fiscalYear: body.fiscalYear,
      },
    },
  });

  const editCheck = assertFiscalYearCloseEditable(existing, action);
  if (!editCheck.ok) {
    return NextResponse.json({ error: editCheck.error }, { status: 400 });
  }

  const period = computeFiscalYearPeriod({
    fiscalYear: body.fiscalYear,
    startDate,
    endDate,
  });

  const ledgers = await prisma.ledger.findMany({
    where: {
      groupId: session.groupId,
      transactionDate: {
        gte: period.startDate,
        lte: period.endDate,
      },
    },
    include: {
      account: true,
    },
  });

  const statement = summarizeLedgersForStatement({
    ledgers,
    previousCarryover,
    period,
  });

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

    revalidatePath("/accounting");
    return NextResponse.json({ success: true, fiscalYearClose: updated });
  }

  // 作成または再計算
  const statementPayload: Prisma.JsonValue = statement;

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
        statement: statementPayload,
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
        statement: statementPayload,
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
