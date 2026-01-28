import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { assertWriteRequestSecurity } from "@/lib/security";
import { captureApiException, setApiSentryContext } from "@/lib/sentry";

function resolveLedgerId(paramId?: string): number | null {
  if (!paramId) return null;
  const parsed = Number(paramId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

  const route = new URL(request.url).pathname;
  const sentryContext = {
    module: "accounting",
    action: "ledger-revert",
    route,
    method: request.method,
    groupId: session.groupId,
    memberId: session.memberId,
    entity: { ledgerId: ledger.id },
  } as const;
  setApiSentryContext(sentryContext);

  try {
    // 却下された経費を下書きに戻す
    const updatedLedger = await prisma.ledger.update({
      where: { id: ledger.id },
      data: { status: "DRAFT" },
    });

    revalidatePath("/accounting");

    return NextResponse.json({ success: true, ledger: updatedLedger });
  } catch (error) {
    captureApiException(error, sentryContext);
    return NextResponse.json(
      { error: "下書きへの戻しに失敗しました。" },
      { status: 500 }
    );
  }
}
