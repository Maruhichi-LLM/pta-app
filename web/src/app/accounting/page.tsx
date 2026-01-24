import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { LedgerList, type LedgerDisplay } from "@/components/ledger-list";
import { LedgerCreateForm } from "@/components/ledger-create-form";
import { ConfirmSubmitForm } from "@/components/confirm-submit-form";
import { ROLE_ADMIN } from "@/lib/roles";
import { ensureModuleEnabled } from "@/lib/modules";
import { KNOT_CALENDAR_PATH } from "@/lib/routes";
import { revalidatePath } from "next/cache";
import { AccountingLayout } from "@/components/accounting-layout";
import { BudgetInputField } from "@/components/budget-input-field";

export const dynamic = "force-dynamic";

const MONTH_VALUES = Array.from({ length: 12 }, (_, index) => index + 1);

function resolveFiscalYear(date: Date, startMonth: number) {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return month >= startMonth ? year : year - 1;
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: "資産",
  LIABILITY: "負債",
  INCOME: "収入",
  EXPENSE: "支出",
};

async function requireAdminSession() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
  });
  if (!member || member.role !== ROLE_ADMIN) {
    throw new Error("権限がありません。");
  }
  return { session, member };
}

async function saveAccountingSettingsAction(formData: FormData) {
  "use server";
  const { session } = await requireAdminSession();
  const startMonth = Number(formData.get("startMonth"));
  const endMonth = Number(formData.get("endMonth"));
  const approvalFlow =
    (formData.get("approvalFlow") as string | null)?.trim() || null;
  const carryover = Number(formData.get("carryoverAmount") ?? 0);

  if (
    !Number.isInteger(startMonth) ||
    !Number.isInteger(endMonth) ||
    !MONTH_VALUES.includes(startMonth) ||
    !MONTH_VALUES.includes(endMonth)
  ) {
    throw new Error("月は1〜12の範囲で設定してください。");
  }

  const carryoverAmount = Number.isFinite(carryover)
    ? Math.round(carryover)
    : 0;

  await prisma.$transaction([
    prisma.group.update({
      where: { id: session.groupId },
      data: { fiscalYearStartMonth: startMonth },
    }),
    prisma.accountingSetting.upsert({
      where: { groupId: session.groupId },
      update: {
        fiscalYearStartMonth: startMonth,
        fiscalYearEndMonth: endMonth,
        approvalFlow,
        carryoverAmount,
      },
      create: {
        groupId: session.groupId,
        fiscalYearStartMonth: startMonth,
        fiscalYearEndMonth: endMonth,
        approvalFlow,
        carryoverAmount,
      },
    }),
  ]);

  revalidatePath("/accounting");
  revalidatePath("/management");

  const displayYearRaw = Number(formData.get("displayFiscalYear"));
  const fallbackYearRaw = Number(formData.get("currentFiscalYear"));
  const targetDisplayYear = Number.isInteger(displayYearRaw)
    ? displayYearRaw
    : fallbackYearRaw;
  if (Number.isInteger(targetDisplayYear)) {
    redirect(
      `/accounting?section=accounting-settings&fiscalYear=${targetDisplayYear}`
    );
  }

  redirect("/accounting?section=accounting-settings");
}

async function toggleBudgetStatusAction(formData: FormData) {
  "use server";
  const { session } = await requireAdminSession();
  const nextState = String(formData.get("nextState") ?? "");
  const enable = nextState === "enable";

  const group = await prisma.group.findUnique({
    where: { id: session.groupId },
    select: { fiscalYearStartMonth: true },
  });
  const startMonth = group?.fiscalYearStartMonth ?? 4;
  const endMonth = ((startMonth + 10) % 12) + 1 || 12;

  await prisma.accountingSetting.upsert({
    where: { groupId: session.groupId },
    update: { budgetEnabled: enable },
    create: {
      groupId: session.groupId,
      fiscalYearStartMonth: startMonth,
      fiscalYearEndMonth: endMonth,
      approvalFlow: null,
      carryoverAmount: 0,
      budgetEnabled: enable,
    },
  });

  revalidatePath("/accounting");
  revalidatePath("/management");
}

async function saveBudgetPlanAction(formData: FormData) {
  "use server";
  const { session } = await requireAdminSession();
  const fiscalYear = Number(formData.get("fiscalYear"));
  if (!Number.isInteger(fiscalYear)) {
    throw new Error("年度を正しく指定してください。");
  }

  const entries: Array<{ accountId: number; amount: number }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("budget-")) continue;
    const accountId = Number(key.replace("budget-", ""));
    if (!Number.isInteger(accountId)) continue;
    const normalized = String(value ?? "").replace(/[,、]/g, "").trim();
    const amount = normalized ? Number(normalized) : 0;
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("予算は0以上の数値を入力してください。");
    }
    entries.push({ accountId, amount: Math.round(amount) });
  }

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      if (entry.amount > 0) {
        await tx.budget.upsert({
          where: {
            groupId_accountId_fiscalYear: {
              groupId: session.groupId,
              accountId: entry.accountId,
              fiscalYear,
            },
          },
          update: { amount: entry.amount },
          create: {
            groupId: session.groupId,
            accountId: entry.accountId,
            fiscalYear,
            amount: entry.amount,
          },
        });
      } else {
        await tx.budget.deleteMany({
          where: {
            groupId: session.groupId,
            accountId: entry.accountId,
            fiscalYear,
          },
        });
      }
    }
  });

  revalidatePath("/accounting");
  revalidatePath("/management");
}

async function createAccountAction(formData: FormData) {
  "use server";
  const { session } = await requireAdminSession();
  const name = (formData.get("name") as string | null)?.trim();
  const type = formData.get("type") as string | null;

  if (!name) {
    throw new Error("科目名を入力してください。");
  }

  if (!type || !(type in ACCOUNT_TYPE_LABELS)) {
    throw new Error("科目区分を選択してください。");
  }

  const order = (await prisma.account.count({
    where: { groupId: session.groupId },
  })) as number;

  await prisma.account.create({
    data: {
      groupId: session.groupId,
      name,
      type,
      isCustom: true,
      order,
    },
  });

  revalidatePath("/accounting");
  revalidatePath("/management");
}

async function fetchLedgerData(groupId: number, memberId: number) {
  const [group, ledgers, member, accountingSetting, accounts] =
    await Promise.all([
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.ledger.findMany({
        where: { groupId },
        include: {
          createdBy: true,
          approvals: {
            orderBy: { createdAt: "desc" },
            include: { actedBy: true },
          },
          account: {
            select: { id: true, name: true, type: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.member.findUnique({ where: { id: memberId } }),
      prisma.accountingSetting.findUnique({ where: { groupId } }),
      prisma.account.findMany({
        where: { groupId },
        orderBy: { order: "asc" },
      }),
    ]);
  const fiscalYearStart = group?.fiscalYearStartMonth ?? 4;
  const currentFiscalYear = resolveFiscalYear(new Date(), fiscalYearStart);
  const budgets = await prisma.budget.findMany({
    where: { groupId, fiscalYear: currentFiscalYear },
  });
  return {
    group,
    ledgers: ledgers.map((ledger) => ({
        ...ledger,
        createdAt: ledger.createdAt.toISOString(),
        transactionDate: ledger.transactionDate.toISOString(),
        sourceChatMessageId: ledger.sourceChatMessageId,
        sourceThreadId: ledger.sourceThreadId,
        approvals: ledger.approvals.map((approval) => ({
          ...approval,
          createdAt: approval.createdAt.toISOString(),
        })),
        account: ledger.account
          ? {
              id: ledger.account.id,
              name: ledger.account.name,
              type: ledger.account.type,
            }
          : null,
      })),
    member,
    accountingSetting,
    accounts,
    budgets,
    currentFiscalYear,
  };
}

type PageProps = {
  searchParams?: Record<string, string | string[]>;
};

export default async function LedgerPage({ searchParams }: PageProps) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  await ensureModuleEnabled(session.groupId, "accounting");

  const data = await fetchLedgerData(session.groupId, session.memberId);
  if (!data.group) {
    redirect("/join");
  }

  const defaultFiscalYear =
    data.currentFiscalYear ??
    resolveFiscalYear(new Date(), data.group.fiscalYearStartMonth ?? 4);
  const requestedFiscalYearRaw = (() => {
    const param = searchParams?.fiscalYear ?? searchParams?.year;
    return Array.isArray(param) ? param[0] : param;
  })();
  let targetFiscalYear = defaultFiscalYear;
  if (requestedFiscalYearRaw) {
    const parsed = Number(requestedFiscalYearRaw);
    if (
      Number.isInteger(parsed) &&
      parsed >= 2000 &&
      parsed <= new Date().getFullYear() + 10
    ) {
      targetFiscalYear = parsed;
    }
  }

  const budgetsForSelectedYear =
    targetFiscalYear === defaultFiscalYear
      ? data.budgets ?? []
      : await prisma.budget.findMany({
          where: { groupId: session.groupId, fiscalYear: targetFiscalYear },
        });

  const canManage = data.member?.role === ROLE_ADMIN;
  const setting = data.accountingSetting ?? {
    fiscalYearStartMonth: data.group.fiscalYearStartMonth,
    fiscalYearEndMonth:
      ((data.group.fiscalYearStartMonth + 10) % 12) + 1 || 12,
    approvalFlow: "",
    carryoverAmount: 0,
    budgetEnabled: true,
  };
  const allAccounts = data.accounts ?? [];
  const defaultAccounts = allAccounts.filter((account) => !account.isCustom);
  const customAccounts = allAccounts.filter((account) => account.isCustom);
  const expenseAccounts = allAccounts.filter(
    (account) => account.type === "EXPENSE"
  );
  const incomeBudgetAccountNames = [
    "会費収入",
    "事業収入",
    "補助金等収入",
    "寄附金収入",
    "雑収入",
    "受取利息",
    "受取配当金",
  ];
  const incomeBudgetAccounts = incomeBudgetAccountNames
    .map((name) => allAccounts.find((account) => account.name === name))
    .filter(
      (account): account is NonNullable<typeof account> => Boolean(account)
    );
  const budgetMap = new Map(
    budgetsForSelectedYear.map((budget) => [budget.accountId, budget.amount])
  );
  const fiscalYearLabel = `${targetFiscalYear}年度`;
  const fiscalYearOptionsBase = Array.from({ length: 11 }, (_, index) => {
    const offset = 5 - index;
    return defaultFiscalYear + offset;
  }).filter((year) => year >= 2000);
  const fiscalYearOptions = Array.from(
    new Set([...fiscalYearOptionsBase, targetFiscalYear])
  ).sort((a, b) => b - a);
  const accountOptions = allAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
  }));
  const ledgerCountLabel = `${data.ledgers.length}件`;
  const pendingLedgerCountLabel = `${
    data.ledgers.filter((ledger) => ledger.status === "PENDING").length
  }件`;
  const closingMonthLabel = `${setting.fiscalYearEndMonth}月`;
  const approvalFlowSummary = setting.approvalFlow?.trim() ?? "";
  const numberFormatter = new Intl.NumberFormat("ja-JP");
  const submissionDateLabel = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date());
  const applicantName = data.member?.displayName ?? "未設定";
  const carryoverAmountLabel = `${numberFormatter.format(
    setting.carryoverAmount ?? 0
  )}円`;
  const isBudgetEnabled = setting.budgetEnabled !== false;
  const budgetStatusLabel = isBudgetEnabled ? "有効" : "停止中";
  const overviewStats = [
    {
      label: "決算月",
      value: closingMonthLabel,
      description: "現在の期末設定",
    },
    {
      label: "承認待ち件数",
      value: pendingLedgerCountLabel,
      description: "手続き待ちの経費",
    },
    {
      label: "予算管理",
      value: budgetStatusLabel,
      description: "機能の稼働状況",
    },
    {
      label: "前期繰越",
      value: carryoverAmountLabel,
      description: "登録済みの繰越金額",
    },
  ];
  const pendingCount = data.ledgers.filter((ledger) => ledger.status === "PENDING").length;
  const hasPendingItems = pendingCount > 0;

  const navigationItems: Array<{
    id: string;
    label: string;
    description: string;
    highlight?: boolean;
  }> = [];

  navigationItems.push({
    id: "ledger-create",
    label: "申請の作成",
    description: "証憑を登録して承認を依頼",
  });
  navigationItems.push({
    id: "ledger-list",
    label: "経費一覧",
    description: hasPendingItems
      ? `承認待ち ${pendingCount}件 / 全 ${data.ledgers.length}件`
      : `${ledgerCountLabel}の履歴`,
    highlight: hasPendingItems,
  });

  if (canManage) {
    navigationItems.push({
      id: "accounting-settings",
      label: "会計年度と承認フロー",
      description: approvalFlowSummary
        ? `決算 ${closingMonthLabel} / 承認登録済み`
        : `決算 ${closingMonthLabel} / 承認未記入`,
    });
    navigationItems.push({
      id: "account-master",
      label: "勘定科目マスタ",
      description: `基本 ${defaultAccounts.length} ・ 自由 ${customAccounts.length}`,
    });
    navigationItems.push({
      id: "budget-settings",
      label: "予算の設定",
      description:
        setting.budgetEnabled === false
          ? "予算機能は現在 OFF"
          : "予算機能は現在 ON",
    });
  }

  const requestedSectionIdRaw = (() => {
    const sectionParam = searchParams?.section;
    return Array.isArray(sectionParam) ? sectionParam[0] : sectionParam;
  })();
  const availableSectionIds = new Set(navigationItems.map((item) => item.id));
  const defaultSectionId = availableSectionIds.has(requestedSectionIdRaw ?? "")
    ? (requestedSectionIdRaw as string)
    : navigationItems[0]?.id ?? "accounting-register";
  const renderAdminOnlyNotice = (key: string) => (
    <section
      key={key}
      className="rounded-2xl border border-dashed border-zinc-300 bg-white/80 p-4 text-sm text-zinc-700"
    >
      Knot Accounting の設定変更は管理者のみが利用できます。権限が必要な場合は団体の管理者に連絡してください。
    </section>
  );
  const renderLedgerCreateSection = (title: string, description: string) => {
    return (
      <section
        key="ledger-create-section"
        className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4"
      >
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <p className="mt-2 text-sm text-zinc-600">{description}</p>
        </div>
        <dl className="grid gap-4 rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              申請者
            </dt>
            <dd className="mt-1 text-base font-semibold text-zinc-900">
              {applicantName}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              申請日付
            </dt>
            <dd className="mt-1 text-base font-semibold text-zinc-900">
              {submissionDateLabel}
            </dd>
          </div>
        </dl>
        <LedgerCreateForm accounts={accountOptions} />
      </section>
    );
  };
  const sections: Array<{ id: string; content: ReactNode }> = [
    {
      id: "accounting-status",
      content: (
        <section
          key="accounting-status-section"
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-zinc-900">現在の状況</h2>
          <p className="mt-2 text-sm text-zinc-600">
            経費申請の進捗や決算状況、主要ショートカットをまとめて確認できます。
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                申請件数
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">
                {ledgerCountLabel}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                最新の経費申請を確認できます。
              </p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                勘定科目
              </p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">
                {defaultAccounts.length + customAccounts.length}件
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                基本 {defaultAccounts.length} ・ 自由 {customAccounts.length}
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-100 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                決算月
              </p>
              <p className="mt-1 text-base font-semibold text-zinc-900">
                {closingMonthLabel}
              </p>
              <p className="mt-1 text-xs text-zinc-500">現在の承認ステータス</p>
              <p className="text-sm font-semibold text-zinc-900">
                {approvalFlowSummary ? "フロー登録済み" : "未登録"}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                すぐに行う
              </p>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <a
                  href="/accounting?section=ledger-create"
                  className="inline-flex items-center justify-center rounded-full bg-sky-600 px-4 py-2 font-semibold text-white transition hover:bg-sky-700"
                >
                  会計を登録する
                </a>
                <a
                  href="/accounting?section=ledger-list"
                  className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 font-semibold text-zinc-700 transition hover:border-sky-500 hover:text-sky-600"
                >
                  経費一覧を見る
                </a>
              </div>
            </div>
          </div>
        </section>
      ),
    },
  ];

  sections.push({
    id: "ledger-list",
    content: (
      <section
        key="ledger-list-section"
        className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-zinc-900">経費一覧</h2>
        <div className="mt-4">
          <LedgerList
            ledgers={data.ledgers as LedgerDisplay[]}
            canApprove={data.member?.role === ROLE_ADMIN}
            accounts={accountOptions}
            groupId={session.groupId}
          />
        </div>
      </section>
    ),
  });
  sections.push({
    id: "ledger-create",
    content: renderLedgerCreateSection(
      "入出金の記録",
      "証憑やメモを入力して承認を依頼します。下書き保存は経費一覧から行えます。"
    ),
  });

  if (canManage) {
    sections.push({
      id: "accounting-settings",
      content: (
        <section
          key="accounting-settings-section"
          id="accounting-settings"
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-zinc-900">
            会計年度と承認フロー
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            会計期間、承認ステップ、前期繰越金、予算機能をまとめて設定します。
          </p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                対象年度
              </dt>
              <dd className="mt-2 text-2xl font-semibold text-zinc-900">
                {fiscalYearLabel}
              </dd>
              <p className="mt-1 text-xs text-zinc-500">
                現在の設定が適用される年度です。
              </p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                会計期間
              </dt>
              <dd className="mt-2 text-base font-semibold text-zinc-900">
                {setting.fiscalYearStartMonth}月〜{closingMonthLabel}
              </dd>
              <p className="mt-1 text-xs text-zinc-500">
                期首と期末は以下で変更できます。
              </p>
            </div>
          </dl>
          <ConfirmSubmitForm
            action={saveAccountingSettingsAction}
            className="mt-4 space-y-4"
            title="会計年度と承認フロー"
            message="この内容で保存しますか？"
          >
            <input type="hidden" name="currentFiscalYear" value={targetFiscalYear} />
            <label className="block text-sm text-zinc-600">
              表示する年度
              <select
                name="displayFiscalYear"
                defaultValue={targetFiscalYear}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {fiscalYearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}年度
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-4">
              <label className="block text-sm text-zinc-600">
                期首
                <select
                  name="startMonth"
                  defaultValue={setting.fiscalYearStartMonth}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {MONTH_VALUES.map((month) => (
                    <option key={month} value={month}>
                      {month}月
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-zinc-600">
                期末
                <select
                  name="endMonth"
                  defaultValue={setting.fiscalYearEndMonth}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {MONTH_VALUES.map((month) => (
                    <option key={month} value={month}>
                      {month}月
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-zinc-600">
                前期繰越金（円）
                <input
                  type="number"
                  name="carryoverAmount"
                  defaultValue={setting.carryoverAmount}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>
            </div>
            <label className="block text-sm text-zinc-600">
              承認フローのメモ
              <textarea
                name="approvalFlow"
                defaultValue={setting.approvalFlow ?? ""}
                rows={3}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                設定を保存
              </button>
            </div>
          </ConfirmSubmitForm>
        </section>
      ),
    });
    sections.push({
      id: "account-master",
      content: (
        <section
          key="account-master-section"
          id="account-master"
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-zinc-900">
            勘定科目マスタ
          </h2>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="text-sm text-zinc-500">基本科目</p>
              <ul className="mt-2 space-y-2">
                {defaultAccounts.map((account) => (
                  <li
                    key={account.id}
                    className="rounded-lg border border-zinc-200 p-3 text-sm"
                  >
                    <p className="font-semibold text-zinc-800">
                      {account.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm text-zinc-500">自由科目の追加</p>
              <form
                action={createAccountAction}
                className="mt-2 space-y-3 rounded-xl border border-dashed border-zinc-300 p-4"
              >
                <label className="block text-sm text-zinc-600">
                  科目名
                  <input
                    name="name"
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="例: イベント備品費"
                    required
                  />
                </label>
                <label className="block text-sm text-zinc-600">
                  区分
                  <select
                    name="type"
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    required
                    defaultValue="EXPENSE"
                  >
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </label>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                >
                  追加する
                </button>
              </form>
              {customAccounts.length > 0 ? (
                <div className="mt-4">
                  <p className="text-sm text-zinc-500">追加済み科目</p>
                  <ul className="mt-2 space-y-2">
                    {customAccounts.map((account) => (
                      <li
                        key={account.id}
                        className="rounded-lg border border-zinc-200 p-3 text-sm"
                      >
                        <p className="font-semibold text-zinc-800">
                          {account.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ),
    });
    sections.push({
      id: "budget-settings",
      content: (
        <section
          key="budget-settings-section"
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-zinc-900">予算の設定</h2>
          <p className="mt-2 text-sm text-zinc-600">
            予算機能の ON/OFF と運用ルールを確認します。会計年度の計画や配分方針をチームと共有してから変更してください。
          </p>
          <form
            action={toggleBudgetStatusAction}
            className="mt-4 max-w-sm"
          >
            <input
              type="hidden"
              name="nextState"
              value={isBudgetEnabled ? "disable" : "enable"}
            />
            <button
              type="submit"
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                isBudgetEnabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-zinc-200 bg-white text-zinc-600"
              } hover:border-sky-200 hover:bg-sky-50`}
            >
              <span>
                {isBudgetEnabled
                  ? "予算機能を停止する"
                  : "予算機能を有効にする"}
              </span>
              <span
                aria-hidden="true"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  isBudgetEnabled ? "bg-sky-600" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                    isBudgetEnabled ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </span>
            </button>
          </form>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                予算機能
              </dt>
              <dd className="mt-2 text-2xl font-semibold text-zinc-900">
                {budgetStatusLabel}
              </dd>
              <p className="mt-1 text-xs text-zinc-500">
                期中の予実管理を行うかどうか。
              </p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                期首 / 決算月
              </dt>
              <dd className="mt-2 text-2xl font-semibold text-zinc-900">
                {setting.fiscalYearStartMonth}月 / {closingMonthLabel}
              </dd>
              <p className="mt-1 text-xs text-zinc-500">
                年度を揃えると予算ロールオーバーが簡単になります。
              </p>
            </div>
          </dl>
          {isBudgetEnabled ? (
            <ConfirmSubmitForm
              action={saveBudgetPlanAction}
              className="mt-6 space-y-4"
              title="予算の設定"
              message="この内容で予算を保存しますか？"
            >
              <input
                type="hidden"
                name="fiscalYear"
                value={targetFiscalYear}
              />
              <div className="rounded-2xl border border-zinc-200">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-700">
                  <span>{targetFiscalYear}年度の科目別予算</span>
                  <span className="text-xs text-zinc-500">円単位で入力</span>
                </div>
                {incomeBudgetAccounts.length > 0 ||
                expenseAccounts.length > 0 ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {incomeBudgetAccounts.length > 0 ? (
                      <div className="rounded-xl border border-zinc-100">
                        <div className="bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-700">
                          収入の部
                        </div>
                        <div className="divide-y divide-zinc-100">
                          {incomeBudgetAccounts.map((account) => (
                            <div
                              key={account.id}
                              className="flex flex-col gap-1 px-4 py-3 text-sm text-zinc-600 lg:flex-row lg:items-center lg:gap-3"
                            >
                              <span className="flex-1 font-medium text-zinc-800">
                                {account.name}
                              </span>
                              <BudgetInputField
                                accountId={account.id}
                                defaultValue={budgetMap.get(account.id)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {expenseAccounts.length > 0 ? (
                      <div className="rounded-xl border border-zinc-100">
                        <div className="bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-700">
                          支出の部
                        </div>
                        <div className="divide-y divide-zinc-100">
                          {expenseAccounts.map((account) => (
                            <div
                              key={account.id}
                              className="flex flex-col gap-1 px-4 py-3 text-sm text-zinc-600 lg:flex-row lg:items-center lg:gap-3"
                            >
                              <span className="flex-1 font-medium text-zinc-800">
                                {account.name}
                              </span>
                              <BudgetInputField
                                accountId={account.id}
                                defaultValue={budgetMap.get(account.id)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="px-4 py-6 text-sm text-zinc-500">
                    予算設定可能な科目がありません。まずは勘定科目マスタで対象科目を作成してください。
                  </p>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-full bg-sky-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                >
                  予算を保存
                </button>
              </div>
            </ConfirmSubmitForm>
          ) : null}
          <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
            <p>
              具体的な配分や上限設定は「会計年度と承認フロー」セクションで変更できます。必要に応じて承認フローのメモ欄に予算のルールを残してください。
            </p>
          </div>
        </section>
      ),
    });
  } else {
    if (navigationItems.some((item) => item.id === "accounting-settings")) {
      sections.push({
        id: "accounting-settings",
        content: renderAdminOnlyNotice("accounting-settings-notice"),
      });
    }
    if (navigationItems.some((item) => item.id === "account-master")) {
      sections.push({
        id: "account-master",
        content: renderAdminOnlyNotice("account-master-notice"),
      });
    }
    if (navigationItems.some((item) => item.id === "budget-settings")) {
      sections.push({
        id: "budget-settings",
        content: renderAdminOnlyNotice("budget-settings-notice"),
      });
    }
  }

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell flex flex-col gap-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-zinc-500">
            Knot Accounting
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900">
            {data.group.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            承認と証憑の管理をここで行います。
          </p>
          <Link
            href={KNOT_CALENDAR_PATH}
            className="mt-4 inline-flex text-sm text-sky-600 underline"
          >
            ← Knot Calendar へ戻る
          </Link>
        </header>
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">現在の状況</h2>
          <p className="mt-1 text-sm text-zinc-600">
            モジュール全体のステータスを確認できます。
          </p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {overviewStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-zinc-100 bg-zinc-50 p-4"
              >
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  {stat.label}
                </dt>
                <dd className="mt-2 text-2xl font-semibold text-zinc-900">
                  {stat.value}
                </dd>
                <p className="mt-1 text-xs text-zinc-500">
                  {stat.description}
                </p>
              </div>
            ))}
          </dl>
        </section>
        <div className="grid gap-4 items-start lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:justify-items-start">
          <AccountingLayout
            navigationItems={navigationItems}
            sections={sections}
            defaultSectionId={defaultSectionId}
          />
        </div>
      </div>
    </div>
  );
}
