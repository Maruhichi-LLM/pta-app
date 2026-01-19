import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { LedgerList, type LedgerDisplay } from "@/components/ledger-list";
import { LedgerCreateForm } from "@/components/ledger-create-form";

async function fetchLedgerData(groupId: number) {
  const [group, ledgers] = await Promise.all([
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
  };
}

export default async function LedgerPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  const data = await fetchLedgerData(session.groupId);
  if (!data.group) {
    redirect("/join");
  }

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
