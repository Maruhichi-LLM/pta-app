"use client";

import { ChangeEvent, FormEvent, useCallback, useState } from "react";
import { GroupAvatar } from "@/components/group-avatar";

type MemberOption = {
  id: number;
  displayName: string;
};

type SerializedAuditLog = {
  id: number;
  actorName: string | null;
  actionType: string;
  targetType: string;
  targetId: number | null;
  beforeJson: unknown;
  afterJson: unknown;
  sourceThreadId: number | null;
  sourceChatMessageId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type SerializedFinding = {
  id: number;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  logIds: number[];
  targetRefs: unknown;
  assigneeName: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

type InternalControlRuleView = {
  id: number;
  name: string;
  description?: string | null;
  severity: string;
  ruleType: string;
  isActive: boolean;
};

type ControlResult = {
  ruleId: number;
  name: string;
  description?: string | null;
  severity: string;
  ruleType: string;
  items: Array<{
    targetType: string;
    targetId: number;
    summary: string;
    links?: { href: string; label: string }[];
  }>;
};

type AuditClientProps = {
  members: MemberOption[];
  stats: {
    activeRules: number;
    openFindings: number;
    recentLogs: number;
  };
  initialLogs: SerializedAuditLog[];
  initialFindings: SerializedFinding[];
  rules: InternalControlRuleView[];
  groupName: string;
  groupLogoUrl?: string | null;
  enumOptions: {
    targetTypes: string[];
    statuses: string[];
    severities: string[];
    categories: string[];
  };
};

const TAB_OPTIONS = [
  { id: "logs", label: "監査ログ" },
  { id: "controls", label: "内部統制チェック" },
  { id: "findings", label: "指摘" },
] as const;

type TabOption = (typeof TAB_OPTIONS)[number]["id"];

export default function AuditClient({
  members,
  stats,
  initialLogs,
  initialFindings,
  rules,
  groupName,
  groupLogoUrl,
  enumOptions,
}: AuditClientProps) {
  const [activeTab, setActiveTab] = useState<TabOption>("logs");

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <GroupAvatar
            name={groupName}
            logoUrl={groupLogoUrl}
            sizeClassName="h-12 w-12"
          />
          <div>
            <p className="text-sm uppercase tracking-wide text-zinc-500">
              Knot Audit
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-zinc-900">
              ちゃんとしている、を証明する。
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              会計や運営の履歴をもとに、監査・内部統制を可視化する。
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="直近30日の監査ログ" value={stats.recentLogs} tint="sky" />
          <MetricCard label="アクティブな統制ルール" value={stats.activeRules} tint="emerald" />
          <MetricCard label="未解決指摘" value={stats.openFindings} tint="rose" />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-6 pt-4">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="px-6 py-6">
          {activeTab === "logs" && (
            <LogsPanel
              initialLogs={initialLogs}
              members={members}
              targetTypes={enumOptions.targetTypes}
            />
          )}
          {activeTab === "controls" && (
            <ControlsPanel rules={rules} />
          )}
          {activeTab === "findings" && (
            <FindingsPanel
              members={members}
              initialFindings={initialFindings}
              statuses={enumOptions.statuses}
              severities={enumOptions.severities}
              categories={enumOptions.categories}
            />
          )}
        </div>
      </section>
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: number;
  tint: "sky" | "emerald" | "rose";
};

function MetricCard({ label, value, tint }: MetricCardProps) {
  const tintClassMap = {
    sky: "border-sky-100 bg-sky-50 text-sky-900",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-900",
    rose: "border-rose-100 bg-rose-50 text-rose-900",
  } satisfies Record<MetricCardProps["tint"], string>;

  return (
    <div className={`rounded-2xl border p-4 ${tintClassMap[tint]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}

function LogsPanel({
  initialLogs,
  members,
  targetTypes,
}: {
  initialLogs: SerializedAuditLog[];
  members: MemberOption[];
  targetTypes: string[];
}) {
  const [logs, setLogs] = useState(initialLogs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    actorId: "",
    targetType: "",
    query: "",
  });

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.actorId) params.set("actorId", filters.actorId);
      if (filters.targetType) params.set("targetType", filters.targetType);
      if (filters.query) params.set("query", filters.query);
      const response = await fetch(`/api/audit/logs?${params.toString()}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "検索に失敗しました。");
      }
      const data = (await response.json()) as { logs: SerializedAuditLog[] };
      setLogs(data.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "検索に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void fetchLogs();
  };

  const resetFilters = () => {
    setFilters({ from: "", to: "", actorId: "", targetType: "", query: "" });
    setLogs(initialLogs);
  };

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={handleSubmit}
      >
        <label className="text-xs text-zinc-600">
          期間（開始）
          <input
            type="date"
            name="from"
            value={filters.from}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1"
          />
        </label>
        <label className="text-xs text-zinc-600">
          期間（終了）
          <input
            type="date"
            name="to"
            value={filters.to}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1"
          />
        </label>
        <label className="text-xs text-zinc-600">
          実行者
          <select
            name="actorId"
            value={filters.actorId}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1"
          >
            <option value="">すべて</option>
            {members.map((memberOption) => (
              <option key={memberOption.id} value={memberOption.id}>
                {memberOption.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600">
          対象種別
          <select
            name="targetType"
            value={filters.targetType}
            onChange={handleChange}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1"
          >
            <option value="">すべて</option>
            {targetTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600 sm:col-span-2 lg:col-span-4">
          キーワード（ID / Action）
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              name="query"
              value={filters.query}
              onChange={handleChange}
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-1"
            />
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white"
              disabled={loading}
            >
              {loading ? "検索中..." : "検索"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-zinc-300 px-4 py-1.5 text-sm font-semibold text-zinc-600"
            >
              クリア
            </button>
          </div>
        </label>
      </form>
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {logs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-3 text-sm text-zinc-500">
          条件に一致するログはありません。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">日時</th>
                <th className="px-3 py-2 text-left">実行者</th>
                <th className="px-3 py-2 text-left">アクション</th>
                <th className="px-3 py-2 text-left">対象</th>
                <th className="px-3 py-2 text-left">詳細</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">
                    {log.actorName ?? "システム"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                      {log.actionType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-600">
                    {log.targetType}
                    {log.targetId ? ` #${log.targetId}` : ""}
                  </td>
                  <td className="px-3 py-2">
                    <details className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                      <summary className="cursor-pointer text-zinc-700">
                        before / after
                      </summary>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <div>
                          <p className="font-semibold text-zinc-700">Before</p>
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-white p-2 text-[11px]">
                            {log.beforeJson
                              ? JSON.stringify(log.beforeJson, null, 2)
                              : "—"}
                          </pre>
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-700">After</p>
                          <pre className="mt-1 max-h-48 overflow-auto rounded bg-white p-2 text-[11px]">
                            {log.afterJson
                              ? JSON.stringify(log.afterJson, null, 2)
                              : "—"}
                          </pre>
                        </div>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ControlsPanel({
  rules,
}: {
  rules: InternalControlRuleView[];
}) {
  const [results, setResults] = useState<ControlResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runChecks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/audit/run-internal-controls", {
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "チェックの実行に失敗しました。");
      }
      const data = (await response.json()) as { results: ControlResult[] };
      setResults(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "チェックに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runChecks}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          disabled={loading}
        >
          {loading ? "実行中..." : "内部統制チェックを実行"}
        </button>
        <p className="text-xs text-zinc-500">
          重大度 INFO/WARN/CRITICAL を色分けして表示します。
        </p>
      </div>
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500">
          まだ検知結果はありません。チェックを実行するとここに表示されます。
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((result) => (
            <div
              key={result.ruleId}
              className={`rounded-xl border p-4 shadow-sm ${
                severityBorder(result.severity)
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={severityBadge(result.severity)}>
                  {result.severity}
                </span>
                <h3 className="text-lg font-semibold text-zinc-800">
                  {result.name}
                </h3>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                  {result.ruleType}
                </span>
              </div>
              {result.description ? (
                <p className="mt-1 text-sm text-zinc-600">
                  {result.description}
                </p>
              ) : null}
              <ul className="mt-3 space-y-3 text-sm text-zinc-700">
                {result.items.map((item, index) => (
                  <li
                    key={`${item.targetType}-${item.targetId}-${index}`}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
                  >
                    <p className="font-semibold text-zinc-800">
                      {item.summary}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {item.targetType} #{item.targetId}
                    </p>
                    {item.links && item.links.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {item.links.map((link) => (
                          <a
                            key={link.href}
                            href={link.href}
                            className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700 hover:bg-sky-200"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
        <h4 className="text-sm font-semibold text-zinc-700">ルール一覧</h4>
        <ul className="mt-3 space-y-2 text-sm">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                  {rule.ruleType}
                </span>
                <p className="font-semibold text-zinc-800">{rule.name}</p>
                {!rule.isActive ? (
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600">
                    非アクティブ
                  </span>
                ) : null}
              </div>
              {rule.description ? (
                <p className="text-xs text-zinc-600">{rule.description}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function FindingsPanel({
  members,
  initialFindings,
  statuses,
  severities,
  categories,
}: {
  members: MemberOption[];
  initialFindings: SerializedFinding[];
  statuses: string[];
  severities: string[];
  categories: string[];
}) {
  const [findings, setFindings] = useState(initialFindings);
  const [filters, setFilters] = useState({ status: "OPEN", severity: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    title: "",
    description: "",
    category: categories[0] ?? "FINANCIAL",
    severity: severities[0] ?? "INFO",
    status: "OPEN",
    assigneeMemberId: "",
    logIds: "",
    targetRefs: "",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFilterChange = (
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const loadFindings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.severity) params.set("severity", filters.severity);
      const response = await fetch(`/api/audit/findings?${params.toString()}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "取得に失敗しました。");
      }
      const data = (await response.json()) as {
        findings: SerializedFinding[];
      };
      setFindings(data.findings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = {
        title: formState.title.trim(),
        description: formState.description.trim(),
        category: formState.category,
        severity: formState.severity,
        status: formState.status,
        assigneeMemberId: formState.assigneeMemberId
          ? Number(formState.assigneeMemberId)
          : undefined,
        logIds: formState.logIds
          ? formState.logIds
              .split(",")
              .map((entry) => Number(entry.trim()))
              .filter((entry) => Number.isInteger(entry) && entry > 0)
          : [],
        targetRefs: formState.targetRefs
          ? safeParseJson(formState.targetRefs)
          : null,
      };
      const response = await fetch("/api/audit/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "作成に失敗しました。");
      }
      await loadFindings();
      setFormState((current) => ({
        ...current,
        title: "",
        description: "",
        assigneeMemberId: "",
        logIds: "",
        targetRefs: "",
      }));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "作成に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (
    findingId: number,
    status: string
  ) => {
    try {
      const response = await fetch(`/api/audit/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error("更新に失敗しました。");
      }
      await loadFindings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました。");
    }
  };

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); void loadFindings(); }}>
        <label className="text-xs text-zinc-600">
          ステータス
          <select
            name="status"
            value={filters.status}
            onChange={handleFilterChange}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1"
          >
            <option value="">すべて</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600">
          重大度
          <select
            name="severity"
            value={filters.severity}
            onChange={handleFilterChange}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1"
          >
            <option value="">すべて</option>
            {severities.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="self-end rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white"
          disabled={loading}
        >
          {loading ? "更新中..." : "適用"}
        </button>
      </form>
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="space-y-3">
        {findings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-3 text-sm text-zinc-500">
            条件に一致する指摘はありません。
          </p>
        ) : (
          findings.map((finding) => (
            <article
              key={finding.id}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-zinc-900">
                  {finding.title}
                </h3>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                  {finding.category}
                </span>
                <span className={severityBadge(finding.severity)}>
                  {finding.severity}
                </span>
                <select
                  value={finding.status}
                  onChange={(event) =>
                    handleStatusChange(finding.id, event.target.value)
                  }
                  className="rounded-lg border border-zinc-200 px-2 py-0.5 text-xs"
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-sm text-zinc-700">
                {finding.description}
              </p>
              <div className="mt-2 text-xs text-zinc-500">
                <p>
                  担当: {finding.assigneeName ?? "未割当"} / 作成:
                  {finding.createdByName}
                </p>
                <p>
                  更新日時: {formatDateTime(finding.updatedAt)}
                </p>
              </div>
              {finding.logIds.length > 0 ? (
                <p className="mt-1 text-xs text-zinc-500">
                  関連ログID: {finding.logIds.join(", ")}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <h4 className="text-sm font-semibold text-zinc-700">
          指摘を登録
        </h4>
        <form className="mt-3 grid gap-3" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="タイトル"
            value={formState.title}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            className="rounded-lg border border-zinc-300 px-3 py-2"
            required
          />
          <textarea
            placeholder="説明"
            value={formState.description}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            rows={3}
            className="rounded-lg border border-zinc-300 px-3 py-2"
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-600">
              カテゴリ
              <select
                value={formState.category}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-600">
              重大度
              <select
                value={formState.severity}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    severity: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1"
              >
                {severities.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-xs text-zinc-600">
            担当者
            <select
              value={formState.assigneeMemberId}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  assigneeMemberId: event.target.value,
                }))
              }
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1"
            >
              <option value="">未割当</option>
              {members.map((memberOption) => (
                <option key={memberOption.id} value={memberOption.id}>
                  {memberOption.displayName}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-600">
              関連ログID（カンマ区切り）
              <input
                type="text"
                value={formState.logIds}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    logIds: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1"
              />
            </label>
            <label className="text-xs text-zinc-600">
              関連対象（JSON）
              <input
                type="text"
                value={formState.targetRefs}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    targetRefs: event.target.value,
                  }))
                }
                placeholder='[{"type":"LEDGER","id":1}]'
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1"
              />
            </label>
          </div>
          {submitError ? (
            <p className="text-sm text-rose-700">{submitError}</p>
          ) : null}
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            disabled={submitting}
          >
            {submitting ? "登録中..." : "指摘を登録"}
          </button>
        </form>
      </div>
    </div>
  );
}

function severityBadge(severity: string) {
  switch (severity) {
    case "CRITICAL":
    case "HIGH":
      return "rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700";
    case "WARN":
    case "MEDIUM":
      return "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700";
    default:
      return "rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600";
  }
}

function severityBorder(severity: string) {
  switch (severity) {
    case "CRITICAL":
    case "HIGH":
      return "border-rose-200";
    case "WARN":
    case "MEDIUM":
      return "border-amber-200";
    default:
      return "border-zinc-200";
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
