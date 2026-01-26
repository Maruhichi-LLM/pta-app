import Link from "next/link";
import { getSessionFromCookies } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  MODULE_LINKS,
  AllModuleKey,
  EXTENSION_MODULES,
  filterEnabledModules,
} from "@/lib/modules";
import { MODULE_METADATA } from "@/lib/module-metadata";

const COPY = [
  "Knot is not only for PTA.",
  "Knot is not only for events.",
  "Knot is not only for accounting.",
  "Knot is where everything connects.",
] as const;

const VARIANT_STYLES = {
  default: {
    border: "border-zinc-200 bg-white",
    label: "text-sky-600",
  },
  system: {
    border: "border-amber-200 bg-amber-50",
    label: "text-amber-700",
  },
} as const;

function isExtensionModuleKey(
  key: string
): key is (typeof EXTENSION_MODULES)[number] {
  return EXTENSION_MODULES.includes(
    key as (typeof EXTENSION_MODULES)[number]
  );
}

export default async function RootPage() {
  const session = await getSessionFromCookies();
  let enabledCore = MODULE_LINKS.map((module) => module.key);
  let enabledExtensions: Array<(typeof EXTENSION_MODULES)[number]> = [];
  if (session) {
    const group = await prisma.group.findUnique({
      where: { id: session.groupId },
      select: { enabledModules: true },
    });
    const groupEnabled = group?.enabledModules ?? [];
    enabledCore = filterEnabledModules(groupEnabled).map(
      (module) => module.key
    );
    enabledExtensions = groupEnabled.filter(isExtensionModuleKey);
  }
  const enabledSet = new Set<AllModuleKey>([
    ...enabledCore,
    ...enabledExtensions,
  ]);

  // 拡張モジュール用の情報を追加
  const extensionModuleInfo = {
    "event-budget": {
      key: "event-budget" as const,
      label: "Knot Event Budget Extension",
      href: "/events/budget",
    },
  };

  const moduleMap = new Map(MODULE_LINKS.map((module) => [module.key, module]));
  // 拡張モジュールもマップに追加
  moduleMap.set("event-budget", extensionModuleInfo["event-budget"]);

  const moduleOrder: Array<AllModuleKey> = [
    "chat",
    "todo",
    "event",
    "calendar",
    "accounting",
    "document",
    "export",
    "event-budget",
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
              const moduleLink = moduleMap.get(key);
              if (!moduleLink) return null;
              const metadata = MODULE_METADATA[moduleLink.key];
              const isEnabled = enabledSet.has(
                moduleLink.key as AllModuleKey
              );
              const variant = metadata?.variant ?? "default";
              const variantStyles = VARIANT_STYLES[variant];
              const targetHref =
                session && isEnabled
                  ? moduleLink.href
                  : session
                  ? undefined
                  : "/join";
              return (
                <div
                  key={moduleLink.key}
                  className={`rounded-2xl border p-5 shadow-sm flex h-full min-h-[260px] flex-col justify-between ${variantStyles.border}`}
                >
                  <div>
                    <p
                      className={`text-xs uppercase tracking-wide ${variantStyles.label}`}
                    >
                      {moduleLink.label}
                      <span className="ml-2 text-[0.65rem] text-zinc-400">
                        {isEnabled
                          ? "MODULE ENABLED"
                          : session
                          ? "MODULE DISABLED"
                          : "PREVIEW"}
                      </span>
                    </p>
                    {metadata?.badge ? (
                      <p className="mt-1 text-xs font-semibold text-amber-600">
                        {metadata.badge}
                      </p>
                    ) : null}
                    <h3 className="mt-2 text-xl font-semibold text-zinc-900">
                      {moduleLink.label}
                    </h3>
                    <p className="mt-3 text-sm text-zinc-600">
                      {metadata?.description}
                    </p>
                  </div>
                  <div className="mt-6">
                    {targetHref ? (
                      <Link
                        href={targetHref}
                        className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold ${
                          isEnabled && session
                            ? "bg-sky-600 text-white hover:bg-sky-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {isEnabled && session ? "開く" : "Knot へ参加"}
                      </Link>
                    ) : (
                      <span className="inline-flex rounded-full bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-500">
                        無効化中
                      </span>
                    )}
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
