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

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isFindingStatus(value: string | null): value is AuditFindingStatus {
  if (!value) return false;
  return Object.values(AuditFindingStatus).includes(
    value as AuditFindingStatus
  );
}

function isFindingSeverity(
  value: string | null
): value is AuditFindingSeverity {
  if (!value) return false;
  return Object.values(AuditFindingSeverity).includes(
    value as AuditFindingSeverity
  );
}

function isFindingCategory(
  value: string | null
): value is AuditFindingCategory {
  if (!value) return false;
  return Object.values(AuditFindingCategory).includes(
    value as AuditFindingCategory
  );
}

function normalizeLogIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
  return Array.from(new Set(ids));
}

function normalizeTargetRefs(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}

export async function GET(request: NextRequest) {
  const context = await getAuditViewerForApi();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { session } = context;

  const search = request.nextUrl.searchParams;
  const statusParam = search.get("status");
  const severityParam = search.get("severity");
  const fromParam = parseDate(search.get("from"));
  const toParam = parseDate(search.get("to"));

  const where: Prisma.AuditFindingWhereInput = {
    groupId: session.groupId,
  };

  if (isFindingStatus(statusParam)) {
    where.status = statusParam;
  }

  if (isFindingSeverity(severityParam)) {
    where.severity = severityParam;
  }

  if (fromParam || toParam) {
    where.createdAt = {};
    if (fromParam) {
      where.createdAt.gte = fromParam;
    }
    if (toParam) {
      where.createdAt.lte = toParam;
    }
  }

  const findings = await prisma.auditFinding.findMany({
    where,
    include: {
      assignee: { select: { id: true, displayName: true } },
      createdBy: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    findings: findings.map((finding) => ({
      id: finding.id,
      title: finding.title,
      description: finding.description,
      category: finding.category,
      severity: finding.severity,
      status: finding.status,
      logIds: finding.logIds,
      targetRefs: finding.targetRefs,
      assignee: finding.assignee
        ? { id: finding.assignee.id, displayName: finding.assignee.displayName }
        : null,
      createdBy: {
        id: finding.createdBy.id,
        displayName: finding.createdBy.displayName,
      },
      createdAt: finding.createdAt.toISOString(),
      updatedAt: finding.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const guard = assertWriteRequestSecurity(request);
  if (guard) return guard;

  const context = await getAuditViewerForApi();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { session, member } = context;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const category =
    typeof body.category === "string" && isFindingCategory(body.category)
      ? body.category
      : null;
  const severity =
    typeof body.severity === "string" && isFindingSeverity(body.severity)
      ? body.severity
      : null;
  const status =
    typeof body.status === "string" && isFindingStatus(body.status)
      ? body.status
      : AuditFindingStatus.OPEN;
  const assigneeMemberId = Number(body.assigneeMemberId);
  const logIds = normalizeLogIds(body.logIds);
  const targetRefs = normalizeTargetRefs(body.targetRefs);

  if (!title || !description || !category || !severity) {
    return NextResponse.json(
      { error: "タイトル・説明・区分・重大度を入力してください。" },
      { status: 400 }
    );
  }

  const assignee = Number.isInteger(assigneeMemberId)
    ? await prisma.member.findFirst({
        where: { id: assigneeMemberId, groupId: session.groupId },
        select: { id: true },
      })
    : null;

  const finding = await prisma.auditFinding.create({
    data: {
      groupId: session.groupId,
      title,
      description,
      category,
      severity,
      status,
      logIds,
      targetRefs,
      assigneeMemberId: assignee?.id ?? null,
      createdByMemberId: member.id,
    },
    include: {
      assignee: { select: { id: true, displayName: true } },
      createdBy: { select: { id: true, displayName: true } },
    },
  });

  await recordAuditLog({
    groupId: session.groupId,
    actorMemberId: member.id,
    actionType: AuditActionType.CREATE,
    targetType: AuditTargetType.AUDIT_FINDING,
    targetId: finding.id,
    afterJson: finding as unknown as Prisma.JsonValue,
  });

  return NextResponse.json(
    {
      finding: {
        ...finding,
        createdAt: finding.createdAt.toISOString(),
        updatedAt: finding.updatedAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
