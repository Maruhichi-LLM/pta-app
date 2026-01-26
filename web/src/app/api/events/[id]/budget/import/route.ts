import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureEventBudgetEnabled } from "@/lib/modules";
import { LedgerStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

type ImportRequest = {
  notes?: string;
};

// 本会計への取り込み
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

  const eventBudget = await prisma.eventBudget.findFirst({
    where: {
      eventId,
      groupId: session.groupId,
    },
    include: {
      event: true,
      transactions: {
        include: {
          account: true,
        },
        orderBy: { transactionDate: "asc" },
      },
    },
  });

  if (!eventBudget) {
    return NextResponse.json(
      { error: "収支管理が見つかりません。" },
      { status: 404 }
    );
  }

  if (eventBudget.status === "IMPORTED") {
    return NextResponse.json(
      { error: "既に本会計に取り込まれています。" },
      { status: 400 }
    );
  }

  if (eventBudget.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "収支を確定してから取り込んでください。" },
      { status: 400 }
    );
  }

  if (eventBudget.transactions.length === 0) {
    return NextResponse.json(
      { error: "取り込む取引がありません。" },
      { status: 400 }
    );
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as ImportRequest;

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

  // トランザクション内で一括処理
  const result = await prisma.$transaction(async (tx) => {
    const ledgers = [];

    for (const transaction of eventBudget.transactions) {
      if (!transaction.accountId) {
        throw new Error(
          `取引「${transaction.description}」に勘定科目が設定されていません。`
        );
      }

      // 本会計には金額をそのまま正の値で取り込む
      // 赤伝票（取り消し）は別途マイナス入力で対応
      const ledgerAmount = transaction.amount;

      // メモにイベント収支からの取り込み情報を追加
      const ledgerNotes = [
        transaction.notes,
        `イベント収支より取込（ID: ${transaction.id}）`,
      ]
        .filter(Boolean)
        .join("\n");

      const ledger = await tx.ledger.create({
        data: {
          groupId: session.groupId,
          createdByMemberId: transaction.createdByMemberId,
          title: `${eventBudget.event.title} - ${transaction.description}`,
          amount: ledgerAmount,
          transactionDate: transaction.transactionDate,
          receiptUrl: transaction.receiptUrl,
          notes: ledgerNotes,
          status: LedgerStatus.APPROVED,
          accountId: transaction.accountId,
          eventBudgetId: eventBudget.id,
        },
      });

      ledgers.push(ledger);
    }

    // EventBudgetImportレコードを作成
    const importRecord = await tx.eventBudgetImport.create({
      data: {
        eventBudgetId: eventBudget.id,
        importedByMemberId: session.memberId,
        ledgerEntryCount: ledgers.length,
        notes: body.notes || null,
      },
    });

    // EventBudgetのステータスを更新
    const updatedBudget = await tx.eventBudget.update({
      where: { id: eventBudget.id },
      data: {
        status: "IMPORTED",
        importedToLedgerAt: new Date(),
      },
    });

    return { ledgers, importRecord, updatedBudget };
  });

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  revalidatePath("/accounting");

  return NextResponse.json({
    success: true,
    imported: result.ledgers.length,
    ledgers: result.ledgers,
    importRecord: result.importRecord,
  });
}
