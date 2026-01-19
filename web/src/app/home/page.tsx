import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";

async function fetchMember(memberId: number) {
  return prisma.member.findUnique({
    where: { id: memberId },
    include: { group: true },
  });
}

export default async function HomePage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  const member = await fetchMember(session.memberId);
  if (!member || !member.group) {
    redirect("/join");
  }

  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 p-8 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-zinc-500">
              {member.group.fiscalYearStartMonth}月始まり
            </p>
            <h1 className="text-3xl font-semibold text-zinc-900">
              {member.group.name}
            </h1>
          </div>
          <LogoutButton />
        </div>

        <div className="mt-8 rounded-xl bg-zinc-50 p-6">
          <p className="text-sm text-zinc-500">ログイン中のメンバー</p>
          <p className="text-2xl font-bold text-zinc-900">{member.displayName}</p>
          <p className="text-sm text-zinc-500">権限: {member.role}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/ledger" className="text-sky-600 underline">
              会計画面へ →
            </Link>
            <Link href="/events" className="text-sky-600 underline">
              イベント画面へ →
            </Link>
          </div>
        </div>

        <div className="mt-10 space-y-4 text-sm text-zinc-600">
          <p>これから実装する予定:</p>
          <ul className="list-disc pl-5">
            <li>イベント / 出欠</li>
            <li>会計（証憑アップロード）</li>
            <li>承認フローと監査ログ</li>
            <li>イベント別ミニ収支の本会計取り込み</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
