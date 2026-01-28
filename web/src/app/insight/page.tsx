import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { ROLE_ADMIN } from "@/lib/roles";
import {
  getInsightMetrics,
  INSIGHT_PERIOD_OPTIONS,
  normalizeInsightPeriod,
  resolveInsightPeriod,
} from "@/lib/insight/metrics";
import { InsightCard } from "@/components/insight-card";

const STATUS_LABELS = {
  good: "安定",
  warn: "少し重い",
  bad: "詰まり気味",
} as const;

const STATUS_ICONS = {
  good: "🟢",
  warn: "🟡",
  bad: "🔴",
} as const;

type InsightPageProps = {
  searchParams?: Promise<{ period?: string }>;
};

export default async function InsightPage({ searchParams }: InsightPageProps) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  await ensureModuleEnabled(session.groupId, "insight");

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { role: true },
  });
  const isAdmin = member?.role === ROLE_ADMIN;

  const resolvedParams = (await searchParams) ?? {};
  const periodKey = normalizeInsightPeriod(resolvedParams.period ?? "");
  const period = await resolveInsightPeriod(session.groupId, periodKey);
  const metrics = await getInsightMetrics(session.groupId, period);

  const recentInsights = metrics.filter((metric) => metric.status !== "good");
  const recentHighlights =
    recentInsights.length > 0
      ? recentInsights.slice(0, 3)
      : metrics.slice(0, 2);

  return (
    <div className="min-h-screen bg-transparent py-10">
      <div className="page-shell space-y-8">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Knot Insight
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-zinc-900">
                団体運営の気づきを静かに可視化
              </h1>
              <p className="mt-2 text-sm text-zinc-600">
                スコアではなく状態とヒントで、今の運営をゆるやかに捉えます。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {INSIGHT_PERIOD_OPTIONS.map((option) => {
                const isActive = option.key === period.key;
                return (
                  <Link
                    key={option.key}
                    href={`/insight?period=${option.key}`}
                    className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                      isActive
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : "border-zinc-200 text-zinc-600 hover:border-sky-200 hover:bg-sky-50"
                    }`}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span className="rounded-full bg-zinc-100 px-3 py-1">
              期間: {period.label}
            </span>
            <span>{period.rangeLabel}</span>
            {!isAdmin ? (
              <span className="rounded-full bg-zinc-50 px-3 py-1">
                詳細は管理者のみ表示
              </span>
            ) : null}
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">最近の気づき</h2>
            <span className="text-xs text-zinc-500">
              {recentInsights.length > 0
                ? "状態が変化している指標"
                : "落ち着いている指標"}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {recentInsights.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                今は大きな詰まりは見当たりません。落ち着いた運営が続いています。
              </p>
            ) : (
              recentHighlights.map((metric) => (
                <div
                  key={metric.id}
                  className="flex flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {metric.title}
                    </p>
                    <p className="text-sm text-zinc-600">{metric.hint}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
                    <span aria-hidden="true">
                      {STATUS_ICONS[metric.status]}
                    </span>
                    {STATUS_LABELS[metric.status]}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => (
            <InsightCard
              key={metric.id}
              metric={metric}
              showDetail={isAdmin}
            />
          ))}
        </section>
      </div>
    </div>
  );
}
