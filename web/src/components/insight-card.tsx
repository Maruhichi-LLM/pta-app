import type { InsightMetric, InsightStatus } from "@/lib/insight/metrics";

const STATUS_META: Record<InsightStatus, {
  label: string;
  icon: string;
  badge: string;
}> = {
  good: {
    label: "安定",
    icon: "🟢",
    badge: "bg-emerald-100 text-emerald-700",
  },
  warn: {
    label: "少し重い",
    icon: "🟡",
    badge: "bg-amber-100 text-amber-700",
  },
  bad: {
    label: "詰まり気味",
    icon: "🔴",
    badge: "bg-rose-100 text-rose-700",
  },
};

type Props = {
  metric: InsightMetric;
  showDetail: boolean;
};

export function InsightCard({ metric, showDetail }: Props) {
  const meta = STATUS_META[metric.status];
  const detailEntries = metric.detail
    ? Object.entries(metric.detail)
    : [];

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">
              Insight
            </p>
            <h3 className="mt-1 text-lg font-semibold text-zinc-900">
              {metric.title}
            </h3>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${meta.badge}`}
          >
            <span aria-hidden="true">{meta.icon}</span>
            {meta.label}
          </span>
        </div>
        <p className="text-sm text-zinc-600">{metric.hint}</p>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <p className="text-2xl font-semibold text-zinc-900">
            {metric.primaryValue}
          </p>
          {metric.secondaryValue ? (
            <p className="text-sm text-zinc-500">{metric.secondaryValue}</p>
          ) : null}
        </div>
        {showDetail && detailEntries.length > 0 ? (
          <details className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
            <summary className="cursor-pointer text-xs font-semibold text-sky-600">
              詳細を見る
            </summary>
            <div className="mt-2 space-y-1">
              {detailEntries.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3"
                >
                  <span>{label}</span>
                  <span className="font-semibold text-zinc-700">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
