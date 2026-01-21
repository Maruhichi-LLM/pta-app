import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { KNOT_HOME_PATH } from "./routes";

export const MODULE_LINKS = [
  { key: "event", label: "Knot Event", href: "/events" },
  { key: "calendar", label: "Knot Calendar", href: "/calendar" },
  { key: "accounting", label: "Knot Accounting", href: "/ledger" },
  { key: "management", label: "Knot Management", href: "/management" },
  { key: "chat", label: "Knot Chat", href: "/?module=chat" },
  { key: "todo", label: "Knot ToDo", href: "/?module=todo" },
  { key: "store", label: "Knot Store", href: "/?module=store" },
] as const;

export type ModuleKey = (typeof MODULE_LINKS)[number]["key"];

export const DEFAULT_MODULE_KEYS: ModuleKey[] = MODULE_LINKS.map(
  (module) => module.key
);

export function resolveModules(modules?: string[] | null) {
  if (!modules || modules.length === 0) {
    return DEFAULT_MODULE_KEYS;
  }
  return modules.filter((module): module is ModuleKey =>
    DEFAULT_MODULE_KEYS.includes(module as ModuleKey)
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
