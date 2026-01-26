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

function resolveLedgerId(paramId?: string): number | null {
  if (!paramId) return null;
  const parsed = Number(paramId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

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

  const { id } = await params;
  const ledgerId = resolveLedgerId(id);
  if (ledgerId === null) {
    return NextResponse.json({ error: "Invalid ledger id" }, { status: 400 });
  }

  const ledger = await prisma.ledger.findFirst({
    where: { id: ledgerId, groupId: session.groupId },
  });

  if (!ledger) {
    return NextResponse.json({ error: "対象が見つかりません。" }, { status: 404 });
  }

  if (ledger.status !== "REJECTED") {
    return NextResponse.json(
      { error: "却下された経費のみ下書きに戻せます。" },
      { status: 400 }
    );
  }

  // 却下された経費を下書きに戻す
  const updatedLedger = await prisma.ledger.update({
    where: { id: ledger.id },
    data: { status: "DRAFT" },
  });

  revalidatePath("/accounting");

  return NextResponse.json({ success: true, ledger: updatedLedger });
}
