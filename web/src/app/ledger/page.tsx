import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { LedgerList, type LedgerDisplay } from "@/components/ledger-list";
import { LedgerCreateForm } from "@/components/ledger-create-form";
import { ROLE_ADMIN } from "@/lib/roles";
import { ensureModuleEnabled } from "@/lib/modules";
import { KNOT_CALENDAR_PATH } from "@/lib/routes";

async function fetchLedgerData(groupId: number, memberId: number) {
  const [group, ledgers, member, accountingSetting] = await Promise.all([
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

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell flex flex-col gap-8">
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

        {canManage ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/80 p-4 text-sm text-zinc-700">
            会計年度や勘定科目の設定は{" "}
            <Link href="/management" className="font-semibold text-sky-700">
              Knot Management
            </Link>
            で管理できます。
          </div>
        ) : null}
        {isAccountingEnabled ? (
          <>
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <LedgerCreateForm />
            </section>
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">会計一覧</h2>
              <div className="mt-4">
                <LedgerList
                  ledgers={data.ledgers as LedgerDisplay[]}
                  canApprove={true}
                />
              </div>
            </section>
          </>
        ) : (
          <section className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-6 text-sm text-zinc-600">
            この団体では現在会計機能を利用していません。管理者が{" "}
            <Link href="/management" className="font-semibold text-sky-700">
              Knot Management
            </Link>
            で会計機能を有効化すると、申請や承認、残高管理を開始できます。
          </section>
        )}
      </div>
    </div>
  );
}
