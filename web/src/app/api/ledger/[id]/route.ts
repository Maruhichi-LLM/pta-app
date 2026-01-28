import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { AuditActionType, AuditTargetType, Prisma } from "@prisma/client";
import { deleteSearchIndex } from "@/lib/search-index";
import { assertWriteRequestSecurity } from "@/lib/security";
import { extractClientMeta, recordAuditLog } from "@/lib/audit";

type UpdateLedgerRequest = {
  ledgerId?: number | string;
  action?: "approve" | "reject";
  comment?: string;
};

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

export async function PATCH(
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

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as UpdateLedgerRequest;
  const { id: paramId } = await params;
  const id = resolveLedgerId(paramId, body.ledgerId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid ledger id" }, { status: 400 });
  }
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

  const clientMeta = extractClientMeta(request);
  await recordAuditLog({
    groupId: session.groupId,
    actorMemberId: session.memberId,
    actionType:
      action === "approve"
        ? AuditActionType.APPROVE
        : AuditActionType.REJECT,
    targetType: AuditTargetType.LEDGER,
    targetId: updatedLedger.id,
    beforeJson: ledger as unknown as Prisma.JsonValue,
    afterJson: updatedLedger as unknown as Prisma.JsonValue,
    ipAddress: clientMeta.ipAddress,
    userAgent: clientMeta.userAgent,
  });

  revalidatePath("/accounting");

  return NextResponse.json({ success: true, ledger: updatedLedger });
}

export async function DELETE(
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
      { error: "却下された経費のみ削除できます。" },
      { status: 400 }
    );
  }

  // 関連する承認レコードも一緒に削除
  await prisma.$transaction([
    prisma.approval.deleteMany({
      where: { ledgerId: ledger.id },
    }),
    prisma.ledger.delete({
      where: { id: ledger.id },
    }),
  ]);

  const clientMeta = extractClientMeta(request);
  await recordAuditLog({
    groupId: session.groupId,
    actorMemberId: session.memberId,
    actionType: AuditActionType.DELETE,
    targetType: AuditTargetType.LEDGER,
    targetId: ledger.id,
    beforeJson: ledger as unknown as Prisma.JsonValue,
    ipAddress: clientMeta.ipAddress,
    userAgent: clientMeta.userAgent,
  });

  revalidatePath("/accounting");

  await deleteSearchIndex({
    groupId: session.groupId,
    entityType: "LEDGER",
    entityId: ledger.id,
  });

  return NextResponse.json({ success: true });
}
