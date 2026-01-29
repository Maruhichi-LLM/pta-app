import Link from "next/link";
import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
  ROLE_ADMIN,
  ROLE_ACCOUNTANT,
  ROLE_AUDITOR,
  ROLE_MEMBER,
} from "@/lib/roles";
import { ensureModuleEnabled } from "@/lib/modules";
import { GroupAvatar } from "@/components/group-avatar";

const ROLE_OPTIONS = [
  ROLE_ADMIN,
  ROLE_ACCOUNTANT,
  ROLE_AUDITOR,
  ROLE_MEMBER,
] as const;

const ROLE_LABELS: Record<string, string> = {
  [ROLE_ADMIN]: "管理者",
  [ROLE_ACCOUNTANT]: "会計担当",
  [ROLE_AUDITOR]: "監査役",
  [ROLE_MEMBER]: "メンバー",
};

const MAX_LOGO_FILE_SIZE = 5 * 1024 * 1024;

function getGroupLogoUploadDir() {
  return path.join(process.cwd(), "public", "uploads", "groups");
}

function generateInviteCodeValue() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function fetchManagementData(groupId: number, memberId: number) {
  const [group, member, members, inviteCodes] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId } }),
    prisma.member.findUnique({ where: { id: memberId } }),
    prisma.member.findMany({
      where: { groupId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.inviteCode.findMany({
      where: { groupId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    group,
    member,
    members,
    inviteCodes,
  };
}

async function requireAdminSession() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
  });
  if (!member || member.role !== ROLE_ADMIN) {
    throw new Error("権限がありません。");
  }
  return { session, member };
}

async function updateGroupProfileAction(formData: FormData) {
  "use server";
  const { session } = await requireAdminSession();
  const name = (formData.get("groupName") as string | null)?.trim();
  const file = formData.get("logo");

  let logoUrl: string | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.type && !file.type.startsWith("image/")) {
      throw new Error("画像ファイルを選択してください。");
    }
    if (file.size > MAX_LOGO_FILE_SIZE) {
      throw new Error("ロゴ画像は5MB以下にしてください。");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name) || "";
    const safeExt = ext.slice(0, 8);
    const fileName = `${session.groupId}-${crypto.randomUUID()}${safeExt}`;
    const uploadDir = getGroupLogoUploadDir();
    await fs.mkdir(uploadDir, { recursive: true });
    const absolutePath = path.join(uploadDir, fileName);
    await fs.writeFile(absolutePath, buffer);
    logoUrl = `/uploads/groups/${fileName}`;
  }

  await prisma.group.update({
    where: { id: session.groupId },
    data: {
      name: name && name.length > 0 ? name : undefined,
      ...(logoUrl ? { logoUrl } : {}),
    },
  });

  revalidatePath("/home");
  revalidatePath("/management");
}

async function createInviteCodeAction(formData: FormData) {
  "use server";
  const { session } = await requireAdminSession();
  const roleInput = (formData.get("role") as string | null) ?? ROLE_MEMBER;
  const role =
    ROLE_OPTIONS.find((candidate) => candidate === roleInput) ?? null;
  const expiresInDays = Number(formData.get("expiresInDays") ?? 0);

  if (!role) {
    throw new Error("不正な権限です。");
  }

  const expiresAt =
    Number.isFinite(expiresInDays) && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  await prisma.$transaction(async (tx) => {
    let codeValue = "";
    do {
      codeValue = generateInviteCodeValue();
    } while (
      await tx.inviteCode.findUnique({
        where: { code: codeValue },
      })
    );

    await tx.inviteCode.create({
      data: {
        groupId: session.groupId,
        code: codeValue,
        role,
        expiresAt,
      },
    });
  });

  revalidatePath("/management");
}

async function updateMemberRoleAction(formData: FormData) {
  "use server";
  const { session } = await requireAdminSession();
  const memberId = Number(formData.get("memberId"));
  const roleInput = (formData.get("role") as string | null) ?? ROLE_MEMBER;
  const role =
    ROLE_OPTIONS.find((candidate) => candidate === roleInput) ?? null;

  if (!Number.isInteger(memberId)) {
    throw new Error("メンバーを選択してください。");
  }
  if (!role) {
    throw new Error("不正な権限です。");
  }

  const member = await prisma.member.findFirst({
    where: { id: memberId, groupId: session.groupId },
  });
  if (!member) {
    throw new Error("メンバーが見つかりません。");
  }

  if (member.role === ROLE_ADMIN && role !== ROLE_ADMIN) {
    const remainingAdmins = await prisma.member.count({
      where: {
        groupId: session.groupId,
        role: ROLE_ADMIN,
        NOT: { id: memberId },
      },
    });
    if (remainingAdmins === 0) {
      throw new Error("少なくとも1人の管理者が必要です。");
    }
  }

  await prisma.member.update({
    where: { id: member.id },
    data: { role },
  });

  revalidatePath("/management");
}

export default async function ManagementPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  await ensureModuleEnabled(session.groupId, "management");

  const data = await fetchManagementData(session.groupId, session.memberId);
  if (!data.group) {
    redirect("/join");
  }

  const canManage = data.member?.role === ROLE_ADMIN;
  const membersList = data.members ?? [];
  const inviteCodes = data.inviteCodes ?? [];
  const formatDateTime = (value?: Date | string | null) => {
    if (!value) {
      return "—";
    }
    const date =
      value instanceof Date ? value : value ? new Date(value) : undefined;
    return date
      ? date.toLocaleString("ja-JP", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "—";
  };

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell flex flex-col gap-8">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <GroupAvatar
              name={data.group.name}
              logoUrl={data.group.logoUrl}
              sizeClassName="h-12 w-12"
            />
            <div>
              <p className="text-sm uppercase tracking-wide text-zinc-500">
                Knot Management
              </p>
              <h1 className="text-3xl font-semibold text-zinc-900">
                団体を支える、裏側の司令塔。
              </h1>
              <p className="mt-2 text-sm text-zinc-600">
                メンバー、権限、団体設定など運営の基盤を管理する。
              </p>
            </div>
          </div>
        </header>

        {canManage ? (
          <>
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">団体情報</h2>
              <p className="mt-2 text-sm text-zinc-600">
                団体ロゴや写真を登録すると、ダッシュボードに表示されます。
              </p>
              <form
                action={updateGroupProfileAction}
                className="mt-4 grid gap-4 md:grid-cols-[auto,1fr]"
              >
                <div className="flex items-center gap-4">
                  <GroupAvatar
                    name={data.group.name}
                    logoUrl={data.group.logoUrl}
                    sizeClassName="h-12 w-12"
                  />
                  <div className="text-sm text-zinc-500">
                    40〜48px の丸型表示になります。
                  </div>
                </div>
                <div className="grid gap-4">
                  <label className="block text-sm text-zinc-600">
                    団体名
                    <input
                      name="groupName"
                      defaultValue={data.group.name}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </label>
                  <label className="block text-sm text-zinc-600">
                    ロゴ画像
                    <input
                      type="file"
                      name="logo"
                      accept="image/*"
                      className="mt-1 w-full rounded-lg border border-dashed border-zinc-300 px-3 py-2"
                    />
                    <span className="mt-1 block text-xs text-zinc-500">
                      PNG/JPG/WebP 推奨、5MBまで。
                    </span>
                  </label>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                    >
                      団体情報を保存
                    </button>
                  </div>
                </div>
              </form>
            </section>
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                メンバー招待
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                発行したコードを共有すると、新しいメンバーが参加できます。
              </p>
              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <form
                  action={createInviteCodeAction}
                  className="space-y-4 rounded-xl border border-dashed border-zinc-300 p-4"
                >
                  <label className="block text-sm text-zinc-600">
                    付与する権限
                    <select
                      name="role"
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      defaultValue={ROLE_MEMBER}
                    >
                      {ROLE_OPTIONS.map((roleValue) => (
                        <option key={roleValue} value={roleValue}>
                          {ROLE_LABELS[roleValue] ?? roleValue}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-zinc-600">
                    有効期限（日）
                    <input
                      type="number"
                      name="expiresInDays"
                      min={0}
                      defaultValue={14}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <span className="mt-1 block text-xs text-zinc-500">
                      0 を入力すると期限なしになります。
                    </span>
                  </label>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                  >
                    招待コードを発行
                  </button>
                </form>
                <div>
                  <p className="text-sm text-zinc-500">発行済みコード</p>
                  {inviteCodes.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                      まだ招待コードがありません。
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-zinc-50">
                      {inviteCodes.map((invite) => (
                        <li key={invite.id} className="p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-mono text-base font-semibold text-zinc-900">
                              {invite.code}
                            </p>
                            <span className="text-xs font-semibold text-zinc-500">
                              {ROLE_LABELS[invite.role] ?? invite.role}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {invite.usedAt
                              ? `使用済み: ${formatDateTime(invite.usedAt)}`
                              : `未使用${
                                  invite.expiresAt
                                    ? ` / 期限: ${formatDateTime(
                                        invite.expiresAt
                                      )}`
                                    : ""
                                }`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                メンバーと権限
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                役割を変更すると、該当メンバーの機能アクセス権が更新されます。
              </p>
              <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-2 text-left">メンバー</th>
                      <th className="px-4 py-2 text-left">メール</th>
                      <th className="px-4 py-2 text-left">権限</th>
                    </tr>
                  </thead>
                  <tbody>
                    {membersList.map((memberInfo) => (
                      <tr
                        key={memberInfo.id}
                        className="border-t border-zinc-100 text-zinc-800"
                      >
                        <td className="px-4 py-3 font-semibold">
                          {memberInfo.displayName}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600">
                          {memberInfo.email ?? "メール未登録"}
                        </td>
                        <td className="px-4 py-3">
                          <form
                            action={updateMemberRoleAction}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input
                              type="hidden"
                              name="memberId"
                              value={memberInfo.id}
                            />
                            <select
                              name="role"
                              defaultValue={memberInfo.role}
                              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                            >
                              {ROLE_OPTIONS.map((roleValue) => (
                                <option key={roleValue} value={roleValue}>
                                  {ROLE_LABELS[roleValue] ?? roleValue}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-sky-500 hover:text-sky-600"
                            >
                              更新
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                制度・機能の設定
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                Knot Management では「人」の管理に集中します。会計年度や勘定科目、残高・予算の設定は
                <Link
                  href="/accounting"
                  className="font-semibold text-sky-600 underline"
                >
                  Knot Accounting
                </Link>
                に移動しました。モジュールの有効 / 無効は
                <Link
                  href="/?module=store"
                  className="font-semibold text-sky-600 underline"
                >
                  Knot Store
                </Link>
                で管理してください。
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    会計モジュール
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-zinc-900">
                    Knot Accounting
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    会計年度・承認フロー、勘定科目、現金・口座残高、予算管理などの設定をまとめて扱います。
                  </p>
                  <Link
                    href="/accounting"
                    className="mt-3 inline-flex rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                  >
                    Knot Accounting を開く
                  </Link>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    モジュール管理
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-zinc-900">
                    Knot Store
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    団体で利用するモジュールの ON/OFF や新機能の採用はアプリストア型の Knot Store で行います。
                  </p>
                  <Link
                    href="/?module=store"
                    className="mt-3 inline-flex rounded-full border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                  >
                    Knot Store へ移動
                  </Link>
                </div>
              </div>
            </section>
          </>
        ) : (
          <section className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-6 text-sm text-zinc-600">
            Knot Management は管理者のみが利用できます。権限が必要な場合は団体の管理者に連絡してください。
          </section>
        )}
      </div>
    </div>
  );
}
