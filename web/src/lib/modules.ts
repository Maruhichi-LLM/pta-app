import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { KNOT_HOME_PATH } from "./routes";

export const MODULE_LINKS = [
  { key: "event", label: "Knot Event", href: "/events" },
  { key: "calendar", label: "Knot Calendar", href: "/calendar" },
  { key: "accounting", label: "Knot Accounting", href: "/accounting" },
  { key: "record", label: "Knot Records", href: "/records" },
  { key: "management", label: "Knot Management", href: "/management" },
  { key: "chat", label: "Knot Chat", href: "/chat" },
  { key: "voting", label: "Knot Voting", href: "/voting" },
  { key: "todo", label: "Knot ToDo", href: "/todo" },
  { key: "document", label: "Knot Document", href: "/documents" },
  { key: "export", label: "Knot Export", href: "/export" },
  { key: "approval", label: "Knot Approval", href: "/approval" },
  { key: "audit", label: "Knot Audit", href: "/audit" },
  { key: "store", label: "Knot Store", href: "/store" },
] as const;

// 拡張機能（ナビゲーションには表示しないが、有効/無効チェックに使用）
export const EXTENSION_MODULES = ["event-budget"] as const;

export type ExtensionModuleKey = (typeof EXTENSION_MODULES)[number];

export const EXTENSION_LINK_INFO: Record<
  ExtensionModuleKey,
  { label: string; href: string }
> = {
  "event-budget": {
    label: "Knot Event Budget Extension",
    href: "/events/budget",
  },
};

export function isExtensionModuleKey(
  value: string
): value is ExtensionModuleKey {
  return EXTENSION_MODULES.includes(value as ExtensionModuleKey);
}

export type AllModuleKey = ModuleKey | ExtensionModuleKey;

export type ModuleKey = (typeof MODULE_LINKS)[number]["key"];

export const DEFAULT_MODULE_KEYS: ModuleKey[] = MODULE_LINKS.map(
  (module) => module.key
);

export const SYSTEM_MODULES: ModuleKey[] = ["store", "management"];

export function resolveModules(modules?: string[] | null) {
  const filteredModules: ModuleKey[] =
    !modules || modules.length === 0
      ? DEFAULT_MODULE_KEYS
      : modules.filter((module): module is ModuleKey =>
          DEFAULT_MODULE_KEYS.includes(module as ModuleKey)
        );

  return Array.from(
    new Set<ModuleKey>([...filteredModules, ...SYSTEM_MODULES])
  );
}

export function filterEnabledModules(enabled: string[] | null | undefined) {
  const resolved = resolveModules(enabled);
  return MODULE_LINKS.filter((module) => resolved.includes(module.key));
}

export async function ensureModuleEnabled(
  groupId: number,
  module: ModuleKey
) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { enabledModules: true },
  });
  const modules = resolveModules(group?.enabledModules);
  if (!modules.includes(module)) {
    redirect(KNOT_HOME_PATH);
  }
}

/**
 * 指定したモジュール（または拡張機能）が有効かチェック
 * UIでの条件分岐に使用
 */
export async function isModuleEnabled(
  groupId: number,
  module: AllModuleKey
): Promise<boolean> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { enabledModules: true },
  });
  if (!group) return false;

  if (SYSTEM_MODULES.includes(module as ModuleKey)) {
    return true;
  }

  return (group.enabledModules || []).includes(module);
}

/**
 * event-budget拡張機能が有効かチェック
 * event-budgetの利用にはeventモジュールが必要
 */
export async function ensureEventBudgetEnabled(groupId: number) {
  await ensureModuleEnabled(groupId, "event");

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { enabledModules: true },
  });

  if (!(group?.enabledModules || []).includes("event-budget")) {
    redirect(KNOT_HOME_PATH);
  }
}
