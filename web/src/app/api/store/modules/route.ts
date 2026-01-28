import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";
import {
  MODULE_LINKS,
  AllModuleKey,
  EXTENSION_MODULES,
  SYSTEM_MODULES,
  isExtensionModuleKey,
} from "@/lib/modules";
import { assertWriteRequestSecurity } from "@/lib/security";

const TOGGLEABLE_KEYS: AllModuleKey[] = [
  ...MODULE_LINKS.map((mod) => mod.key).filter(
    (key) => !SYSTEM_MODULES.includes(key)
  ),
  ...EXTENSION_MODULES,
];

function isAllModuleKey(value: string): value is AllModuleKey {
  return (
    MODULE_LINKS.some((module) => module.key === value) ||
    isExtensionModuleKey(value)
  );
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { moduleKey?: string; enable?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!body.moduleKey || !isAllModuleKey(body.moduleKey)) {
    return NextResponse.json({ error: "Unknown module" }, { status: 400 });
  }

  if (!TOGGLEABLE_KEYS.includes(body.moduleKey)) {
    return NextResponse.json(
      { error: "このモジュールは切り替えできません" },
      { status: 400 }
    );
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: {
      role: true,
      group: { select: { id: true, enabledModules: true } },
    },
  });

  if (!member || !member.group) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (member.role !== ROLE_ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Include both core modules and extension modules
  const currentModules = (member.group.enabledModules || []) as string[];
  const modules = new Set(currentModules);

  if (body.enable) {
    modules.add(body.moduleKey);
  } else {
    modules.delete(body.moduleKey);
  }

  const updated = Array.from(modules);
  await prisma.group.update({
    where: { id: member.group.id },
    data: { enabledModules: updated },
  });

  return NextResponse.json({ ok: true, enabledModules: updated });
}
