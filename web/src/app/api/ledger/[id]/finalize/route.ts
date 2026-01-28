import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { getFiscalYear, resolveFiscalYearStartMonth } from "@/lib/fiscal-year";
import { upsertSearchIndex } from "@/lib/search-index";
import { assertWriteRequestSecurity } from "@/lib/security";

type FinalizeLedgerRequest = {
  ledgerId?: number | string;
  amount?: number | string;
  accountId?: number | string;
  receiptUrl?: string;
  notes?: string;
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

function resolveLedgerId(
  paramId?: string,
  fallback?: number | string | null
): number | null {
  const parse = (value: unknown) => {
    if (typeof value !== "string" && typeof value !== "number") {
      return null;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };
  return parse(paramId) ?? parse(fallback);
}

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

  const payload = ((await request.json().catch(() => ({}))) ??
    {}) as FinalizeLedgerRequest;
  const { id: paramId } = await params;
  const id = resolveLedgerId(paramId, payload.ledgerId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid ledger id" }, { status: 400 });
  }
  const transactionDate = parseDateInput(payload.transactionDate);
  if (!transactionDate) {
    return NextResponse.json(
      { error: "日付を正しく入力してください。" },
      { status: 400 }
    );
  }

  const amountNumber = Number(payload.amount);
  const accountIdNumber = Number(payload.accountId);

  if (
    !Number.isFinite(amountNumber) ||
    amountNumber <= 0 ||
    !Number.isInteger(accountIdNumber)
  ) {
    return NextResponse.json(
      { error: "金額と勘定科目を正しく入力してください。" },
      { status: 400 }
    );
  }

  const [ledger, member, account] = await Promise.all([
    prisma.ledger.findFirst({
      where: { id, groupId: session.groupId },
      select: {
        id: true,
        createdByMemberId: true,
        status: true,
      },
    }),
    prisma.member.findUnique({
      where: { id: session.memberId },
      select: { role: true },
    }),
    prisma.account.findFirst({
      where: {
        id: accountIdNumber,
        groupId: session.groupId,
        isArchived: false,
      },
      select: { id: true },
    }),
  ]);

  if (!ledger) {
    return NextResponse.json({ error: "対象が見つかりません。" }, { status: 404 });
  }

  if (ledger.status !== "DRAFT") {
    return NextResponse.json(
      { error: "この申請はすでに処理済みです。" },
      { status: 400 }
    );
  }

  const isCreator = ledger.createdByMemberId === session.memberId;
  const isAdmin = member?.role === ROLE_ADMIN;
  if (!isCreator && !isAdmin) {
    return NextResponse.json(
      { error: "下書きを申請に出す権限がありません。" },
      { status: 403 }
    );
  }

  if (!account) {
    return NextResponse.json(
      { error: "勘定科目が存在しません。" },
      { status: 400 }
    );
  }

  const receiptUrl =
    (payload.receiptUrl ? String(payload.receiptUrl).trim() : undefined) || null;
  const notes =
    (payload.notes ? String(payload.notes).trim() : undefined) || null;

  const updated = await prisma.ledger.update({
    where: { id: ledger.id },
    data: {
      amount: Math.round(amountNumber),
      accountId: account.id,
      transactionDate,
      receiptUrl,
      notes,
      status: "PENDING",
    },
    include: {
      approvals: {
        orderBy: { createdAt: "desc" },
        include: { actedBy: true },
      },
      createdBy: true,
      account: {
        select: { id: true, name: true, type: true },
      },
    },
  });

  revalidatePath("/accounting");

  const startMonth = await resolveFiscalYearStartMonth(session.groupId);
  await upsertSearchIndex({
    groupId: session.groupId,
    entityType: "LEDGER",
    entityId: updated.id,
    title: updated.title,
    content: updated.notes,
    urlPath: `/accounting?focus=${updated.id}`,
    threadId: updated.sourceThreadId ?? null,
    fiscalYear: getFiscalYear(updated.transactionDate, startMonth),
    occurredAt: updated.transactionDate,
  });

  return NextResponse.json({ success: true, ledger: updated });
}
