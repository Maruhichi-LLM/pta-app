import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";
import {
  MODULE_LINKS,
  ModuleKey,
  AllModuleKey,
  SYSTEM_MODULES,
} from "@/lib/modules";
import { MODULE_METADATA } from "@/lib/module-metadata";
import {
  ModuleStoreGrid,
  StoreEntry,
} from "@/components/module-store-grid";
import { GroupAvatar } from "@/components/group-avatar";

const moduleLabelMap = new Map(
  MODULE_LINKS.map((module) => [module.key, module.label])
);

const STORE_DISPLAY_ORDER: AllModuleKey[] = [
  "chat",
  "voting",
  "todo",
  "event",
  "event-budget",
  "calendar",
  "accounting",
  "record",
  "document",
  "export",
  "approval",
  "audit",
  "insight",
  "management",
  "store",
];

const EXTENSION_MODULE_METADATA: Record<
  string,
  {
    title: string;
    description: string;
    badge: string;
    note?: string;
  }
> = {
  "event-budget": {
    title: "Knot Event Budget Extension",
    description:
      "イベントごとの収入・支出を個別に管理し、本会計に取り込む拡張機能です。",
    badge: "Event / Extension",
    note: "Knot Eventモジュールの拡張機能です",
  },
};

const FUTURE_MODULES: StoreEntry[] = [];

function buildStoreEntries(): StoreEntry[] {
  const orderedEntries: StoreEntry[] = STORE_DISPLAY_ORDER.map((key) => {
    if (moduleLabelMap.has(key as ModuleKey)) {
      const metadata = MODULE_METADATA[key];
      const isSystemModule = SYSTEM_MODULES.includes(key as ModuleKey);
      return {
        key,
        title: moduleLabelMap.get(key as ModuleKey) ?? "Knot Module",
        description: metadata?.description ?? "",
        badge: metadata?.badge,
        state: isSystemModule ? "system" : "available",
        toggleable: !isSystemModule,
        note: isSystemModule
          ? "システムモジュールのため常時オン"
          : undefined,
      };
    }

    const metadata = EXTENSION_MODULE_METADATA[key];
    return {
      key,
      title: metadata?.title ?? "Extension Module",
      description: metadata?.description ?? "",
      badge: metadata?.badge,
      state: "available",
      toggleable: true,
      note: metadata?.note,
    };
  });

  return [...orderedEntries, ...FUTURE_MODULES];
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
        select: { enabledModules: true, name: true, logoUrl: true },
      },
    },
  });

  if (!member || !member.group) {
    redirect("/join");
  }

  // Include both core modules and extension modules
  const enabledKeys = (member.group.enabledModules || []) as AllModuleKey[];
  const isAdmin = member.role === ROLE_ADMIN;
  const entries = buildStoreEntries();

  return (
    <div className="min-h-screen py-12">
      <div className="page-shell space-y-10">
        <section className="rounded-[32px] border border-white/60 bg-white/80 p-8 shadow backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <GroupAvatar
                name={member.group.name ?? "Knot"}
                logoUrl={member.group.logoUrl}
                sizeClassName="h-12 w-12"
              />
              <div>
                <p className="text-sm uppercase tracking-wide text-zinc-500">
                  Knot Store
                </p>
                <h1 className="mt-1 text-3xl font-semibold text-zinc-900">
                  必要な機能だけ、あとから足す。
                </h1>
                <p className="mt-3 text-sm text-zinc-600">
                  団体に必要なモジュールを選択し、有効・無効を切り替える。
                </p>
              </div>
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
