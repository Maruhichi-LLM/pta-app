import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { VotingAnonymousBanner } from "@/components/voting-anonymous-banner";
import { GroupAvatar } from "@/components/group-avatar";

const formatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

function resolveStatusLabel(status: string) {
  return status === "CLOSED" ? "締切済み" : "受付中";
}

export default async function VotingPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  await ensureModuleEnabled(session.groupId, "voting");

  const [group, votings] = await Promise.all([
    prisma.group.findUnique({
      where: { id: session.groupId },
      select: { name: true, logoUrl: true },
    }),
    prisma.voting.findMany({
      where: { groupId: session.groupId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { displayName: true } },
      },
    }),
  ]);
  if (!group) {
    redirect("/join");
  }

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell space-y-8">
        <header className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center gap-4">
            <GroupAvatar
              name={group.name}
              logoUrl={group.logoUrl}
              sizeClassName="h-12 w-12"
            />
            <div>
              <p className="text-sm uppercase tracking-wide text-zinc-500">
                Knot Voting
              </p>
              <h1 className="text-3xl font-semibold text-zinc-900">
                みんなの意思を、静かに確実に。
              </h1>
              <p className="mt-2 text-sm text-zinc-600">
                団体内の意思決定を、匿名かつ公平に集計・記録できる投票機能。
              </p>
            </div>
          </div>
        </header>

        <VotingAnonymousBanner />

        <section className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">投票一覧</h2>
          <Link
            href="/voting/new"
            className="inline-flex rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-sky-700"
          >
            投票を作成
          </Link>
        </section>

        {votings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
            <p className="text-sm text-zinc-500">
              投票はまだありません。まずは議題を1つ作って、みんなの意思を集めましょう。
            </p>
            <Link
              href="/voting/new"
              className="mt-4 inline-flex rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              投票を作成
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {votings.map((voting) => {
              const options = Array.isArray(voting.options)
                ? (voting.options as { id: string; label: string }[])
                : [];
              const results = (voting.results ?? {}) as Record<
                string,
                number
              >;
              return (
                <article
                  key={voting.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-zinc-400">
                        {formatter.format(voting.createdAt)}
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-zinc-900">
                        {voting.title}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-500">
                        作成者: {voting.createdBy?.displayName ?? "不明"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        voting.status === "CLOSED"
                          ? "bg-zinc-100 text-zinc-600"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {resolveStatusLabel(voting.status)}
                    </span>
                  </div>
                  {voting.description ? (
                    <p className="mt-3 text-sm text-zinc-700">
                      {voting.description}
                    </p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-zinc-600">
                    <span>
                      締切:{" "}
                      {voting.deadlineAt
                        ? formatter.format(voting.deadlineAt)
                        : "なし"}
                    </span>
                    <span>投票数: {voting.totalVotes}</span>
                    {voting.threadId ? (
                      <span className="text-sky-600">チャット移行済み</span>
                    ) : null}
                  </div>
                  <div className="mt-4 space-y-1 text-sm text-zinc-700">
                    <p className="text-xs text-zinc-500">現在の集計</p>
                    {options.length === 0 ? (
                      <p className="text-sm text-zinc-400">
                        まだ選択肢がありません。
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {options.map((option) => (
                          <li key={option.id} className="flex justify-between">
                            <span>{option.label}</span>
                            <span>{results[option.id] ?? 0}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="mt-4">
                    <Link
                      href={`/voting/${voting.id}`}
                      className="inline-flex rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                    >
                      詳細を見る
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
