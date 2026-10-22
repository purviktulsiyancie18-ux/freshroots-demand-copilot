import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ToastProvider } from "@/components/Toast";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Freshroots Demand Copilot",
  description: "Twice-weekly demand planning review for Freshroots — rules compute, AI explains, the planner decides.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value).catch(() => null);
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <ToastProvider>
          <Nav user={session?.name ?? null} />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
