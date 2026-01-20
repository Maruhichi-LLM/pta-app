import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { ROLE_ADMIN, ROLE_ACCOUNTANT, ROLE_MEMBER } from "@/lib/roles";
import { ensureModuleEnabled } from "@/lib/modules";

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

const ROLE_OPTIONS = [ROLE_ADMIN, ROLE_ACCOUNTANT, ROLE_MEMBER] as const;

function generateInviteCodeValue() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function fetchManagementData(groupId: number, memberId: number) {
  const [
    group,
    member,
    accountingSetting,
    accounts,
    financialAccounts,
    budgets,
    members,
    inviteCodes,
  ] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId } }),
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
    prisma.budget.findMany({
      where: { groupId },
      include: { account: true },
      orderBy: [{ fiscalYear: "desc" }, { accountId: "asc" }],
    }),
    prisma.member.findMany({
      where: { groupId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.inviteCode.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    group,
    member,
    accountingSetting,
    accounts,
    financialAccounts,
    budgets,
    members,
    inviteCodes,
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
  revalidatePath("/management");
}

async function createBudgetAction(formData: FormData) {
  "use server";
  const { session } = await requireAdminSession();
  const accountId = Number(formData.get("accountId"));
  const fiscalYear = Number(formData.get("fiscalYear"));
  const amountValue = Number(formData.get("amount"));

  if (!Number.isInteger(accountId)) {
    throw new Error("科目を選択してください。");
  }
  if (!Number.isInteger(fiscalYear)) {
    throw new Error("年度を入力してください。");
  }

  const account = await prisma.account.findFirst({
    where: { id: accountId, groupId: session.groupId },
  });
  if (!account) {
    throw new Error("科目が見つかりません。");
  }

  const amount = Number.isFinite(amountValue) ? Math.round(amountValue) : 0;

  await prisma.budget.upsert({
    where: {
      groupId_accountId_fiscalYear: {
        groupId: session.groupId,
        accountId,
        fiscalYear,
      },
    },
    update: { amount },
    create: {
      groupId: session.groupId,
      accountId,
      fiscalYear,
      amount,
    },
  });

  revalidatePath("/ledger");
  revalidatePath("/management");
}

async function createInviteCodeAction(formData: FormData) {
  "use server";
  const { session } = await requireAdminSession();
  const roleInput = (formData.get("role") as string | null) ?? ROLE_MEMBER;
  const role =
    ROLE_OPTIONS.find((candidate) => candidate === roleInput) ?? null;
  const expiresInDays = Number(formData.get("expiresInDays") ?? 0);

  if (!role) {
    throw new Error("不正な権限です。");
  }

  const expiresAt =
    Number.isFinite(expiresInDays) && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  await prisma.$transaction(async (tx) => {
    let codeValue = "";
    do {
      codeValue = generateInviteCodeValue();
    } while (
      await tx.inviteCode.findUnique({
        where: { code: codeValue },
      })
    );

    await tx.inviteCode.create({
      data: {
        groupId: session.groupId,
        code: codeValue,
        role,
        expiresAt,
      },
    });
  });

  revalidatePath("/management");
}

async function updateMemberRoleAction(formData: FormData) {
  "use server";
  const { session } = await requireAdminSession();
  const memberId = Number(formData.get("memberId"));
  const roleInput = (formData.get("role") as string | null) ?? ROLE_MEMBER;
  const role =
    ROLE_OPTIONS.find((candidate) => candidate === roleInput) ?? null;

  if (!Number.isInteger(memberId)) {
    throw new Error("メンバーを選択してください。");
  }
  if (!role) {
    throw new Error("不正な権限です。");
  }

  const member = await prisma.member.findFirst({
    where: { id: memberId, groupId: session.groupId },
  });
  if (!member) {
    throw new Error("メンバーが見つかりません。");
  }

  if (member.role === ROLE_ADMIN && role !== ROLE_ADMIN) {
    const remainingAdmins = await prisma.member.count({
      where: {
        groupId: session.groupId,
        role: ROLE_ADMIN,
        NOT: { id: memberId },
      },
    });
    if (remainingAdmins === 0) {
      throw new Error("少なくとも1人の管理者が必要です。");
    }
  }

  await prisma.member.update({
    where: { id: member.id },
    data: { role },
  });

  revalidatePath("/management");
}

export default async function ManagementPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  await ensureModuleEnabled(session.groupId, "management");

  const data = await fetchManagementData(session.groupId, session.memberId);
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

  const defaultAccounts = data.accounts.filter((account) => !account.isCustom);
  const customAccounts = data.accounts.filter((account) => account.isCustom);
  const budgets = data.budgets;
  const membersList = data.members ?? [];
  const inviteCodes = data.inviteCodes ?? [];
  const isAccountingEnabled = setting.accountingEnabled !== false;
  const showBudgetSection = setting.budgetEnabled !== false;
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, idx) => currentYear - 1 + idx);
  const formatDateTime = (value?: Date | string | null) => {
    if (!value) {
      return "—";
    }
    const date =
      value instanceof Date ? value : value ? new Date(value) : undefined;
    return date
      ? date.toLocaleString("ja-JP", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "—";
  };

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-zinc-500">
            Knot Management
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900">
            {data.group.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            招待や会計設定、モジュールのON/OFFをまとめて管理します。
          </p>
        </header>

        {canManage ? (
          <>
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                メンバー招待
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                発行したコードを共有すると、新しいメンバーが参加できます。
              </p>
              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <form
                  action={createInviteCodeAction}
                  className="space-y-4 rounded-xl border border-dashed border-zinc-300 p-4"
                >
                  <label className="block text-sm text-zinc-600">
                    付与する権限
                    <select
                      name="role"
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      defaultValue={ROLE_MEMBER}
                    >
                      {ROLE_OPTIONS.map((roleValue) => (
                        <option key={roleValue} value={roleValue}>
                          {roleValue}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-zinc-600">
                    有効期限（日）
                    <input
                      type="number"
                      name="expiresInDays"
                      min={0}
                      defaultValue={14}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <span className="mt-1 block text-xs text-zinc-500">
                      0 を入力すると期限なしになります。
                    </span>
                  </label>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                  >
                    招待コードを発行
                  </button>
                </form>
                <div>
                  <p className="text-sm text-zinc-500">発行済みコード</p>
                  {inviteCodes.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                      まだ招待コードがありません。
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-zinc-50">
                      {inviteCodes.map((invite) => (
                        <li key={invite.id} className="p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-mono text-base font-semibold text-zinc-900">
                              {invite.code}
                            </p>
                            <span className="text-xs uppercase tracking-wide text-zinc-500">
                              {invite.role}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {invite.usedAt
                              ? `使用済み: ${formatDateTime(invite.usedAt)}`
                              : `未使用${
                                  invite.expiresAt
                                    ? ` / 期限: ${formatDateTime(
                                        invite.expiresAt
                                      )}`
                                    : ""
                                }`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                メンバーと権限
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                役割を変更すると、該当メンバーの機能アクセス権が更新されます。
              </p>
              <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-2 text-left">メンバー</th>
                      <th className="px-4 py-2 text-left">メール</th>
                      <th className="px-4 py-2 text-left">権限</th>
                    </tr>
                  </thead>
                  <tbody>
                    {membersList.map((memberInfo) => (
                      <tr
                        key={memberInfo.id}
                        className="border-t border-zinc-100 text-zinc-800"
                      >
                        <td className="px-4 py-3 font-semibold">
                          {memberInfo.displayName}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600">
                          {memberInfo.email ?? "メール未登録"}
                        </td>
                        <td className="px-4 py-3">
                          <form
                            action={updateMemberRoleAction}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input
                              type="hidden"
                              name="memberId"
                              value={memberInfo.id}
                            />
                            <select
                              name="role"
                              defaultValue={memberInfo.role}
                              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                            >
                              {ROLE_OPTIONS.map((roleValue) => (
                                <option key={roleValue} value={roleValue}>
                                  {roleValue}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-sky-500 hover:text-sky-600"
                            >
                              更新
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
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
            {isAccountingEnabled ? (
              <>
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
            ) : (
              <section className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-6 text-sm text-zinc-600">
                会計機能を「いいえ」に設定しているため、勘定科目や残高の設定は現在無効になっています。必要になったら上の設定で「はい」を選択してください。
              </section>
            )}

            {isAccountingEnabled ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">予算管理</h2>
              {showBudgetSection ? (
                <>
                  <p className="mt-2 text-sm text-zinc-600">
                    科目ごとの年間予算を登録すると、収支報告や進捗管理に利用できます。
                  </p>
                  <div className="mt-4 grid gap-6 lg:grid-cols-2">
                    <div>
                      <p className="text-sm text-zinc-500">登録済みの予算</p>
                      {budgets.length === 0 ? (
                        <p className="mt-2 rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                          まだ予算が登録されていません。
                        </p>
                      ) : (
                        <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200">
                          <table className="min-w-full text-sm">
                            <thead className="bg-zinc-50 text-zinc-500">
                              <tr>
                                <th className="px-4 py-2 text-left">年度</th>
                                <th className="px-4 py-2 text-left">科目</th>
                                <th className="px-4 py-2 text-left">区分</th>
                                <th className="px-4 py-2 text-right">金額</th>
                              </tr>
                            </thead>
                            <tbody>
                              {budgets.map((budget) => (
                                <tr
                                  key={`${budget.fiscalYear}-${budget.accountId}`}
                                  className="border-t border-zinc-100 text-zinc-700"
                                >
                                  <td className="px-4 py-2">
                                    {budget.fiscalYear}年度
                                  </td>
                                  <td className="px-4 py-2">
                                    {budget.account.name}
                                  </td>
                                  <td className="px-4 py-2 text-xs text-zinc-500">
                                    {ACCOUNT_TYPE_LABELS[budget.account.type] ??
                                      budget.account.type}
                                  </td>
                                  <td className="px-4 py-2 text-right font-semibold text-sky-700">
                                    {currencyFormatter.format(budget.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-zinc-500">予算を登録 / 更新</p>
                      <form
                        action={createBudgetAction}
                        className="mt-2 space-y-3 rounded-xl border border-dashed border-zinc-300 p-4"
                      >
                        <label className="block text-sm text-zinc-600">
                          年度
                          <select
                            name="fiscalYear"
                            defaultValue={currentYear}
                            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          >
                            {yearOptions.map((year) => (
                              <option key={year} value={year}>
                                {year}年度
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm text-zinc-600">
                          科目
                          <select
                            name="accountId"
                            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                            required
                          >
                            {data.accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}（
                                {ACCOUNT_TYPE_LABELS[account.type] ??
                                  account.type}
                                ）
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-sm text-zinc-600">
                          金額（円）
                          <input
                            type="number"
                            name="amount"
                            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                            placeholder="例: 500000"
                            required
                          />
                        </label>
                        <p className="text-xs text-zinc-500">
                          同じ年度・科目の予算がある場合は上書きされます。
                        </p>
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                        >
                          予算を保存
                        </button>
                      </form>
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
                  現在は予算機能を利用しない設定になっています。必要になったら上部の「会計年度と承認フロー」で「はい」を選択してください。
                </p>
              )}
              </section>
            ) : null}
          </>
        ) : (
          <section className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-6 text-sm text-zinc-600">
            Knot Management は管理者のみが利用できます。権限が必要な場合は団体の管理者に連絡してください。
          </section>
        )}
      </div>
    </div>
  );
}
