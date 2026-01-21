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
  management: "招待や機能ON/OFF、収支内訳書・予算設定を管理。",
};

const DOCUMENT_CARD = {
  label: "Knot Document",
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

  return (
    <div className="min-h-screen bg-white py-16">
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
          <div className="flex w-full gap-5 overflow-x-auto pb-3">
            {MODULE_LINKS.map((module) => {
              const isEnabled = enabled.includes(module.key);
              const targetHref = session ? module.href : "/join";
              return (
                <div
                  key={module.key}
                  className="min-w-[300px] flex-1 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm flex h-full min-h-[260px] flex-col justify-between"
                >
                  <div>
                    <p className="text-xs uppercase tracking-wide text-sky-600">
                      {module.label}
                      <span className="ml-2 text-[0.65rem] text-zinc-400">
                        {isEnabled
                          ? "MODULE ENABLED"
                          : session
                          ? "MODULE DISABLED"
                          : "PREVIEW"}
                      </span>
                    </p>
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
            <div className="min-w-[300px] flex-1 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm flex h-full min-h-[260px] flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-sky-600">
                  {DOCUMENT_CARD.label}
                  <span className="ml-2 text-[0.65rem] text-zinc-400">
                    ALWAYS AVAILABLE
                  </span>
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
          </div>
        </section>
      </div>
    </div>
  );
}
