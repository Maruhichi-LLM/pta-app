import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { LedgerList, type LedgerDisplay } from "@/components/ledger-list";
import { LedgerCreateForm } from "@/components/ledger-create-form";
import { revalidatePath } from "next/cache";
import { ROLE_ADMIN } from "@/lib/roles";

const MONTH_VALUES = Array.from({ length: 12 }, (_, index) => index + 1);
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: "資産",
  LIABILITY: "負債",
  INCOME: "収入",
  EXPENSE: "支出",
};
const FINANCIAL_ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CASH: "現金",
  BANK: "口座",
};

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

async function fetchLedgerData(groupId: number, memberId: number) {
  const [group, ledgers, member, accountingSetting, accounts, financialAccounts] =
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
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.member.findUnique({ where: { id: memberId } }),
      prisma.accountingSetting.findUnique({ where: { groupId } }),
      prisma.account.findMany({
        where: { groupId },
        orderBy: { order: "asc" },
      }),
      prisma.financialAccount.findMany({
        where: { groupId },
        orderBy: { createdAt: "asc" },
      }),
    ]);
  return {
    group,
    ledgers: ledgers.map((ledger) => ({
      ...ledger,
      createdAt: ledger.createdAt.toISOString(),
      approvals: ledger.approvals.map((approval) => ({
        ...approval,
        createdAt: approval.createdAt.toISOString(),
      })),
    })),
    member,
    accountingSetting,
    accounts,
    financialAccounts,
  };
}

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

  revalidatePath("/ledger");
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
}

async function createFinancialAccountAction(formData: FormData) {
  "use server";
  const { session } = await requireAdminSession();
  const name = (formData.get("name") as string | null)?.trim();
  const type = formData.get("type") as string | null;
  const bankName = (formData.get("bankName") as string | null)?.trim() || null;
  const accountNumber =
    (formData.get("accountNumber") as string | null)?.trim() || null;
  const initialBalanceValue = Number(formData.get("initialBalance") ?? 0);

  if (!name) {
    throw new Error("口座名を入力してください。");
  }

  if (!type || !(type in FINANCIAL_ACCOUNT_TYPE_LABELS)) {
    throw new Error("区分を選択してください。");
  }

  const initialBalance = Number.isFinite(initialBalanceValue)
    ? Math.round(initialBalanceValue)
    : 0;

  await prisma.financialAccount.create({
    data: {
      groupId: session.groupId,
      name,
      type,
      bankName: type === "BANK" ? bankName : null,
      accountNumber: type === "BANK" ? accountNumber : null,
      initialBalance,
      currentBalance: initialBalance,
    },
  });

  revalidatePath("/ledger");
}

export default async function LedgerPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

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
  };

  const defaultAccounts = data.accounts.filter((account) => !account.isCustom);
  const customAccounts = data.accounts.filter((account) => account.isCustom);

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-zinc-500">会計</p>
          <h1 className="text-3xl font-semibold text-zinc-900">
            {data.group.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            承認と証憑の管理をここで行います。
          </p>
          <Link
            href="/home"
            className="mt-4 inline-flex text-sm text-sky-600 underline"
          >
            ← ホームへ戻る
          </Link>
        </header>

        {canManage ? (
          <>
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                会計年度と承認フロー
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                会計期間の開始・終了月、承認ステップ、前期繰越金を管理します。
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

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
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

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                現金・口座残高
              </h2>
              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <div>
                  <p className="text-sm text-zinc-500">登録済みの残高</p>
                  <ul className="mt-2 space-y-2">
                    {data.financialAccounts.length === 0 ? (
                      <li className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                        まだ口座が登録されていません。
                      </li>
                    ) : (
                      data.financialAccounts.map((account) => (
                        <li
                          key={account.id}
                          className="rounded-lg border border-zinc-200 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-zinc-800">
                                {account.name}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {FINANCIAL_ACCOUNT_TYPE_LABELS[account.type] ??
                                  account.type}
                              </p>
                              {account.bankName ? (
                                <p className="text-xs text-zinc-400">
                                  {account.bankName}
                                  {account.accountNumber
                                    ? ` / ${account.accountNumber}`
                                    : ""}
                                </p>
                              ) : null}
                            </div>
                            <div className="text-right text-sm font-semibold text-emerald-700">
                              {currencyFormatter.format(account.currentBalance)}
                            </div>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">初期残高を登録</p>
                  <form
                    action={createFinancialAccountAction}
                    className="mt-2 space-y-3 rounded-xl border border-dashed border-zinc-300 p-4"
                  >
                    <label className="block text-sm text-zinc-600">
                      名称
                      <input
                        name="name"
                        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        placeholder="例: 現金 / ゆうちょ銀行"
                        required
                      />
                    </label>
                    <label className="block text-sm text-zinc-600">
                      区分
                      <select
                        name="type"
                        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        defaultValue="CASH"
                        required
                      >
                        {Object.entries(FINANCIAL_ACCOUNT_TYPE_LABELS).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          )
                        )}
                      </select>
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm text-zinc-600">
                        銀行名（口座のみ）
                        <input
                          name="bankName"
                          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                      </label>
                      <label className="text-sm text-zinc-600">
                        口座番号（口座のみ）
                        <input
                          name="accountNumber"
                          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                      </label>
                    </div>
                    <label className="block text-sm text-zinc-600">
                      初期残高（円）
                      <input
                        type="number"
                        name="initialBalance"
                        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        defaultValue={0}
                      />
                    </label>
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                    >
                      登録する
                    </button>
                  </form>
                </div>
              </div>
            </section>
          </>
        ) : null}

        <LedgerCreateForm />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">会計一覧</h2>
          <div className="mt-4">
            <LedgerList
              ledgers={data.ledgers as LedgerDisplay[]}
              canApprove={true}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
