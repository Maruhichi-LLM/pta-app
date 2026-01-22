import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {
  MODULE_LINKS,
  filterEnabledModules,
  ModuleKey,
  resolveModules,
} from "@/lib/modules";
import { getSessionFromCookies } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "@/components/logout-button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Knot",
  description: "Knot is where everything connects.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchLayoutContext() {
  const session = await getSessionFromCookies();
  let enabledModules = MODULE_LINKS;
  let enabledSet = new Set<ModuleKey>(enabledModules.map((mod) => mod.key));
  if (session) {
    const group = await prisma.group.findUnique({
      where: { id: session.groupId },
      select: { enabledModules: true },
    });
    const resolved = resolveModules(group?.enabledModules);
    enabledSet = new Set(resolved);
    enabledModules = filterEnabledModules(resolved);
  }
  const moduleStates = MODULE_LINKS.map((module) => ({
    ...module,
    enabled: enabledSet.has(module.key as ModuleKey),
  }));
  const moduleMap = new Map(moduleStates.map((module) => [module.key, module]));
  const navOrder: ModuleKey[] = [
    "chat",
    "todo",
    "event",
    "calendar",
    "accounting",
    "document",
    "management",
    "store",
  ];
  const navItems = navOrder
    .map((key) => moduleMap.get(key))
    .filter(
      (
        item
      ): item is { key: string; label: string; href: string; enabled: boolean } =>
        Boolean(item)
    );

  return { session, navItems };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { session, navItems } = await fetchLayoutContext();
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} text-zinc-900 antialiased`}
      >
        <div className="bg-honeycomb" aria-hidden="true" />
        <div className="min-h-screen">
          <header className="border-b border-zinc-200 bg-white">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-lg font-semibold tracking-wide">
                Knot
              </Link>
              <nav className="flex flex-shrink overflow-x-auto whitespace-nowrap gap-4 text-sm font-medium text-zinc-600">
                {navItems.map((item) =>
                  item.enabled ? (
                    <Link
                      key={item.key}
                      href={item.href}
                      className="rounded-full px-3 py-1 transition hover:bg-zinc-100"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      key={item.key}
                      className="rounded-full px-3 py-1 text-zinc-400"
                      aria-disabled="true"
                      title="無効化中のモジュールです"
                    >
                      {item.label}
                    </span>
                  )
                )}
              </nav>
             {session ? (
                <LogoutButton />
              ) : (
                <Link
                  href="/login"
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50"
                >
                  ログイン
                </Link>
              )}
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
