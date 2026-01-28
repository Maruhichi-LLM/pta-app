import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuditViewerForApi } from "@/lib/audit/access";
import {
  AuditActionType,
  AuditFindingCategory,
  AuditFindingSeverity,
  AuditFindingStatus,
  AuditTargetType,
  Prisma,
} from "@prisma/client";
import { assertWriteRequestSecurity } from "@/lib/security";
import { recordAuditLog } from "@/lib/audit/logging";

function isFindingStatus(value: unknown): value is AuditFindingStatus {
  return (
    typeof value === "string" &&
    Object.values(AuditFindingStatus).includes(value as AuditFindingStatus)
  );
}

function isFindingSeverity(value: unknown): value is AuditFindingSeverity {
  return (
    typeof value === "string" &&
    Object.values(AuditFindingSeverity).includes(value as AuditFindingSeverity)
  );
}

function isFindingCategory(value: unknown): value is AuditFindingCategory {
  return (
    typeof value === "string" &&
    Object.values(AuditFindingCategory).includes(value as AuditFindingCategory)
  );
}

function normalizeLogIds(value: unknown): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
  return Array.from(new Set(ids));
}

function normalizeTargetRefs(value: unknown) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = assertWriteRequestSecurity(request);
  if (guard) return guard;

  const context = await getAuditViewerForApi();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { session, member } = context;

  const { id } = await params;
  const findingId = Number(id);
  if (!Number.isInteger(findingId) || findingId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : undefined;
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : undefined;
  const category = isFindingCategory(body.category)
    ? body.category
    : undefined;
  const severity = isFindingSeverity(body.severity)
    ? body.severity
    : undefined;
  const status = isFindingStatus(body.status)
    ? body.status
    : undefined;
  const logIds = normalizeLogIds(body.logIds);
  const targetRefs = normalizeTargetRefs(body.targetRefs);
  const assigneeMemberIdRaw = body.assigneeMemberId;

  const data: Prisma.AuditFindingUpdateInput = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (category !== undefined) data.category = category;
  if (severity !== undefined) data.severity = severity;
  if (status !== undefined) data.status = status;
  if (logIds !== undefined) data.logIds = logIds;
  if (targetRefs !== undefined) data.targetRefs = targetRefs;

  if (assigneeMemberIdRaw !== undefined) {
    const memberId = Number(assigneeMemberIdRaw);
    if (Number.isInteger(memberId)) {
      const assignee = await prisma.member.findFirst({
        where: { id: memberId, groupId: session.groupId },
        select: { id: true },
      });
      data.assignee = assignee ? { connect: { id: assignee.id } } : { disconnect: true };
    } else {
      data.assignee = { disconnect: true };
    }
  }

  const previous = await prisma.auditFinding.findFirst({
    where: { id: findingId, groupId: session.groupId },
  });

  if (!previous) {
    return NextResponse.json({ error: "指摘が見つかりません。" }, { status: 404 });
  }

  const finding = await prisma.auditFinding.update({
    where: { id: findingId },
    data,
    include: {
      assignee: { select: { id: true, displayName: true } },
      createdBy: { select: { id: true, displayName: true } },
    },
  });

  await recordAuditLog({
    groupId: session.groupId,
    actorMemberId: member.id,
    actionType: AuditActionType.UPDATE,
    targetType: AuditTargetType.AUDIT_FINDING,
    targetId: finding.id,
    beforeJson: previous as unknown as Prisma.JsonValue,
    afterJson: finding as unknown as Prisma.JsonValue,
  });

  return NextResponse.json({
    finding: {
      ...finding,
      createdAt: finding.createdAt.toISOString(),
      updatedAt: finding.updatedAt.toISOString(),
    },
  });
}
