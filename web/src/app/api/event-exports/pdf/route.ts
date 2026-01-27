import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

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

  try {
    // PDFドキュメント作成
    const pdfDoc = await PDFDocument.create();

    // fontkitを登録
    pdfDoc.registerFontkit(fontkit);

    // 日本語フォントを読み込み
    const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.otf");

    if (!fs.existsSync(fontPath)) {
      return NextResponse.json(
        { error: "フォントファイルが見つかりません。" },
        { status: 500 }
      );
    }

    const fontBytes = fs.readFileSync(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);

    const pageSize: [number, number] = [595, 842];
    const pageWidth = pageSize[0];
    const pageHeight = pageSize[1];
    const margins = { top: 90, bottom: 60, left: 50, right: 50 };
    const tableWidth = pageWidth - margins.left - margins.right;
    const columnBase = [
      { key: "respondedAt", label: "回答日時", width: 140 },
      { key: "member", label: "メンバー", width: 120 },
      { key: "status", label: "ステータス", width: 80 },
    ];
    const usedWidth = columnBase.reduce((sum, col) => sum + col.width, 0);
    const commentWidth = Math.max(tableWidth - usedWidth, 120);
    const attendanceColumns = [
      ...columnBase,
      { key: "comment", label: "コメント", width: commentWidth },
    ];

    let page = pdfDoc.addPage(pageSize);
    let currentY = pageHeight - margins.top;

    const addNewPage = () => {
      page = pdfDoc.addPage(pageSize);
      currentY = pageHeight - margins.top;
    };

    const ensureSpace = (needed: number, onBreak?: () => void) => {
      if (currentY - needed < margins.bottom) {
        addNewPage();
        onBreak?.();
      }
    };

    type AttendanceRow = {
      respondedAt: string;
      member: string;
      status: string;
      comment: string;
    };

    const drawAttendanceTable = (
      rows: AttendanceRow[],
      onPageBreak?: () => void
    ) => {
      if (rows.length === 0) {
        ensureSpace(24, onPageBreak);
        page.drawText("出欠の回答はありません。", {
          x: margins.left,
          y: currentY,
          size: 12,
          font: customFont,
          color: rgb(0.2, 0.2, 0.2),
        });
        currentY -= 24;
        return;
      }

      const headerHeight = 24;
      const rowPadding = 6;
      const lineHeight = 14;
      const textSize = 10;

      const drawHeader = () => {
        ensureSpace(headerHeight + 4, onPageBreak);
        page.drawRectangle({
          x: margins.left,
          y: currentY - headerHeight,
          width: tableWidth,
          height: headerHeight,
          color: rgb(0.93, 0.95, 1),
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 1,
        });

        let columnX = margins.left;
        attendanceColumns.forEach((column, index) => {
          if (index > 0) {
            page.drawLine({
              start: { x: columnX, y: currentY - headerHeight },
              end: { x: columnX, y: currentY },
              thickness: 1,
              color: rgb(0.8, 0.8, 0.8),
            });
          }

          page.drawText(column.label, {
            x: columnX + 6,
            y: currentY - headerHeight + 7,
            size: 11,
            font: customFont,
            color: rgb(0.25, 0.25, 0.25),
          });
          columnX += column.width;
        });
        currentY -= headerHeight;
      };

      const drawRow = (row: AttendanceRow) => {
        const linesPerColumn = attendanceColumns.map((column) => {
          const rawValue = row[column.key as keyof AttendanceRow] ?? "";
          const maxWidth = column.width - rowPadding * 2;
          const lines = wrapText(
            rawValue,
            customFont,
            textSize,
            Math.max(maxWidth, 20)
          );
          return lines.length > 0 ? lines : [""];
        });
        const contentHeight =
          Math.max(...linesPerColumn.map((lines) => lines.length)) *
            lineHeight +
          rowPadding * 2;

        if (currentY - contentHeight < margins.bottom) {
          addNewPage();
          onPageBreak?.();
          drawHeader();
        }

        const rowBottom = currentY - contentHeight;
        page.drawRectangle({
          x: margins.left,
          y: rowBottom,
          width: tableWidth,
          height: contentHeight,
          borderColor: rgb(0.85, 0.85, 0.85),
          borderWidth: 1,
        });

        let columnX = margins.left;
        attendanceColumns.forEach((column, index) => {
          if (index > 0) {
            page.drawLine({
              start: { x: columnX, y: rowBottom },
              end: { x: columnX, y: currentY },
              thickness: 0.8,
              color: rgb(0.85, 0.85, 0.85),
            });
          }

          const lines = linesPerColumn[index];
          let textY = currentY - rowPadding - 10;
          for (const line of lines) {
            page.drawText(line, {
              x: columnX + rowPadding,
              y: textY,
              size: textSize,
              font: customFont,
              color: rgb(0.1, 0.1, 0.1),
            });
            textY -= lineHeight;
          }
          columnX += column.width;
        });

        currentY -= contentHeight;
      };

      drawHeader();
      rows.forEach(drawRow);
      currentY -= 20;
    };

    const drawEventHeader = ({
      event,
      counts,
      includeDescription = true,
      continued = false,
    }: {
      event: (typeof events)[number];
      counts: { YES: number; NO: number; MAYBE: number };
      includeDescription?: boolean;
      continued?: boolean;
    }) => {
      const requiredSpace = includeDescription ? 160 : 110;
      if (currentY < requiredSpace) {
        addNewPage();
      }

      const titleText = continued
        ? `${event.title}（続き）`
        : event.title;
      page.drawText(titleText, {
        x: margins.left,
        y: currentY,
        size: 14,
        font: customFont,
        color: rgb(0, 0, 0),
      });
      currentY -= 25;

      const dateText = `日時: ${formatDate(event.startsAt)}${
        event.endsAt ? ` 〜 ${formatDate(event.endsAt)}` : ""
      }`;
      page.drawText(dateText, {
        x: margins.left,
        y: currentY,
        size: 12,
        font: customFont,
        color: rgb(0.1, 0.1, 0.1),
      });
      currentY -= 18;

      if (event.location) {
        page.drawText(`場所: ${event.location}`, {
          x: margins.left,
          y: currentY,
          size: 12,
          font: customFont,
          color: rgb(0.1, 0.1, 0.1),
        });
        currentY -= 18;
      }

      if (includeDescription && event.description) {
        const descLines = wrapText(
          event.description,
          customFont,
          12,
          tableWidth
        );
        for (const line of descLines) {
          if (currentY < 80) {
            addNewPage();
            page.drawText(`${event.title}（続き）`, {
              x: margins.left,
              y: currentY,
              size: 13,
              font: customFont,
              color: rgb(0, 0, 0),
            });
            currentY -= 22;
          }
          page.drawText(line, {
            x: margins.left,
            y: currentY,
            size: 12,
            font: customFont,
            color: rgb(0.1, 0.1, 0.1),
          });
          currentY -= 16;
        }
      }

      const countText = `参加: ${counts.YES}名　未定: ${counts.MAYBE}名　不参加: ${counts.NO}名`;
      page.drawText(countText, {
        x: margins.left,
        y: currentY,
        size: 12,
        font: customFont,
        color: rgb(0.1, 0.1, 0.1),
      });
      currentY -= 20;

      page.drawText(
        continued ? "参加状況（続き）" : "参加状況",
        {
          x: margins.left,
          y: currentY,
          size: 12,
          font: customFont,
          color: rgb(0.1, 0.1, 0.1),
        }
      );
      currentY -= 18;
    };

    // タイトル
    const title = `${member.group.name} イベント出欠`;
    const titleSize = 18;
    const titleWidth = customFont.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: (pageWidth - titleWidth) / 2,
      y: pageHeight - 100,
      size: titleSize,
      font: customFont,
      color: rgb(0, 0, 0),
    });
    currentY = pageHeight - 140;

    if (events.length === 0) {
      page.drawText("登録されたイベントはありません。", {
        x: margins.left,
        y: currentY,
        size: 12,
        font: customFont,
        color: rgb(0.1, 0.1, 0.1),
      });
    } else {
      const statusLabel: Record<string, string> = {
        YES: "参加",
        NO: "不参加",
        MAYBE: "未定",
      };

      for (const event of events) {
        const counts = {
          YES: event.attendances.filter((a) => a.status === "YES").length,
          NO: event.attendances.filter((a) => a.status === "NO").length,
          MAYBE: event.attendances.filter((a) => a.status === "MAYBE").length,
        };

        drawEventHeader({
          event,
          counts,
          includeDescription: true,
        });

        const rows: AttendanceRow[] = event.attendances.map(
          (attendance) => ({
            respondedAt: formatDate(attendance.respondedAt),
            member: attendance.member.displayName,
            status: statusLabel[attendance.status] ?? attendance.status,
            comment: attendance.comment ?? "",
          })
        );

        drawAttendanceTable(rows, () =>
          drawEventHeader({
            event,
            counts,
            includeDescription: false,
            continued: true,
          })
        );
      }
    }

    // PDFをバイト配列として保存
    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="events.pdf"',
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: "PDFの生成に失敗しました。" },
      { status: 500 }
    );
  }
}

// テキストを指定幅で折り返す関数
function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}
