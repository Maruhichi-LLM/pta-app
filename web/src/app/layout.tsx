import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {
  MODULE_LINKS,
  ModuleKey,
  resolveModules,
} from "@/lib/modules";
import { getSessionFromCookies } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AuthButton } from "@/components/auth-button";
import { GlobalSearch } from "@/components/global-search";

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

async function fetchLayoutContext() {
  const session = await getSessionFromCookies();
  let enabledModules: ModuleKey[] = MODULE_LINKS.map((module) => module.key);
  if (session) {
    const group = await prisma.group.findUnique({
      where: { id: session.groupId },
      select: { enabledModules: true },
    });
    const resolved = resolveModules(group?.enabledModules);
    enabledModules = resolved;
  }
  const enabledSet = new Set<ModuleKey>(enabledModules);

  type NavEntry = {
    key: ModuleKey;
    label: string;
    href: string;
    enabled: boolean;
  };

  const moduleMap = new Map<ModuleKey, NavEntry>(
    MODULE_LINKS.map((module) => [
      module.key,
      {
        key: module.key,
        label: module.label,
        href: module.href,
        enabled: enabledSet.has(module.key),
      },
    ])
  );

  const navOrder: ModuleKey[] = [
    "chat",
    "voting",
    "todo",
    "event",
    "calendar",
    "accounting",
    "record",
    "document",
    "export",
    "approval",
    "audit",
    "management",
    "store",
  ];
  const navItems = navOrder
    .map((key) => moduleMap.get(key))
    .filter((item): item is NavEntry => item !== undefined);

  return { session, navItems };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { session, navItems } = await fetchLayoutContext();
  const navSplitIndex = Math.ceil(navItems.length / 2);
  const navRows = [
    navItems.slice(0, navSplitIndex),
    navItems.slice(navSplitIndex),
  ];
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} text-zinc-900 antialiased`}
      >
        <div className="bg-honeycomb" aria-hidden="true" />
        <div className="min-h-screen">
          <header className="border-b border-zinc-200 bg-white">
            <div className="edge-shell flex items-center gap-4 py-4">
              <Link href="/" className="text-lg font-semibold tracking-wide">
                Knot
              </Link>
              <nav className="flex flex-1 flex-col items-center gap-2 text-sm font-medium text-zinc-600">
                {navRows.map((row, rowIndex) => (
                  <div
                    key={`nav-row-${rowIndex}`}
                    className="flex flex-wrap justify-center gap-3"
                  >
                    {row.map((item) =>
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
                  </div>
                ))}
              </nav>
              {session ? <GlobalSearch /> : null}
              <AuthButton initialSession={Boolean(session)} />
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
