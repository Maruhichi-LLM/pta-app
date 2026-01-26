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

  revalidatePath("/accounting");

  return NextResponse.json({ success: true, ledger });
}
