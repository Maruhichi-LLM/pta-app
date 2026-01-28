import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { isPlatformAdminEmail } from "@/lib/admin";
import {
  buildSnippet,
  extractSearchTerms,
  SearchEntityType,
} from "@/lib/search-index";
import {
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;

const ALLOWED_TYPES: Record<string, SearchEntityType[]> = {
  CHAT: ["CHAT_MESSAGE", "CHAT_THREAD"],
  CHAT_MESSAGE: ["CHAT_MESSAGE"],
  CHAT_THREAD: ["CHAT_THREAD"],
  TODO: ["TODO"],
  EVENT: ["EVENT"],
  ACCOUNTING: ["LEDGER"],
  LEDGER: ["LEDGER"],
  DOCUMENT: ["DOCUMENT"],
};

function parseTypes(raw: string | null) {
  if (!raw) return null;
  const result = new Set<SearchEntityType>();
  raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .forEach((value) => {
      const mapped = ALLOWED_TYPES[value];
      if (mapped) {
        mapped.forEach((entry) => result.add(entry));
      }
    });
  return result.size > 0 ? Array.from(result) : null;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parsePositiveInt(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET(request: NextRequest) {
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
      action: "search",
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

  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { email: true },
  });
  const isAdmin = isPlatformAdminEmail(member?.email ?? null);

  const groupIdParam = searchParams.get("groupId");
  const groupIdNumber = Number(groupIdParam);
  const groupId =
    isAdmin &&
    groupIdParam &&
    Number.isInteger(groupIdNumber) &&
    groupIdNumber > 0
      ? groupIdNumber
      : session.groupId;

  const types = parseTypes(searchParams.get("types"));
  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"));
  const eventId = parsePositiveInt(searchParams.get("eventId"));
  const threadId = parsePositiveInt(searchParams.get("threadId"));
  const fiscalYear = parsePositiveInt(searchParams.get("fiscalYear"));
  const rawLimit = Number(searchParams.get("limit"));
  const boundedLimit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const safeQuery = q.slice(0, 200);
  const rawTerms = extractSearchTerms(safeQuery);
  const tsQuery = Prisma.sql`websearch_to_tsquery('simple', ${safeQuery})`;
  const likePattern = `%${safeQuery.replace(/[%_]/g, "\\$&")}%`;

  const filters: Prisma.Sql[] = [
    Prisma.sql`"groupId" = ${groupId}`,
    Prisma.sql`("search_vector" @@ ${tsQuery} OR "title" ILIKE ${likePattern} OR "content" ILIKE ${likePattern})`,
  ];

  if (types?.length) {
    filters.push(Prisma.sql`"entityType" IN (${Prisma.join(types)})`);
  }
  if (from) {
    filters.push(Prisma.sql`"occurredAt" >= ${from}`);
  }
  if (to) {
    filters.push(Prisma.sql`"occurredAt" <= ${to}`);
  }
  if (eventId !== null) {
    filters.push(Prisma.sql`"eventId" = ${eventId}`);
  }
  if (threadId !== null) {
    filters.push(Prisma.sql`"threadId" = ${threadId}`);
  }
  if (fiscalYear !== null) {
    filters.push(Prisma.sql`"fiscalYear" = ${fiscalYear}`);
  }

  let whereClause = Prisma.sql``;
  if (filters.length > 0) {
    whereClause = Prisma.sql`WHERE ${filters[0]}`;
    for (let i = 1; i < filters.length; i += 1) {
      whereClause = Prisma.sql`${whereClause} AND ${filters[i]}`;
    }
  }

  type SearchRow = {
    entityType: SearchEntityType;
    entityId: number;
    title: string | null;
    content: string | null;
    urlPath: string;
    threadId: number | null;
    eventId: number | null;
    fiscalYear: number | null;
    occurredAt: Date | null;
    rank: number;
  };

  let rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    SELECT
      "entityType",
      "entityId",
      "title",
      "content",
      "urlPath",
      "threadId",
      "eventId",
      "fiscalYear",
      "occurredAt",
      ts_rank_cd("search_vector", ${tsQuery}) AS "rank"
    FROM "SearchIndex"
    ${whereClause}
    ORDER BY "rank" DESC, "occurredAt" DESC NULLS LAST
    LIMIT ${boundedLimit}
  `);

  const rawCount = rows.length;
  const andFilters: Prisma.SearchIndexWhereInput[] = [];
  if (types?.length) {
    andFilters.push({ entityType: { in: types } });
  }
  if (from || to) {
    andFilters.push({
      occurredAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    });
  }
  if (eventId !== null) {
    andFilters.push({ eventId });
  }
  if (threadId !== null) {
    andFilters.push({ threadId });
  }
  if (fiscalYear !== null) {
    andFilters.push({ fiscalYear });
  }

  const fallbackRows = await prisma.searchIndex.findMany({
    where: {
      groupId,
      AND: andFilters,
      OR: [
        { title: { contains: safeQuery, mode: "insensitive" } },
        { content: { contains: safeQuery, mode: "insensitive" } },
      ],
    },
    orderBy: { occurredAt: "desc" },
    take: boundedLimit,
    select: {
      entityType: true,
      entityId: true,
      title: true,
      content: true,
      urlPath: true,
      threadId: true,
      eventId: true,
      fiscalYear: true,
      occurredAt: true,
    },
  });

  const fallbackCount = fallbackRows.length;
  if (fallbackCount > 0) {
    rows = fallbackRows.map((row) => ({
      ...row,
      entityType: row.entityType as SearchEntityType,
      rank: 0,
    }));
  }

  const terms = rawTerms;

  const results = rows.map((row) => {
    const sourceText = row.content || row.title || "";
    const snippet = sourceText ? buildSnippet(sourceText, safeQuery) : "";
    const highlights = terms.filter((term) =>
      sourceText.toLowerCase().includes(term.toLowerCase())
    );
    return {
      entityType: row.entityType,
      entityId: row.entityId,
      title: row.title,
      snippet,
      urlPath: row.urlPath,
      occurredAt: row.occurredAt,
      highlights,
    };
  });

  const debug = request.nextUrl.searchParams.get("debug") === "1";
  if (debug && process.env.NODE_ENV !== "production") {
    const [total, matchCount, sample] = await Promise.all([
      prisma.searchIndex.count({ where: { groupId } }),
      prisma.searchIndex.count({
        where: {
          groupId,
          OR: [
            { title: { contains: safeQuery, mode: "insensitive" } },
            { content: { contains: safeQuery, mode: "insensitive" } },
          ],
        },
      }),
      prisma.searchIndex.findMany({
        where: { groupId },
        select: {
          entityType: true,
          title: true,
          content: true,
          urlPath: true,
        },
        take: 5,
        orderBy: { occurredAt: "desc" },
      }),
    ]);
    return NextResponse.json({
      results,
      debug: { total, matchCount, rawCount, fallbackCount, safeQuery, sample },
    });
  }

  return NextResponse.json({ results });
}
