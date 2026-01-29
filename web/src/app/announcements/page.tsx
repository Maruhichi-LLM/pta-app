import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { GroupAvatar } from "@/components/group-avatar";

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function AnnouncementsPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  const [group, announcements] = await Promise.all([
    prisma.group.findUnique({
      where: { id: session.groupId },
      select: { name: true, logoUrl: true },
    }),
    prisma.groupAnnouncement.findMany({
      where: { groupId: session.groupId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, content: true, updatedAt: true },
    }),
  ]);

  if (!group) {
    redirect("/join");
  }

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell space-y-8">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <GroupAvatar
              name={group.name}
              logoUrl={group.logoUrl}
              sizeClassName="h-12 w-12"
            />
            <div>
              <p className="text-sm uppercase tracking-wide text-sky-600">
                Knot Announcement
              </p>
              <h1 className="text-3xl font-semibold text-zinc-900">
                団体からの最新連絡
              </h1>
              <p className="mt-2 text-sm text-zinc-600">
                管理者が全員に共有したお知らせをまとめて確認できます。
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-white bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-900">お知らせ一覧</h2>
            <span className="text-xs text-zinc-500">
              {announcements.length} 件
            </span>
          </div>
          <div className="mt-4 space-y-4">
            {announcements.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
                まだお知らせはありません。
              </div>
            ) : (
              announcements.map((announcement) => (
                <article
                  key={announcement.id}
                  id={`announcement-${announcement.id}`}
                  className="rounded-xl border border-zinc-100 bg-zinc-50 p-4"
                >
                  <p className="text-xs text-zinc-500">
                    {dateTimeFormatter.format(announcement.updatedAt)}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-zinc-900">
                    {announcement.title}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
                    {announcement.content}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
