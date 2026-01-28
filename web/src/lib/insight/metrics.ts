import { prisma } from "@/lib/prisma";
import { getFiscalYear, resolveFiscalYearStartMonth } from "@/lib/fiscal-year";

export type InsightStatus = "good" | "warn" | "bad";

export type InsightMetric = {
  id: string;
  title: string;
  status: InsightStatus;
  hint: string;
  primaryValue: string;
  secondaryValue?: string;
  detail?: Record<string, string>;
};

export type InsightPeriodKey = "month" | "90days" | "fiscalYear";

export type InsightPeriod = {
  key: InsightPeriodKey;
  label: string;
  start: Date;
  end: Date;
  rangeLabel: string;
};

export const INSIGHT_PERIOD_OPTIONS: Array<{
  key: InsightPeriodKey;
  label: string;
}> = [
  { key: "month", label: "今月" },
  { key: "90days", label: "直近90日" },
  { key: "fiscalYear", label: "今年度" },
];

const percentFormatter = new Intl.NumberFormat("ja-JP", {
  style: "percent",
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat("ja-JP");
const oneDecimalFormatter = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 1,
});

const INSIGHT_THRESHOLDS = {
  eventParticipation: { good: 0.7, warn: 0.5, direction: "higher" as const },
  attendanceSpeedDays: { good: 1.5, warn: 3, direction: "lower" as const },
  chatTodoConversion: { good: 0.12, warn: 0.06, direction: "higher" as const },
  todoCompletion: { good: 0.7, warn: 0.5, direction: "higher" as const },
  approvalPendingDays: { good: 3, warn: 7, direction: "lower" as const },
  accountingDelayDays: { good: 2, warn: 6, direction: "lower" as const },
  documentRegistration: { good: 0.3, warn: 0.15, direction: "higher" as const },
};

function formatPercent(value: number) {
  return percentFormatter.format(value);
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatDecimal(value: number) {
  return oneDecimalFormatter.format(value);
}

function formatDays(value: number) {
  return `${formatDecimal(value)}日`;
}

function buildRangeLabel(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${formatter.format(start)}〜${formatter.format(end)}`;
}

function resolveStatus(
  value: number,
  thresholds: { good: number; warn: number; direction?: "higher" | "lower" }
): InsightStatus {
  if (thresholds.direction === "lower") {
    if (value <= thresholds.good) return "good";
    if (value <= thresholds.warn) return "warn";
    return "bad";
  }
  if (value >= thresholds.good) return "good";
  if (value >= thresholds.warn) return "warn";
  return "bad";
}

export function normalizeInsightPeriod(
  value?: string | null
): InsightPeriodKey {
  if (value === "90days" || value === "fiscalYear" || value === "month") {
    return value;
  }
  return "month";
}

export async function resolveInsightPeriod(
  groupId: number,
  key: InsightPeriodKey
): Promise<InsightPeriod> {
  const now = new Date();
  let start = new Date(now);
  let label = "今月";

  if (key === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    label = "今月";
  } else if (key === "90days") {
    start = new Date(now);
    start.setDate(now.getDate() - 89);
    start.setHours(0, 0, 0, 0);
    label = "直近90日";
  } else {
    const startMonth = await resolveFiscalYearStartMonth(groupId);
    const fiscalYear = getFiscalYear(now, startMonth);
    start = new Date(fiscalYear, startMonth - 1, 1);
    label = `${fiscalYear}年度`;
  }

  return {
    key,
    label,
    start,
    end: now,
    rangeLabel: buildRangeLabel(start, now),
  };
}

export async function getInsightMetrics(
  groupId: number,
  period: InsightPeriod
): Promise<InsightMetric[]> {
  const range = { gte: period.start, lte: period.end };

  const [
    eventParticipation,
    attendanceSpeed,
    chatTodoConversion,
    todoCompletion,
    approvalPending,
    accountingDelay,
    documentRegistration,
  ] = await Promise.all([
    buildEventParticipationMetric(groupId, range),
    buildAttendanceSpeedMetric(groupId, range),
    buildChatTodoConversionMetric(groupId, range),
    buildTodoCompletionMetric(groupId, range),
    buildApprovalPendingMetric(groupId, range),
    buildAccountingDelayMetric(groupId, range),
    buildDocumentRegistrationMetric(groupId, range),
  ]);

  return [
    eventParticipation,
    attendanceSpeed,
    chatTodoConversion,
    todoCompletion,
    approvalPending,
    accountingDelay,
    documentRegistration,
  ].filter((metric): metric is InsightMetric => metric !== null);
}

async function buildEventParticipationMetric(
  groupId: number,
  range: { gte: Date; lte: Date }
): Promise<InsightMetric> {
  const events = await prisma.event.findMany({
    where: { groupId, startsAt: range },
    select: { id: true },
  });

  if (events.length === 0) {
    return {
      id: "event-participation",
      title: "イベント参加率",
      status: "warn",
      hint: "対象となるイベントがまだ少ないため、傾向はこれから見えてきます。",
      primaryValue: "参加率 —",
      secondaryValue: "未定率 —",
      detail: { "対象イベント数": "0" },
    };
  }

  const eventIds = events.map((event) => event.id);
  const [totalCount, yesCount, maybeCount] = await Promise.all([
    prisma.attendance.count({ where: { eventId: { in: eventIds } } }),
    prisma.attendance.count({
      where: { eventId: { in: eventIds }, status: "YES" },
    }),
    prisma.attendance.count({
      where: { eventId: { in: eventIds }, status: "MAYBE" },
    }),
  ]);

  if (totalCount === 0) {
    return {
      id: "event-participation",
      title: "イベント参加率",
      status: "warn",
      hint: "出欠の回答がまだ集まっていません。",
      primaryValue: "参加率 —",
      secondaryValue: "未定率 —",
      detail: {
        "対象イベント数": formatNumber(events.length),
        "回答数": "0",
      },
    };
  }

  const yesRate = yesCount / totalCount;
  const maybeRate = maybeCount / totalCount;
  const status = resolveStatus(yesRate, INSIGHT_THRESHOLDS.eventParticipation);

  const hintMap: Record<InsightStatus, string> = {
    good: "参加の意思表示が安定しています。今の流れを保てそうです。",
    warn: "予定が読みづらいイベントが増えています。共有タイミングを揃えると良さそうです。",
    bad: "参加の意思表示がばらつき気味です。締切や周知の仕方を調整する余地があります。",
  };

  return {
    id: "event-participation",
    title: "イベント参加率",
    status,
    hint: hintMap[status],
    primaryValue: `参加率 ${formatPercent(yesRate)}`,
    secondaryValue: `未定率 ${formatPercent(maybeRate)}`,
    detail: {
      "対象イベント数": formatNumber(events.length),
      "YES回答": formatNumber(yesCount),
      "未定回答": formatNumber(maybeCount),
      "回答総数": formatNumber(totalCount),
    },
  };
}

async function buildAttendanceSpeedMetric(
  groupId: number,
  range: { gte: Date; lte: Date }
): Promise<InsightMetric> {
  const responses = await prisma.attendance.findMany({
    where: {
      event: {
        groupId,
        createdAt: range,
      },
    },
    select: {
      respondedAt: true,
      event: { select: { createdAt: true } },
    },
  });

  if (responses.length === 0) {
    return {
      id: "attendance-speed",
      title: "出欠回答スピード",
      status: "warn",
      hint: "回答がまだ集まっていないため、スピードはこれから見えてきます。",
      primaryValue: "平均回答 —",
      secondaryValue: "回答数 0件",
      detail: { "回答数": "0" },
    };
  }

  let totalHours = 0;
  responses.forEach((attendance) => {
    const diffMs =
      attendance.respondedAt.getTime() -
      attendance.event.createdAt.getTime();
    const diffHours = Math.max(diffMs / (1000 * 60 * 60), 0);
    totalHours += diffHours;
  });

  const avgHours = totalHours / responses.length;
  const avgDays = avgHours / 24;
  const status = resolveStatus(
    avgDays,
    INSIGHT_THRESHOLDS.attendanceSpeedDays
  );

  const hintMap: Record<InsightStatus, string> = {
    good: "連絡への反応がスムーズです。",
    warn: "回答までの間が少し長めです。案内の出し方を揃えると滑らかになります。",
    bad: "回答が遅れがちです。締切を早めに共有すると負担が減りそうです。",
  };

  return {
    id: "attendance-speed",
    title: "出欠回答スピード",
    status,
    hint: hintMap[status],
    primaryValue: `平均回答 ${formatDays(avgDays)}`,
    secondaryValue: `回答数 ${formatNumber(responses.length)}件`,
    detail: {
      "平均回答(日)": formatDecimal(avgDays),
      "回答数": formatNumber(responses.length),
    },
  };
}

async function buildChatTodoConversionMetric(
  groupId: number,
  range: { gte: Date; lte: Date }
): Promise<InsightMetric> {
  const [chatCount, todoFromChatCount] = await Promise.all([
    prisma.chatMessage.count({
      where: { groupId, createdAt: range },
    }),
    prisma.todoItem.count({
      where: {
        groupId,
        createdAt: range,
        sourceChatMessageId: { not: null },
      },
    }),
  ]);

  if (chatCount === 0) {
    return {
      id: "chat-todo-conversion",
      title: "Chat→ToDo 変換率",
      status: "warn",
      hint: "期間内の発言がまだ少ないため、傾向はこれから見えてきます。",
      primaryValue: "変換率 —",
      secondaryValue: "発言数 0件",
      detail: { "発言数": "0", "ToDo変換数": "0" },
    };
  }

  const conversionRate = todoFromChatCount / chatCount;
  const status = resolveStatus(
    conversionRate,
    INSIGHT_THRESHOLDS.chatTodoConversion
  );

  const hintMap: Record<InsightStatus, string> = {
    good: "会話が次の行動に繋がっています。",
    warn: "会話からタスク化する流れが少し弱めです。振り返り時に整理すると良さそうです。",
    bad: "会話がタスクに繋がりにくい状態です。決まった項目をToDo化するルールがあると助けになります。",
  };

  return {
    id: "chat-todo-conversion",
    title: "Chat→ToDo 変換率",
    status,
    hint: hintMap[status],
    primaryValue: `変換率 ${formatPercent(conversionRate)}`,
    secondaryValue: `変換 ${formatNumber(todoFromChatCount)}件 / 発言 ${formatNumber(
      chatCount
    )}件`,
    detail: {
      "発言数": formatNumber(chatCount),
      "ToDo変換数": formatNumber(todoFromChatCount),
    },
  };
}

async function buildTodoCompletionMetric(
  groupId: number,
  range: { gte: Date; lte: Date }
): Promise<InsightMetric> {
  const [todoCreatedCount, todoDoneCount, doneItems] = await Promise.all([
    prisma.todoItem.count({ where: { groupId, createdAt: range } }),
    prisma.todoItem.count({
      where: { groupId, createdAt: range, status: "DONE" },
    }),
    prisma.todoItem.findMany({
      where: { groupId, createdAt: range, status: "DONE" },
      select: { createdAt: true, updatedAt: true },
    }),
  ]);

  if (todoCreatedCount === 0) {
    return {
      id: "todo-completion",
      title: "ToDo完了率",
      status: "warn",
      hint: "期間内のToDoがまだ少ないため、傾向はこれから見えてきます。",
      primaryValue: "完了率 —",
      secondaryValue: "作成数 0件",
      detail: { "作成数": "0", "完了数": "0" },
    };
  }

  let avgCompletionDays = 0;
  if (doneItems.length > 0) {
    const totalDays = doneItems.reduce((sum, item) => {
      const diffMs = item.updatedAt.getTime() - item.createdAt.getTime();
      return sum + Math.max(diffMs / (1000 * 60 * 60 * 24), 0);
    }, 0);
    avgCompletionDays = totalDays / doneItems.length;
  }

  const completionRate = todoDoneCount / todoCreatedCount;
  const status = resolveStatus(
    completionRate,
    INSIGHT_THRESHOLDS.todoCompletion
  );

  const hintMap: Record<InsightStatus, string> = {
    good: "ToDoの着地が安定しています。",
    warn: "完了まで少し時間がかかっています。期限の共有方法を揃えると整いそうです。",
    bad: "完了の滞留が起きやすいようです。担当と期限のセットが明確だと進めやすくなります。",
  };

  return {
    id: "todo-completion",
    title: "ToDo完了率",
    status,
    hint: hintMap[status],
    primaryValue: `完了率 ${formatPercent(completionRate)}`,
    secondaryValue:
      doneItems.length > 0
        ? `平均完了 ${formatDays(avgCompletionDays)}`
        : "平均完了 —",
    detail: {
      "作成数": formatNumber(todoCreatedCount),
      "完了数": formatNumber(todoDoneCount),
      "平均完了(日)":
        doneItems.length > 0 ? formatDecimal(avgCompletionDays) : "—",
    },
  };
}

async function buildApprovalPendingMetric(
  groupId: number,
  range: { gte: Date; lte: Date }
): Promise<InsightMetric> {
  const pendingLedgers = await prisma.ledger.findMany({
    where: { groupId, status: "PENDING", createdAt: range },
    select: { createdAt: true },
  });

  if (pendingLedgers.length === 0) {
    return {
      id: "approval-pending",
      title: "承認待ち滞留",
      status: "good",
      hint: "承認待ちは今のところ見当たりません。",
      primaryValue: "承認待ち 0件",
      secondaryValue: "平均滞留 —",
      detail: { "承認待ち件数": "0" },
    };
  }

  const now = new Date();
  const totalDays = pendingLedgers.reduce((sum, ledger) => {
    const diffMs = now.getTime() - ledger.createdAt.getTime();
    return sum + Math.max(diffMs / (1000 * 60 * 60 * 24), 0);
  }, 0);
  const avgDays = totalDays / pendingLedgers.length;
  const status = resolveStatus(
    avgDays,
    INSIGHT_THRESHOLDS.approvalPendingDays
  );

  const hintMap: Record<InsightStatus, string> = {
    good: "承認の流れがスムーズです。",
    warn: "承認までの間が少し長めです。担当の確認タイミングを揃えると安心です。",
    bad: "承認待ちが溜まりやすいようです。一次承認を先に進める運用があると軽くなります。",
  };

  return {
    id: "approval-pending",
    title: "承認待ち滞留",
    status,
    hint: hintMap[status],
    primaryValue: `平均滞留 ${formatDays(avgDays)}`,
    secondaryValue: `承認待ち ${formatNumber(pendingLedgers.length)}件`,
    detail: {
      "承認待ち件数": formatNumber(pendingLedgers.length),
      "平均滞留(日)": formatDecimal(avgDays),
    },
  };
}

async function buildAccountingDelayMetric(
  groupId: number,
  range: { gte: Date; lte: Date }
): Promise<InsightMetric> {
  const ledgers = await prisma.ledger.findMany({
    where: { groupId, createdAt: range },
    select: { createdAt: true, transactionDate: true },
  });

  if (ledgers.length === 0) {
    return {
      id: "accounting-delay",
      title: "会計入力遅延",
      status: "warn",
      hint: "期間内の会計入力がまだ少ないため、傾向はこれから見えてきます。",
      primaryValue: "平均遅延 —",
      secondaryValue: "入力数 0件",
      detail: { "入力数": "0" },
    };
  }

  const totalDays = ledgers.reduce((sum, ledger) => {
    const diffMs = ledger.createdAt.getTime() - ledger.transactionDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return sum + Math.max(diffDays, 0);
  }, 0);
  const avgDays = totalDays / ledgers.length;
  const status = resolveStatus(
    avgDays,
    INSIGHT_THRESHOLDS.accountingDelayDays
  );

  const hintMap: Record<InsightStatus, string> = {
    good: "会計入力のタイミングが揃っています。",
    warn: "入力まで少し間が空きがちです。週次でまとめる運用があると安心です。",
    bad: "入力が後回しになりやすいようです。入力日を決めておくと楽になります。",
  };

  return {
    id: "accounting-delay",
    title: "会計入力遅延",
    status,
    hint: hintMap[status],
    primaryValue: `平均遅延 ${formatDays(avgDays)}`,
    secondaryValue: `入力数 ${formatNumber(ledgers.length)}件`,
    detail: {
      "入力数": formatNumber(ledgers.length),
      "平均遅延(日)": formatDecimal(avgDays),
    },
  };
}

async function buildDocumentRegistrationMetric(
  groupId: number,
  range: { gte: Date; lte: Date }
): Promise<InsightMetric> {
  const [documentCount, eventCount, ledgerCount] = await Promise.all([
    prisma.document.count({ where: { groupId, createdAt: range } }),
    prisma.event.count({ where: { groupId, createdAt: range } }),
    prisma.ledger.count({ where: { groupId, createdAt: range } }),
  ]);

  const denominator = eventCount + ledgerCount;

  if (denominator === 0) {
    return {
      id: "document-registration",
      title: "Document登録率",
      status: "warn",
      hint: "対象となるイベント・会計が少ないため、傾向はこれから見えてきます。",
      primaryValue: "登録率 —",
      secondaryValue: "母数 0件",
      detail: {
        "Document数": formatNumber(documentCount),
        "母数(イベント+会計)": "0",
      },
    };
  }

  const registrationRate = documentCount / denominator;
  const status = resolveStatus(
    registrationRate,
    INSIGHT_THRESHOLDS.documentRegistration
  );

  const hintMap: Record<InsightStatus, string> = {
    good: "記録がDocumentにきちんと集約されています。",
    warn: "Documentへの集約が少し控えめです。共有したい情報を決めると進めやすくなります。",
    bad: "Documentへの集約が少なめです。残したい情報を決めておくと取りこぼしが減ります。",
  };

  return {
    id: "document-registration",
    title: "Document登録率",
    status,
    hint: hintMap[status],
    primaryValue: `登録率 ${formatPercent(registrationRate)}`,
    secondaryValue: `Document ${formatNumber(
      documentCount
    )}件 / 母数 ${formatNumber(denominator)}件`,
    detail: {
      "Document数": formatNumber(documentCount),
      "イベント数": formatNumber(eventCount),
      "会計入力数": formatNumber(ledgerCount),
      "母数(イベント+会計)": formatNumber(denominator),
    },
  };
}
