import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";

function escapeCsv(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
  });
  if (!member || member.role !== ROLE_ADMIN) {
    return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
  }

  const events = await prisma.event.findMany({
    where: { groupId: member.groupId },
    include: {
      attendances: {
        include: { member: true },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const rows = [
    [
      "Event Title",
      "Start",
      "End",
      "Location",
      "Member",
      "Status",
      "Comment",
      "Responded At",
    ],
  ];

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  });

  for (const event of events) {
    if (event.attendances.length === 0) {
      rows.push([
        event.title,
        formatter.format(event.startsAt),
        event.endsAt ? formatter.format(event.endsAt) : "",
        event.location ?? "",
        "",
        "",
        "",
        "",
      ]);
      continue;
    }
    for (const attendance of event.attendances) {
      rows.push([
        event.title,
        formatter.format(event.startsAt),
        event.endsAt ? formatter.format(event.endsAt) : "",
        event.location ?? "",
        attendance.member.displayName,
        attendance.status,
        attendance.comment ?? "",
        formatter.format(attendance.respondedAt),
      ]);
    }
  }

  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="events.csv"',
    },
  });
}
