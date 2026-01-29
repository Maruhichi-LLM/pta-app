import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuditViewer } from "@/lib/audit/access";
import AuditClient from "./audit-client";
import {
  AuditFindingCategory,
  AuditFindingSeverity,
  AuditFindingStatus,
  AuditTargetType,
} from "@prisma/client";

export const dynamic = "force-dynamic";

function serializeLogs(logs: Awaited<ReturnType<typeof fetchInitialLogs>>) {
  return logs.map((log) => ({
    id: log.id,
    actorName: log.actor?.displayName ?? null,
    actionType: log.actionType,
    targetType: log.targetType,
    targetId: log.targetId,
    beforeJson: log.beforeJson,
    afterJson: log.afterJson,
    sourceThreadId: log.sourceThreadId,
    sourceChatMessageId: log.sourceChatMessageId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt.toISOString(),
  }));
}

function serializeFindings(
  findings: Awaited<ReturnType<typeof fetchInitialFindings>>
) {
  return findings.map((finding) => ({
    id: finding.id,
    title: finding.title,
    description: finding.description,
    category: finding.category,
    severity: finding.severity,
    status: finding.status,
    logIds: finding.logIds,
    targetRefs: finding.targetRefs,
    assigneeName: finding.assignee?.displayName ?? null,
    createdByName: finding.createdBy.displayName,
    createdAt: finding.createdAt.toISOString(),
    updatedAt: finding.updatedAt.toISOString(),
  }));
}

async function fetchMemberOptions(groupId: number) {
  return prisma.member.findMany({
    where: { groupId },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
}

async function fetchInitialLogs(groupId: number) {
  return prisma.auditLog.findMany({
    where: { groupId },
    include: {
      actor: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
}

async function fetchInitialFindings(groupId: number) {
  return prisma.auditFinding.findMany({
    where: { groupId },
    include: {
      assignee: { select: { id: true, displayName: true } },
      createdBy: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
}

async function fetchRules(groupId: number) {
  return prisma.internalControlRule.findMany({
    where: { groupId },
    orderBy: { createdAt: "asc" },
  });
}

async function fetchStats(groupId: number) {
  const recentWindow = new Date();
  recentWindow.setDate(recentWindow.getDate() - 30);

  const [activeRules, openFindings, recentLogs] = await Promise.all([
    prisma.internalControlRule.count({
      where: { groupId, isActive: true },
    }),
    prisma.auditFinding.count({
      where: {
        groupId,
        status: { in: [AuditFindingStatus.OPEN, AuditFindingStatus.IN_PROGRESS] },
      },
    }),
    prisma.auditLog.count({
      where: { groupId, createdAt: { gte: recentWindow } },
    }),
  ]);

  return { activeRules, openFindings, recentLogs };
}

export default async function AuditPage() {
  const { session, member } = await requireAuditViewer();
  if (!member) {
    redirect("/join");
  }

  const [group, memberOptions, logs, findings, rules, stats] = await Promise.all([
    prisma.group.findUnique({
      where: { id: session.groupId },
      select: { name: true, logoUrl: true },
    }),
    fetchMemberOptions(session.groupId),
    fetchInitialLogs(session.groupId),
    fetchInitialFindings(session.groupId),
    fetchRules(session.groupId),
    fetchStats(session.groupId),
  ]);
  if (!group) {
    redirect("/join");
  }

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell space-y-8">
        <AuditClient
          members={memberOptions}
          stats={stats}
          initialLogs={serializeLogs(logs)}
          initialFindings={serializeFindings(findings)}
          rules={rules.map((rule) => ({
            id: rule.id,
            name: rule.name,
            description: rule.description,
            severity: rule.severity,
            ruleType: rule.ruleType,
            isActive: rule.isActive,
          }))}
          groupName={group.name}
          groupLogoUrl={group.logoUrl}
          enumOptions={{
            targetTypes: Object.values(AuditTargetType),
            statuses: Object.values(AuditFindingStatus),
            severities: Object.values(AuditFindingSeverity),
            categories: Object.values(AuditFindingCategory),
          }}
        />
      </div>
    </div>
  );
}
