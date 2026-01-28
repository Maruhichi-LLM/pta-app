import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { AuditActionType, AuditTargetType, Prisma } from "@prisma/client";
import { getFiscalYear, resolveFiscalYearStartMonth } from "@/lib/fiscal-year";
import { upsertSearchIndex } from "@/lib/search-index";
import { assertWriteRequestSecurity } from "@/lib/security";
import { extractClientMeta, recordAuditLog } from "@/lib/audit";
import { captureApiException, setApiSentryContext } from "@/lib/sentry";

type CreateLedgerRequest = {
  title?: string;
  amount?: number | string;
  receiptUrl?: string;
  notes?: string;
  accountId?: number | string;
  transactionDate?: string;
};

function parseDateInput(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isoString = trimmed.length <= 10 ? `${trimmed}T00:00:00` : trimmed;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

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
    {}) as CreateLedgerRequest;

  const title = body.title?.trim();
  const receiptUrl = body.receiptUrl?.trim();
  const notes = body.notes?.trim();
  const amountNumber = Number(body.amount);
  const accountIdNumber = Number(body.accountId);
  const transactionDate = parseDateInput(body.transactionDate);

  if (
    !title ||
    !Number.isFinite(amountNumber) ||
    amountNumber === 0 ||
    !Number.isInteger(accountIdNumber) ||
    !transactionDate
  ) {
    return NextResponse.json(
      { error: "内容・金額・勘定科目・日付を正しく入力してください。" },
      { status: 400 }
    );
  }

  const account = await prisma.account.findFirst({
    where: { id: accountIdNumber, groupId: session.groupId, isArchived: false },
  });

  if (!account) {
    return NextResponse.json(
      { error: "勘定科目を選択してください。" },
      { status: 400 }
    );
  }

  const route = new URL(request.url).pathname;
  const sentryContext = {
    module: "accounting",
    action: "ledger-create",
    route,
    method: request.method,
    groupId: session.groupId,
    memberId: session.memberId,
  } as const;
  setApiSentryContext(sentryContext);

  try {
    const ledger = await prisma.ledger.create({
      data: {
        groupId: session.groupId,
        createdByMemberId: session.memberId,
        title,
        amount: Math.round(amountNumber),
        transactionDate,
        receiptUrl,
        notes,
        accountId: account.id,
      },
    });

    const clientMeta = extractClientMeta(request);
    await recordAuditLog({
      groupId: session.groupId,
      actorMemberId: session.memberId,
      actionType: AuditActionType.CREATE,
      targetType: AuditTargetType.LEDGER,
      targetId: ledger.id,
      afterJson: ledger as unknown as Prisma.JsonValue,
      ipAddress: clientMeta.ipAddress,
      userAgent: clientMeta.userAgent,
    });

    revalidatePath("/accounting");

    const startMonth = await resolveFiscalYearStartMonth(session.groupId);
    await upsertSearchIndex({
      groupId: session.groupId,
      entityType: "LEDGER",
      entityId: ledger.id,
      title: ledger.title,
      content: ledger.notes,
      urlPath: `/accounting?focus=${ledger.id}`,
      threadId: ledger.sourceThreadId ?? null,
      fiscalYear: getFiscalYear(ledger.transactionDate, startMonth),
      occurredAt: ledger.transactionDate,
    });

    return NextResponse.json({ success: true, ledger });
  } catch (error) {
    captureApiException(error, {
      ...sentryContext,
      entity: { accountId: account.id },
    });
    return NextResponse.json(
      { error: "経費の作成に失敗しました。" },
      { status: 500 }
    );
  }
}
