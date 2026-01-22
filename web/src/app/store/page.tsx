import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";
import {
  MODULE_LINKS,
  ModuleKey,
  filterEnabledModules,
} from "@/lib/modules";
import { MODULE_METADATA } from "@/lib/module-metadata";
import {
  ModuleStoreGrid,
  StoreEntry,
} from "@/components/module-store-grid";

const moduleLabelMap = new Map(
  MODULE_LINKS.map((module) => [module.key, module.label])
);

const STORE_DISPLAY_ORDER: ModuleKey[] = [
  "chat",
  "todo",
  "event",
  "calendar",
  "accounting",
  "management",
  "store",
];

const FUTURE_MODULES: StoreEntry[] = [
  {
    key: undefined,
    title: "Knot Approval",
    description:
      "会計の承認ステップを自動化するモジュール。記録と証跡をひとつに結びます。",
    badge: "承認 / Workflow",
    state: "comingSoon",
    toggleable: false,
    note: "βテスト準備中です",
  },
  {
    key: undefined,
    title: "Knot Export",
    description:
      "団体データをCSV/PDFで一括出力し、監査・提出業務を効率化します。",
    badge: "エクスポート / Archive",
    state: "beta",
    toggleable: false,
    note: "β版を順次公開予定",
  },
  {
    key: undefined,
    title: "Knot Insights",
    description:
      "モジュール横断の指標を提示し、団体運営の改善ポイントを可視化します。",
    badge: "分析 / Insight",
    state: "locked",
    toggleable: false,
    note: "有料オプションとして計画中",
  },
];

function buildStoreEntries(): StoreEntry[] {
  const managedEntries: StoreEntry[] = STORE_DISPLAY_ORDER.map((key) => {
    const metadata = MODULE_METADATA[key];
    return {
      key,
      title: moduleLabelMap.get(key) ?? "Knot Module",
      description: metadata?.description ?? "",
      badge: metadata?.badge,
      state: key === "store" ? "system" : "available",
      toggleable: key !== "store",
      note: key === "store" ? "システムモジュールのため常時オン" : undefined,
    };
  });

  return [...managedEntries, ...FUTURE_MODULES];
}

export default async function StorePage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: {
      role: true,
      group: {
        select: { enabledModules: true, name: true },
      },
    },
  });

  if (!member || !member.group) {
    redirect("/join");
  }

  const enabledKeys = filterEnabledModules(
    member.group.enabledModules
  ).map((module) => module.key);
  const isAdmin = member.role === ROLE_ADMIN;
  const entries = buildStoreEntries();

  return (
    <div className="min-h-screen py-12">
      <div className="page-shell space-y-10">
        <section className="rounded-[32px] border border-white/60 bg-white/80 p-8 shadow backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-zinc-500">
                Knot Store
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-zinc-900">
                モジュールのON/OFFを一元管理
              </h1>
              <p className="mt-3 text-sm text-zinc-600">
                Knotに存在するモジュールはすべて表示されます。無効なモジュールも隠さず、
                グレーやロック状態で示します。団体に必要な構成をここで決めましょう。
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
              {isAdmin ? (
                <p>
                  {member.group.name ?? "この団体"} の管理者としてモジュールを
                  ON/OFF できます。
                </p>
              ) : (
                <p>
                  この画面は閲覧専用です。変更が必要な場合は団体管理者へ依頼してください。
                </p>
              )}
            </div>
          </div>
        </section>

        <section>
          <ModuleStoreGrid
            entries={entries}
            enabledKeys={enabledKeys}
            isAdmin={isAdmin}
          />
        </section>
      </div>
    </div>
  );
}
