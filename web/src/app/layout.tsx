import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MODULE_LINKS, filterEnabledModules } from "@/lib/modules";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSessionFromCookies();
  let enabledModules = MODULE_LINKS;
  if (session) {
    const group = await prisma.group.findUnique({
      where: { id: session.groupId },
      select: { enabledModules: true },
    });
    enabledModules = filterEnabledModules(group?.enabledModules);
  }
  const primaryKeys: ModuleKey[] = ["event", "calendar", "accounting"];
  const primaryModules = primaryKeys
    .map((key) => enabledModules.find((module) => module.key === key))
    .filter(
      (module): module is (typeof enabledModules)[number] => Boolean(module)
    );
  const remainingModules = enabledModules.filter(
    (module) => !primaryKeys.includes(module.key as ModuleKey)
  );

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} text-zinc-900 antialiased`}
      >
        <div className="bg-honeycomb" aria-hidden="true" />
        <div className="min-h-screen">
          <header className="border-b border-zinc-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-lg font-semibold tracking-wide">
                Knot
              </Link>
              <nav className="flex flex-wrap items-center gap-4 text-sm font-medium text-zinc-600">
                {primaryModules.map((module) => (
                  <Link
                    key={module.key}
                    href={module.href}
                    className="rounded-full px-3 py-1 transition hover:bg-zinc-100"
                  >
                    {module.label}
                  </Link>
                ))}
                <Link
                  href="/documents"
                  className="rounded-full px-3 py-1 transition hover:bg-zinc-100"
                >
                  Knot Document
                </Link>
                {remainingModules.map((module) => (
                  <Link
                    key={module.key}
                    href={module.href}
                    className="rounded-full px-3 py-1 transition hover:bg-zinc-100"
                  >
                    {module.label}
                  </Link>
                ))}
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
