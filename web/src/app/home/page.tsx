import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";
import { getFiscalYear } from "@/lib/fiscal-year";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import {
  MyTodayCard,
  type TodoPreview,
  type ApprovalPreview,
  type EventPreview,
} from "@/components/dashboard/my-today-card";
import {
  GroupNowCard,
  type GroupEventSummary,
  type AccountingStatusSummary,
  type AnnouncementPreview,
} from "@/components/dashboard/group-now-card";
import { AdminAlertsCard, type AdminAlertItem } from "@/components/dashboard/admin-alerts-card";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "管理者",
  ACCOUNTANT: "会計担当",
  AUDITOR: "監査役",
  MEMBER: "メンバー",
};

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getDueMeta(dueDate: Date | null, now: Date) {
  if (!dueDate) {
    return { label: "期限未設定", tone: "none" as const };
  }
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);
  const dayAfterTomorrowStart = new Date(todayStart);
  dayAfterTomorrowStart.setDate(todayStart.getDate() + 2);

  if (dueDate < todayStart) {
    return {
      label: `期限切れ ${dateFormatter.format(dueDate)}`,
      tone: "overdue" as const,
    };
  }
  if (dueDate < tomorrowStart) {
    return { label: "今日", tone: "today" as const };
  }
  if (dueDate < dayAfterTomorrowStart) {
    return { label: "明日", tone: "tomorrow" as const };
  }
  return { label: dateFormatter.format(dueDate), tone: "upcoming" as const };
}

function resolveTodoSourceLabel(todo: {
  sourceVotingId: number | null;
  sourceChatMessageId: number | null;
  sourceThreadId: number | null;
}) {
  if (todo.sourceVotingId) return "投票";
  if (todo.sourceChatMessageId || todo.sourceThreadId) return "Chat";
  return "ToDo";
}

function resolveAttendanceMeta(status?: "YES" | "NO" | "MAYBE" | null) {
  if (!status) {
    return { label: "未回答", tone: "unanswered" as const };
  }
  if (status === "YES") return { label: "参加", tone: "yes" as const };
  if (status === "NO") return { label: "不参加", tone: "no" as const };
  return { label: "未定", tone: "maybe" as const };
}

export default async function DashboardPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    include: { group: true },
  });
  if (!member || !member.group) {
    redirect("/join");
  }

  const now = new Date();
  const isAdmin = member.role === ROLE_ADMIN;
  const fiscalYear = getFiscalYear(now, member.group.fiscalYearStartMonth ?? 4);
  const staleSince = new Date(now);
  staleSince.setDate(now.getDate() - 7);

  const [
    todosRaw,
    approvalsCount,
    myEventsRaw,
    nextEventRaw,
    memberCount,
    accountingSetting,
    fiscalYearClose,
    announcementRaw,
    approvalRouteCount,
    approvalTemplateCount,
    staleApprovalCount,
  ] = await Promise.all([
    prisma.todoItem.findMany({
      where: {
        groupId: session.groupId,
        status: { not: "DONE" },
        OR: [
          { assignedMemberId: session.memberId },
          { createdByMemberId: session.memberId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        dueDate: true,
        createdAt: true,
        sourceVotingId: true,
        sourceChatMessageId: true,
        sourceThreadId: true,
      },
    }),
    prisma.approvalAssignment.count({
      where: {
        assignedToId: session.memberId,
        status: "IN_PROGRESS",
        application: { groupId: session.groupId },
      },
    }),
    prisma.event.findMany({
      where: {
        groupId: session.groupId,
        startsAt: { gte: now },
      },
      orderBy: { startsAt: "asc" },
      take: 4,
      include: {
        attendances: {
          where: { memberId: session.memberId },
          select: { status: true },
        },
      },
    }),
    prisma.event.findFirst({
      where: {
        groupId: session.groupId,
        startsAt: { gte: now },
      },
      orderBy: { startsAt: "asc" },
      include: {
        attendances: {
          select: { status: true },
        },
      },
    }),
    prisma.member.count({ where: { groupId: session.groupId } }),
    prisma.accountingSetting.findUnique({
      where: { groupId: session.groupId },
      select: { approvalFlow: true },
    }),
    prisma.fiscalYearClose.findUnique({
      where: {
        groupId_fiscalYear: {
          groupId: session.groupId,
          fiscalYear,
        },
      },
      select: { status: true },
    }),
    prisma.document.findFirst({
      where: { groupId: session.groupId, category: "OTHER" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
    }),
    isAdmin
      ? prisma.approvalRoute.count({ where: { groupId: session.groupId } })
      : Promise.resolve(0),
    isAdmin
      ? prisma.approvalTemplate.count({
          where: { groupId: session.groupId, isActive: true },
        })
      : Promise.resolve(0),
    isAdmin
      ? prisma.approvalAssignment.count({
          where: {
            status: "IN_PROGRESS",
            updatedAt: { lt: staleSince },
            application: { groupId: session.groupId },
          },
        })
      : Promise.resolve(0),
  ]);

  const todosSorted = [...todosRaw].sort((a, b) => {
    const aDue = a.dueDate ? a.dueDate.getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueDate ? b.dueDate.getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) {
      return aDue - bDue;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  const todoPreviews: TodoPreview[] = todosSorted.slice(0, 5).map((todo) => {
    const dueMeta = getDueMeta(todo.dueDate, now);
    return {
      id: todo.id,
      title: todo.title,
      dueLabel: dueMeta.label,
      dueTone: dueMeta.tone,
      sourceLabel: resolveTodoSourceLabel(todo),
      href: `/todo?focus=${todo.id}`,
    };
  });
  const todosHasMore = todosSorted.length > 5;

  const approvals: ApprovalPreview = {
    count: approvalsCount,
  };

  const myEventPreviews: EventPreview[] = myEventsRaw
    .slice(0, 3)
    .map((event) => {
      const attendanceStatus = event.attendances[0]?.status ?? null;
      const attendance = resolveAttendanceMeta(attendanceStatus);
      return {
        id: event.id,
        title: event.title,
        dateLabel: dateTimeFormatter.format(event.startsAt),
        attendanceLabel: attendance.label,
        attendanceTone: attendance.tone,
        href: `/events/${event.id}`,
      };
    });
  const eventsHasMore = myEventsRaw.length > 3;

  let nextEvent: GroupEventSummary | null = null;
  if (nextEventRaw) {
    const yesCount = nextEventRaw.attendances.filter(
      (attendance) => attendance.status === "YES"
    ).length;
    const respondedCount = nextEventRaw.attendances.length;
    const unansweredCount = Math.max(memberCount - respondedCount, 0);
    nextEvent = {
      id: nextEventRaw.id,
      title: nextEventRaw.title,
      dateLabel: dateTimeFormatter.format(nextEventRaw.startsAt),
      attendanceYes: yesCount,
      attendanceUnanswered: unansweredCount,
      attendanceTotal: memberCount,
      href: `/events/${nextEventRaw.id}`,
    };
  }

  const accountingStatus: AccountingStatusSummary = (() => {
    if (!accountingSetting) {
      return { label: "未設定", tone: "bad", icon: "🔴" };
    }
    if (fiscalYearClose?.status === "CONFIRMED") {
      return { label: "確定済", tone: "good", icon: "🟢" };
    }
    return {
      label: "下書きあり",
      tone: "warn",
      icon: "🟡",
      detail: `${fiscalYear}年度`,
    };
  })();

  const announcement: AnnouncementPreview | null = announcementRaw
    ? {
        id: announcementRaw.id,
        title: announcementRaw.title,
        updatedLabel: `${dateFormatter.format(
          announcementRaw.updatedAt
        )} 更新`,
        href: `/documents/${announcementRaw.id}`,
      }
    : null;

  const adminAlerts: AdminAlertItem[] = [];
  if (isAdmin) {
    if (!accountingSetting) {
      adminAlerts.push({
        id: "accounting-setting",
        title: "会計設定が未完了です",
        description: "会計年度と基本設定を確認してください。",
        href: "/accounting?section=accounting-settings",
      });
    } else if (!accountingSetting.approvalFlow) {
      adminAlerts.push({
        id: "accounting-approval",
        title: "会計の承認フローが未設定です",
        description: "承認フローを登録すると承認待ちが整理されます。",
        href: "/accounting?section=accounting-settings",
      });
    }
    if (approvalRouteCount === 0) {
      adminAlerts.push({
        id: "approval-route",
        title: "承認ルートが未設定です",
        description: "申請を回す前にルートを作成してください。",
        href: "/approval/routes",
      });
    }
    if (approvalTemplateCount === 0) {
      adminAlerts.push({
        id: "approval-template",
        title: "申請テンプレートが未設定です",
        description: "テンプレートを作成すると申請が回覧できます。",
        href: "/approval/templates",
      });
    }
    if (memberCount <= 1) {
      adminAlerts.push({
        id: "members",
        title: "メンバーがまだ招待されていません",
        description: "招待コードを発行してメンバーを追加してください。",
        href: "/management",
      });
    }
    if (staleApprovalCount > 0) {
      adminAlerts.push({
        id: "approval-stale",
        title: "承認が滞留しています",
        description: `${staleApprovalCount} 件が1週間以上止まっています。`,
        href: "/approval",
      });
    }
    if (nextEvent && memberCount > 0) {
      const unansweredRate = nextEvent.attendanceUnanswered / memberCount;
      if (unansweredRate >= 0.5) {
        adminAlerts.push({
          id: "event-unanswered",
          title: "イベントの未回答が多いです",
          description: `未回答が ${nextEvent.attendanceUnanswered} 件あります。`,
          href: "/events",
        });
      }
    }
  }

  const roleLabel = ROLE_LABELS[member.role] ?? member.role;

  return (
    <DashboardLayout
      groupName={member.group.name}
      memberName={member.displayName}
      memberRoleLabel={roleLabel}
      groupLogoUrl={member.group.logoUrl}
    >
      <div className="space-y-6 lg:grid lg:grid-cols-12 lg:gap-6 lg:space-y-0">
        <div className="lg:col-span-7 space-y-6">
          <MyTodayCard
            todos={todoPreviews}
            todosHasMore={todosHasMore}
            approvals={approvals}
            events={myEventPreviews}
            eventsHasMore={eventsHasMore}
          />
        </div>
        <div className="lg:col-span-5 space-y-6">
          <GroupNowCard
            nextEvent={nextEvent}
            accounting={accountingStatus}
            announcement={announcement}
          />
          {isAdmin && adminAlerts.length > 0 ? (
            <AdminAlertsCard alerts={adminAlerts} />
          ) : null}
        </div>
      </div>
    </DashboardLayout>
  );
}
