import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { getSessionFromCookies } from "@/lib/session";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

const MAX_RECEIPT_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function getReceiptUploadDir() {
  return path.join(process.cwd(), "public", "uploads", "receipts");
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { error: CSRF_ERROR_MESSAGE },
      { status: 403 }
    );
  }

  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { limit, windowSec } = getRateLimitRule("write");
  const rate = checkRateLimit({
    key: buildRateLimitKey({
      scope: "write",
      request,
      memberId: session.memberId,
    }),
    limit,
    windowSec,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: RATE_LIMIT_ERROR_MESSAGE },
      {
        status: 429,
        headers: rate.retryAfterSec
          ? { "Retry-After": String(rate.retryAfterSec) }
          : undefined,
      }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "ファイルを選択してください。" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_RECEIPT_FILE_SIZE) {
    return NextResponse.json(
      { error: "ファイルサイズは20MB以下にしてください。" },
      { status: 400 }
    );
  }

  const ext = path.extname(file.name) || "";
  const safeExt = ext.slice(0, 8);
  const fileName = `${session.groupId}-${crypto.randomUUID()}${safeExt}`;
  const uploadDir = getReceiptUploadDir();
  await fs.mkdir(uploadDir, { recursive: true });
  const absolutePath = path.join(uploadDir, fileName);
  await fs.writeFile(absolutePath, buffer);
  const url = `/uploads/receipts/${fileName}`;

  return NextResponse.json({ url, fileName });
}
