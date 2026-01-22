import Link from "next/link";
import { getSessionFromCookies } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  MODULE_LINKS,
  ModuleKey,
  filterEnabledModules,
} from "@/lib/modules";

const COPY = [
  "Knot is not only for PTA.",
  "Knot is not only for events.",
  "Knot is not only for accounting.",
  "Knot is where everything connects.",
] as const;

const MODULE_DESCRIPTIONS: Record<ModuleKey, string> = {
  event: "行事の登録とメンバーの出欠を一つに。",
  accounting: "経費精算と承認フローをシンプルに。",
  calendar: "行事を月間ビューで共有。",
  management: "招待と権限、メンバー体制を管理するヒューマンモジュール。",
  chat: "発言そのものを次の行動へつなげる意思決定ハブ。チャットからToDo・会計・議事録へ直接変換します。",
  todo: "会話から生まれたタスクを簡潔に管理。誰が・いつまでに・何をやるかを素早く共有します。",
  store: "団体向けモジュールの追加・有効化・無効化をまとめて管理するモジュールストア（管理者専用）。",
};

const MODULE_BADGES: Partial<Record<ModuleKey, string>> = {
  event: "イベント / Planning",
  calendar: "共有ビュー / Calendar",
  accounting: "会計 / Finance",
  chat: "意思決定 / ハブ",
  todo: "実行 / Action",
  management: "組織設定 / Governance",
  store: "モジュール管理 / App Store",
};

const MODULE_WRAPPER_VARIANTS: Partial<Record<
  ModuleKey,
  { border: string; label: string }
>> = {
  management: {
    border: "border-amber-200 bg-amber-50",
    label: "text-amber-700",
  },
  store: {
    border: "border-amber-200 bg-amber-50",
    label: "text-amber-700",
  },
};

const DOCUMENT_CARD = {
  label: "Knot Document",
  badge: "ドキュメント / Archive",
  description: "団体の確定版ドキュメントを保管し、年度の引き継ぎをシンプルに。",
  href: "/documents",
};

export default async function RootPage() {
  const session = await getSessionFromCookies();
  let enabled = MODULE_LINKS.map((module) => module.key);
  if (session) {
    const group = await prisma.group.findUnique({
      where: { id: session.groupId },
      select: { enabledModules: true },
    });
    enabled = filterEnabledModules(group?.enabledModules).map(
      (module) => module.key
    );
  }

  const moduleMap = new Map(MODULE_LINKS.map((module) => [module.key, module]));
  const moduleOrder: Array<ModuleKey | "document"> = [
    "chat",
    "todo",
    "event",
    "calendar",
    "accounting",
    "document",
    "management",
    "store",
  ];

  return (
    <div className="min-h-screen bg-transparent py-16">
      <div className="page-shell space-y-16 text-center">
        <div className="mx-auto max-w-4xl space-y-4">
          {COPY.map((line) => (
            <p key={line} className="text-2xl font-semibold text-zinc-900">
              {line}
            </p>
          ))}
          {!session ? (
            <div className="space-x-3">
              <Link
                href="/join"
                className="inline-flex rounded-full bg-zinc-900 px-6 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700"
              >
                Knot を始める
              </Link>
              <Link
                href="/join"
                className="inline-flex rounded-full border border-zinc-200 px-6 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                招待コードで参加
              </Link>
            </div>
          ) : null}
        </div>

        <section className="edge-shell text-left">
          <div className="mx-auto mb-6 max-w-4xl text-center">
            <p className="text-sm uppercase tracking-wide text-zinc-500">
              Knot Modules
            </p>
            <h2 className="mt-1 text-3xl font-semibold text-zinc-900">
              必要なモジュールだけを結ぶ
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {moduleOrder.map((key) => {
              if (key === "document") {
                return (
                  <div
                    key="document"
                    className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm flex h-full min-h-[260px] flex-col justify-between"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-wide text-sky-600">
                        {DOCUMENT_CARD.label}
                        <span className="ml-2 text-[0.65rem] text-zinc-400">
                          ALWAYS AVAILABLE
                        </span>
                      </p>
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        {DOCUMENT_CARD.badge}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-zinc-900">
                        {DOCUMENT_CARD.label}
                      </h3>
                      <p className="mt-3 text-sm text-zinc-600">
                        {DOCUMENT_CARD.description}
                      </p>
                    </div>
                    <div className="mt-6">
                      <Link
                        href={session ? DOCUMENT_CARD.href : "/join"}
                        className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold ${
                          session
                            ? "bg-sky-600 text-white hover:bg-sky-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {session ? "開く" : "Knot へ参加"}
                      </Link>
                    </div>
                  </div>
                );
              }
              const module = moduleMap.get(key);
              if (!module) return null;
              const isEnabled = enabled.includes(module.key);
              const targetHref = session ? module.href : "/join";
              return (
                <div
                  key={module.key}
                  className={`rounded-2xl border p-5 shadow-sm flex h-full min-h-[260px] flex-col justify-between ${
                    MODULE_WRAPPER_VARIANTS[module.key]?.border ??
                    "border-zinc-200 bg-white"
                  }`}
                >
                  <div>
                    <p
                      className={`text-xs uppercase tracking-wide ${
                        MODULE_WRAPPER_VARIANTS[module.key]?.label ??
                        "text-sky-600"
                      }`}
                    >
                      {module.label}
                      <span className="ml-2 text-[0.65rem] text-zinc-400">
                        {isEnabled
                          ? "MODULE ENABLED"
                          : session
                          ? "MODULE DISABLED"
                          : "PREVIEW"}
                      </span>
                    </p>
                    {MODULE_BADGES[module.key] ? (
                      <p className="mt-1 text-xs font-semibold text-amber-600">
                        {MODULE_BADGES[module.key]}
                      </p>
                    ) : null}
                    <h3 className="mt-2 text-xl font-semibold text-zinc-900">
                      {module.label}
                    </h3>
                    <p className="mt-3 text-sm text-zinc-600">
                      {MODULE_DESCRIPTIONS[module.key]}
                    </p>
                  </div>
                  <div className="mt-6">
                    <Link
                      href={targetHref}
                      className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold ${
                        isEnabled && session
                          ? "bg-sky-600 text-white hover:bg-sky-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {isEnabled && session ? "開く" : session ? "無効化中" : "Knot へ参加"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
