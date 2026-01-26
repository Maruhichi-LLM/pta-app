import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

type PersonalEventPayload = {
  title?: string;
  description?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  color?: string;
};

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date;
}

const COLOR_PALETTE = new Set([
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
  "slate",
]);

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  end.setHours(0, 0, 0, 0);

  const events = await prisma.personalEvent.findMany({
    where: {
      memberId: session.memberId,
      startsAt: {
        gte: start,
        lt: end,
      },
    },
    orderBy: { startsAt: "asc" },
  });

  return NextResponse.json({ events });
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

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as PersonalEventPayload;

  const title = body.title?.trim();
  const startsAt = parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);
  const color = body.color?.trim().toLowerCase();

  if (!title || !startsAt) {
    return NextResponse.json(
      { error: "タイトルと開始日時を入力してください。" },
      { status: 400 }
    );
  }

  if (endsAt && endsAt < startsAt) {
    return NextResponse.json(
      { error: "終了日時は開始日時以降を指定してください。" },
      { status: 400 }
    );
  }

  const event = await prisma.personalEvent.create({
    data: {
      memberId: session.memberId,
      title,
      description: body.description?.trim(),
      location: body.location?.trim(),
      startsAt,
      endsAt,
      color: color && COLOR_PALETTE.has(color) ? color : "sky",
    },
  });

  revalidatePath("/calendar");
  return NextResponse.json({ success: true, event });
}
