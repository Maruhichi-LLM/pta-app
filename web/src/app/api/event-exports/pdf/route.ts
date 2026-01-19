import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";
import PDFDocument from "pdfkit";

function formatDate(value: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(value);
}

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    include: { group: true },
  });

  if (!member || member.role !== ROLE_ADMIN || !member.group) {
    return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
  }

  const events = await prisma.event.findMany({
    where: { groupId: member.groupId },
    include: {
      attendances: {
        include: { member: true },
        orderBy: { respondedAt: "desc" },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(`${member.group.name} イベント出欠`, { align: "center" });
    doc.moveDown();

    if (events.length === 0) {
      doc.fontSize(12).text("登録されたイベントはありません。");
    } else {
      events.forEach((event, index) => {
        if (index > 0) doc.addPage();
        doc
          .fontSize(14)
          .text(event.title, { underline: true })
          .moveDown(0.3);
        doc.fontSize(12).text(`日時: ${formatDate(event.startsAt)}${event.endsAt ? ` 〜 ${formatDate(event.endsAt)}` : ""}`);
        if (event.location) {
          doc.text(`場所: ${event.location}`);
        }
        if (event.description) {
          doc.moveDown(0.5).text(event.description);
        }
        doc.moveDown();

        const counts = {
          YES: event.attendances.filter((a) => a.status === "YES").length,
          NO: event.attendances.filter((a) => a.status === "NO").length,
          MAYBE: event.attendances.filter((a) => a.status === "MAYBE").length,
        };
        doc.text(`参加: ${counts.YES}名　未定: ${counts.MAYBE}名　不参加: ${counts.NO}名`).moveDown();

        doc.fontSize(12).text("参加状況", { underline: true }).moveDown(0.5);
        if (event.attendances.length === 0) {
          doc.text("出欠の回答はありません。");
        } else {
          event.attendances.forEach((attendance) => {
            doc.text(
              `${formatDate(attendance.respondedAt)} - ${attendance.member.displayName} : ${attendance.status}${attendance.comment ? `（${attendance.comment}）` : ""}`
            );
          });
        }
      });
    }

    doc.end();
  });

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="events.pdf"',
    },
  });
}
