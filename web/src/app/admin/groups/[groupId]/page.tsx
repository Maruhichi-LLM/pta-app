import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin";
import {
  MODULE_LINKS,
  ModuleKey,
  resolveModules,
} from "@/lib/modules";
import { revalidatePath } from "next/cache";
import { ConfirmModuleSubmitButton } from "@/components/confirm-module-submit-button";

type PageProps = {
  params: { groupId: string };
  searchParams?: { saved?: string };
};

const moduleKeys = MODULE_LINKS.map((module) => module.key) as ModuleKey[];

function normalizeSelection(values: FormDataEntryValue[]) {
  const set = new Set(
    values
      .map((value) => String(value))
      .filter((key): key is ModuleKey =>
        moduleKeys.includes(key as ModuleKey)
      )
  );
  return Array.from(set);
}

async function updateGroupAction(formData: FormData) {
  "use server";
  await requirePlatformAdmin();
  const groupId = Number(formData.get("groupId"));
  if (!Number.isInteger(groupId)) {
    throw new Error("Invalid group id");
  }
  const name = (formData.get("name") as string | null)?.trim();
  const modules = normalizeSelection(formData.getAll("enabledModules"));

  await prisma.group.update({
    where: { id: groupId },
    data: {
      name: name && name.length > 0 ? name : undefined,
      enabledModules: modules,
    },
  });

  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${groupId}`);
  redirect(`/admin/groups/${groupId}?saved=1`);
}

export default async function GroupDetailPage({
  params,
  searchParams,
}: PageProps) {
  await requirePlatformAdmin();
  const groupId = Number(params.groupId);
  if (!Number.isInteger(groupId)) {
    notFound();
  }
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      enabledModules: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });
  if (!group) {
    notFound();
  }
  const resolvedModules = resolveModules(group.enabledModules);
  const moduleState = Object.fromEntries(
    MODULE_LINKS.map((module) => [
      module.key,
      resolvedModules.includes(module.key),
    ])
  );
  const saved = searchParams?.saved === "1";

  return (
    <div className="min-h-screen bg-transparent py-10">
      <div className="page-shell">
        <div className="mb-8 space-y-2">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Knot Admin / Groups
          </p>
        <h1 className="text-3xl font-semibold text-zinc-900">
          {group.name}
        </h1>
        <p className="text-sm text-zinc-500">
          ID: <span className="font-mono text-zinc-700">#{group.id}</span> /{" "}
          {group._count.members} members /{" "}
          {group.createdAt.toLocaleDateString("ja-JP")}
        </p>
          {saved ? (
            <p className="rounded-full bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
              保存しました。
            </p>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <form
            action={updateGroupAction}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <input type="hidden" name="groupId" value={group.id} />
            <h2 className="text-lg font-semibold text-zinc-900">
              基本情報とモジュール
            </h2>
            <label className="mt-4 block text-sm text-zinc-600">
              団体名
              <input
                name="name"
                defaultValue={group.name}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>
            <div className="mt-6">
              <p className="text-sm font-semibold text-zinc-700">
                enabledModules
              </p>
              <div className="mt-3 grid gap-3">
                {MODULE_LINKS.map((module) => (
                  <label
                    key={module.key}
                    className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-2"
                  >
                    <input
                      type="checkbox"
                      name="enabledModules"
                      value={module.key}
                      defaultChecked={moduleState[module.key]}
                      className="h-4 w-4 accent-sky-600"
                    />
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        {module.label}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {module.href}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <ConfirmModuleSubmitButton
                originalModules={moduleState}
                criticalKeys={["accounting", "management"]}
                label="変更を保存"
              />
            </div>
          </form>
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-6 text-sm text-zinc-600">
            <p>
              Accounting と Management の ON/OFF は利用団体に大きな影響を与えます。変更するときは団体側と合意のうえ実行してください。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
