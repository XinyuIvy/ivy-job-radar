import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ApplicationCvActions from "./application-cv-actions";
import PendingJobVisibility from "./pending-job-visibility";
import VerificationQueueActions from "./verification-queue-actions";
import "./globals.css";
import "./modal-safe-area.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ivy Job Radar",
  description: "Fresh PhD cross-industry job search and application dashboard.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <VerificationQueueActions />
        <PendingJobVisibility />
        <ApplicationCvActions />
        <div
          style={{
            position: "fixed",
            right: 18,
            bottom: 18,
            zIndex: 120,
            display: "grid",
            gap: 8,
            justifyItems: "end",
          }}
        >
          <a
            href="/screening-learning"
            aria-label="查看筛选学习建议"
            style={{
              borderRadius: 999,
              padding: "11px 16px",
              background: "#18221d",
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 800,
              boxShadow: "0 10px 30px rgba(24,34,29,.22)",
            }}
          >
            ◇ 筛选学习
          </a>
          <a
            href="/bookmarklet"
            aria-label="安装 Chrome 保存岗位书签"
            style={{
              borderRadius: 999,
              padding: "11px 16px",
              background: "#16794b",
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 800,
              boxShadow: "0 10px 30px rgba(22,121,75,.28)",
            }}
          >
            ＋ Chrome 保存岗位
          </a>
        </div>
      </body>
    </html>
  );
}
