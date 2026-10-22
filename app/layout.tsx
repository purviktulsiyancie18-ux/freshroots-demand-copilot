import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ToastProvider } from "@/components/Toast";
import { PLANNER_NAME } from "@/lib/user";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Freshroots Demand Copilot",
  description: "Twice-weekly demand planning review for Freshroots — rules compute, AI explains, the planner decides.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <ToastProvider>
          <Nav user={PLANNER_NAME} />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
