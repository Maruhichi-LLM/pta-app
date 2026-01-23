import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { LedgerList, type LedgerDisplay } from "@/components/ledger-list";
import { LedgerCreateForm } from "@/components/ledger-create-form";
import { ROLE_ADMIN } from "@/lib/roles";
import { ensureModuleEnabled } from "@/lib/modules";
import { KNOT_CALENDAR_PATH } from "@/lib/routes";
import { revalidatePath } from "next/cache";

const MONTH_VALUES = Array.from({ length: 12 }, (_, index) => index + 1);

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
  const budgetEnabledInput =
    (formData.get("budgetEnabled") as string | null) ?? "yes";
  const budgetEnabled = budgetEnabledInput === "yes";
  const accountingEnabledInput =
    (formData.get("accountingEnabled") as string | null) ?? "yes";
  const accountingEnabled = accountingEnabledInput === "yes";

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
        budgetEnabled,
        accountingEnabled,
      },
      create: {
        groupId: session.groupId,
        fiscalYearStartMonth: startMonth,
        fiscalYearEndMonth: endMonth,
        approvalFlow,
        carryoverAmount,
        budgetEnabled,
        accountingEnabled,
      },
    }),
  ]);

  revalidatePath("/ledger");
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

  revalidatePath("/ledger");
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
  return {
    group,
      ledgers: ledgers.map((ledger) => ({
        ...ledger,
        createdAt: ledger.createdAt.toISOString(),
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
  };
}

export default async function LedgerPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  await ensureModuleEnabled(session.groupId, "accounting");

  const data = await fetchLedgerData(session.groupId, session.memberId);
  if (!data.group) {
    redirect("/join");
  }

  const canManage = data.member?.role === ROLE_ADMIN;
  const setting = data.accountingSetting ?? {
    fiscalYearStartMonth: data.group.fiscalYearStartMonth,
    fiscalYearEndMonth:
      ((data.group.fiscalYearStartMonth + 10) % 12) + 1 || 12,
    approvalFlow: "",
    carryoverAmount: 0,
    budgetEnabled: true,
    accountingEnabled: true,
  };

  const isAccountingEnabled = setting.accountingEnabled !== false;
  const allAccounts = data.accounts ?? [];
  const defaultAccounts = allAccounts.filter((account) => !account.isCustom);
  const customAccounts = allAccounts.filter((account) => account.isCustom);
  const accountOptions = allAccounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
  }));
  const ledgerCountLabel = `${data.ledgers.length}件`;
  const fiscalPeriodLabel = `${setting.fiscalYearStartMonth}月〜${setting.fiscalYearEndMonth}月`;
  const approvalFlowSummary = setting.approvalFlow?.trim() ?? "";
  const approvalFlowPreview = approvalFlowSummary
    ? approvalFlowSummary.replace(/\s+/g, " ").slice(0, 40)
    : "";
  const numberFormatter = new Intl.NumberFormat("ja-JP");
  const carryoverAmountLabel = `${numberFormatter.format(
    setting.carryoverAmount ?? 0
  )}円`;
  const accountingStatusLabel = isAccountingEnabled ? "有効" : "停止中";
  const budgetStatusLabel = setting.budgetEnabled === false ? "停止中" : "有効";
  const detailNavigation: Array<{
    id: string;
    label: string;
    description: string;
  }> = [];

  if (canManage) {
    detailNavigation.push({
      id: "accounting-settings",
      label: "会計年度と承認フロー",
      description: approvalFlowSummary
        ? `${fiscalPeriodLabel} / 承認: ${
            approvalFlowSummary.length > 40
              ? `${approvalFlowPreview}...`
              : approvalFlowPreview
          }`
        : `${fiscalPeriodLabel} / 承認フロー未記入`,
    });
    detailNavigation.push({
      id: "account-master",
      label: "勘定科目マスタ",
      description: `基本 ${defaultAccounts.length} ・ 自由 ${customAccounts.length}`,
    });
  }

  if (isAccountingEnabled) {
    detailNavigation.push({
      id: "ledger-create",
      label: "申請の作成",
      description: "証憑を登録して承認を依頼",
    });
    detailNavigation.push({
      id: "ledger-list",
      label: "会計一覧",
      description: `${ledgerCountLabel}の履歴`,
    });
  } else {
    detailNavigation.push({
      id: "ledger-disabled",
      label: "会計機能",
      description: "管理者が有効化すると利用を開始できます",
    });
  }

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell grid gap-8 lg:grid-cols-[320px,1fr]">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:col-span-2">
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

        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              設定と一覧
            </p>
            <ul className="mt-4 space-y-3">
              {detailNavigation.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="block rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 transition hover:border-sky-500 hover:bg-white"
                  >
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {item.description}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-900">
              現在の会計設定
            </h2>
            <dl className="mt-4 space-y-3 text-sm text-zinc-600">
              <div className="flex items-center justify-between">
                <dt className="text-zinc-500">会計期間</dt>
                <dd className="font-semibold text-zinc-900">
                  {fiscalPeriodLabel}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-zinc-500">会計機能</dt>
                <dd className="font-semibold text-zinc-900">
                  {accountingStatusLabel}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-zinc-500">予算管理</dt>
                <dd className="font-semibold text-zinc-900">
                  {budgetStatusLabel}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-zinc-500">前期繰越</dt>
                <dd className="font-semibold text-zinc-900">
                  {carryoverAmountLabel}
                </dd>
              </div>
            </dl>
          </section>
        </div>
        <div className="flex flex-col gap-8">
          {canManage ? (
            <>
              <section
                id="accounting-settings"
                className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-zinc-900">
                  会計年度と承認フロー
                </h2>
                <p className="mt-2 text-sm text-zinc-600">
                  会計期間、承認ステップ、前期繰越金、予算機能をまとめて設定します。
                </p>
                <form
                  action={saveAccountingSettingsAction}
                  className="mt-4 space-y-4"
                >
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="text-sm text-zinc-600">
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
                    <label className="text-sm text-zinc-600">
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
                    <label className="text-sm text-zinc-600">
                      前期繰越金（円）
                      <input
                        type="number"
                        name="carryoverAmount"
                        defaultValue={setting.carryoverAmount}
                        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </label>
                  </div>
                  <div className="text-sm text-zinc-600">
                    <p>会計機能を利用しますか？</p>
                    <div className="mt-2 flex gap-4">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="accountingEnabled"
                          value="yes"
                          defaultChecked={isAccountingEnabled}
                        />
                        <span>はい（会計機能を使う）</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="accountingEnabled"
                          value="no"
                          defaultChecked={!isAccountingEnabled}
                        />
                        <span>いいえ（会計機能を使わない）</span>
                      </label>
                    </div>
                  </div>
                  <div className="text-sm text-zinc-600">
                    <p>予算管理を利用しますか？</p>
                    <div className="mt-2 flex gap-4">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="budgetEnabled"
                          value="yes"
                          defaultChecked={setting.budgetEnabled !== false}
                        />
                        <span>はい（予算機能を使う）</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="budgetEnabled"
                          value="no"
                          defaultChecked={setting.budgetEnabled === false}
                        />
                        <span>いいえ（予算機能を使わない）</span>
                      </label>
                    </div>
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
                </form>
              </section>
              <section
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
                                {ACCOUNT_TYPE_LABELS[account.type] ??
                                  account.type}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            </>
          ) : (
            <section className="rounded-2xl border border-dashed border-zinc-300 bg-white/80 p-4 text-sm text-zinc-700">
              Knot Accounting の設定変更は管理者のみが利用できます。権限が必要な場合は団体の管理者に連絡してください。
            </section>
          )}
          {isAccountingEnabled ? (
            <>
              <section
                id="ledger-create"
                className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
              >
                <LedgerCreateForm accounts={accountOptions} />
              </section>
              <section
                id="ledger-list"
                className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-zinc-900">
                  会計一覧
                </h2>
                <div className="mt-4">
                  <LedgerList
                    ledgers={data.ledgers as LedgerDisplay[]}
                    canApprove={data.member?.role === ROLE_ADMIN}
                    accounts={accountOptions}
                    groupId={session.groupId}
                  />
                </div>
              </section>
            </>
          ) : (
            <section
              id="ledger-disabled"
              className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-6 text-sm text-zinc-600"
            >
              この団体では現在会計機能を利用していません。管理者が{" "}
              <Link href="/management" className="font-semibold text-sky-700">
                Knot Management
              </Link>
              で会計機能を有効化すると、申請や承認、残高管理を開始できます。
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
