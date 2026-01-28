import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { assertWriteRequestSecurity } from "@/lib/security";
import { captureApiException, setApiSentryContext } from "@/lib/sentry";

type CarryoverRequest = {
  carryoverAmount: number;
};

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
  });

  if (!member || member.role !== ROLE_ADMIN) {
    return NextResponse.json(
      { error: "権限がありません。" },
      { status: 403 }
    );
  }

  const body = ((await request.json().catch(() => ({}))) ?? {}) as CarryoverRequest;

  const amount = Number(body.carryoverAmount);
  if (!Number.isFinite(amount)) {
    return NextResponse.json(
      { error: "繰越金額を正しく指定してください。" },
      { status: 400 }
    );
  }

  const carryoverAmount = Math.round(amount);

  const route = new URL(request.url).pathname;
  const sentryContext = {
    module: "accounting",
    action: "carryover-update",
    route,
    method: request.method,
    groupId: session.groupId,
    memberId: session.memberId,
  } as const;
  setApiSentryContext(sentryContext);

  try {
    await prisma.accountingSetting.update({
      where: { groupId: session.groupId },
      data: { carryoverAmount },
    });

    revalidatePath("/accounting");

    return NextResponse.json({ success: true, carryoverAmount });
  } catch (error) {
    captureApiException(error, sentryContext);
    return NextResponse.json(
      { error: "繰越金額の更新に失敗しました。" },
      { status: 500 }
    );
  }
}
