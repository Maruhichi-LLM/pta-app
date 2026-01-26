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

    // タイトルページ
    let page = pdfDoc.addPage([595, 842]); // A4サイズ
    const { width, height } = page.getSize();

    // タイトル
    const title = `${member.group.name} イベント出欠`;
    const titleSize = 18;
    const titleWidth = customFont.widthOfTextAtSize(title, titleSize);

    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: height - 100,
      size: titleSize,
      font: customFont,
      color: rgb(0, 0, 0),
    });

    let currentY = height - 150;

    if (events.length === 0) {
      page.drawText("登録されたイベントはありません。", {
        x: 50,
        y: currentY,
        size: 12,
        font: customFont,
        color: rgb(0, 0, 0),
      });
    } else {
      for (let i = 0; i < events.length; i++) {
        const event = events[i];

        // 新しいページが必要な場合
        if (i > 0) {
          page = pdfDoc.addPage([595, 842]);
          currentY = height - 50;
        }

        // イベントタイトル
        page.drawText(event.title, {
          x: 50,
          y: currentY,
          size: 14,
          font: customFont,
          color: rgb(0, 0, 0),
        });
        currentY -= 25;

        // 日時
        const dateText = `日時: ${formatDate(event.startsAt)}${event.endsAt ? ` 〜 ${formatDate(event.endsAt)}` : ""}`;
        page.drawText(dateText, {
          x: 50,
          y: currentY,
          size: 12,
          font: customFont,
          color: rgb(0, 0, 0),
        });
        currentY -= 20;

        // 場所
        if (event.location) {
          page.drawText(`場所: ${event.location}`, {
            x: 50,
            y: currentY,
            size: 12,
            font: customFont,
            color: rgb(0, 0, 0),
          });
          currentY -= 20;
        }

        // 説明
        if (event.description) {
          // 長いテキストを複数行に分割
          const maxWidth = width - 100;
          const descLines = wrapText(event.description, customFont, 12, maxWidth);

          for (const line of descLines) {
            if (currentY < 100) {
              page = pdfDoc.addPage([595, 842]);
              currentY = height - 50;
            }
            page.drawText(line, {
              x: 50,
              y: currentY,
              size: 12,
              font: customFont,
              color: rgb(0, 0, 0),
            });
            currentY -= 20;
          }
        }

        currentY -= 10;

        // 参加状況集計
        const counts = {
          YES: event.attendances.filter((a) => a.status === "YES").length,
          NO: event.attendances.filter((a) => a.status === "NO").length,
          MAYBE: event.attendances.filter((a) => a.status === "MAYBE").length,
        };

        const countText = `参加: ${counts.YES}名　未定: ${counts.MAYBE}名　不参加: ${counts.NO}名`;
        page.drawText(countText, {
          x: 50,
          y: currentY,
          size: 12,
          font: customFont,
          color: rgb(0, 0, 0),
        });
        currentY -= 30;

        // 参加状況リスト
        page.drawText("参加状況", {
          x: 50,
          y: currentY,
          size: 12,
          font: customFont,
          color: rgb(0, 0, 0),
        });
        currentY -= 20;

        if (event.attendances.length === 0) {
          page.drawText("出欠の回答はありません。", {
            x: 50,
            y: currentY,
            size: 12,
            font: customFont,
            color: rgb(0, 0, 0),
          });
          currentY -= 20;
        } else {
          for (const attendance of event.attendances) {
            if (currentY < 50) {
              page = pdfDoc.addPage([595, 842]);
              currentY = height - 50;
            }

            const statusText = attendance.status === "YES" ? "参加" : attendance.status === "MAYBE" ? "未定" : "不参加";
            const attendanceText = `${formatDate(attendance.respondedAt)} - ${attendance.member.displayName} : ${statusText}${attendance.comment ? `（${attendance.comment}）` : ""}`;

            // 長いテキストを複数行に分割
            const maxWidth = width - 100;
            const lines = wrapText(attendanceText, customFont, 12, maxWidth);

            for (const line of lines) {
              if (currentY < 50) {
                page = pdfDoc.addPage([595, 842]);
                currentY = height - 50;
              }
              page.drawText(line, {
                x: 50,
                y: currentY,
                size: 12,
                font: customFont,
                color: rgb(0, 0, 0),
              });
              currentY -= 18;
            }
          }
        }
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
