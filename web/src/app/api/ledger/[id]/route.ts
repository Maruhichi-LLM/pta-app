import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";

type UpdateLedgerRequest = {
  action?: "approve" | "reject";
  comment?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid ledger id" }, { status: 400 });
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as UpdateLedgerRequest;
  const action = body.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "承認または却下を指定してください。" },
      { status: 400 }
    );
  }

  const ledger = await prisma.ledger.findFirst({
    where: { id, groupId: session.groupId },
  });

  if (!ledger) {
    return NextResponse.json({ error: "対象が見つかりません。" }, { status: 404 });
  }

  if (ledger.status !== "PENDING") {
    return NextResponse.json(
      { error: "すでに処理済みです。" },
      { status: 400 }
    );
  }

  const status = action === "approve" ? "APPROVED" : "REJECTED";
  const approvalAction = action === "approve" ? "APPROVED" : "REJECTED";

  const updatedLedger = await prisma.$transaction(async (tx) => {
    await tx.approval.create({
      data: {
        ledgerId: ledger.id,
        actedByMemberId: session.memberId,
        action: approvalAction,
        comment: body.comment,
      },
    });

    return tx.ledger.update({
      where: { id: ledger.id },
      data: { status },
      include: {
        approvals: {
          orderBy: { createdAt: "desc" },
          include: { actedBy: true },
        },
        createdBy: true,
      },
    });
  });

  revalidatePath("/ledger");

  return NextResponse.json({ success: true, ledger: updatedLedger });
}
