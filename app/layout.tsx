import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ApplicationCvActions from "./application-cv-actions";
import HardRequirementIgnoreActions from "./hard-requirement-ignore-actions";
import JobDataCache from "./job-data-cache";
import NavigationStatePersistence from "./navigation-state-persistence";
import OptimisticDashboardActions from "./optimistic-dashboard-actions";
import PendingApplicationFitScores from "./pending-application-fit-scores";
import PendingApplicationLiveSync from "./pending-application-live-sync";
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
        <JobDataCache />
        {children}
        <VerificationQueueActions />
        <PendingJobVisibility />
        <PendingApplicationLiveSync />
        <OptimisticDashboardActions />
        <ApplicationCvActions />
        <PendingApplicationFitScores />
        <HardRequirementIgnoreActions />
        <NavigationStatePersistence />
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
            href="/cv-knowledge"
            aria-label="打开 CV 个人能力知识库"
            style={{
              borderRadius: 999,
              padding: "11px 16px",
              background: "#65533f",
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 800,
              boxShadow: "0 10px 30px rgba(70,57,42,.20)",
            }}
          >
            ◈ CV 知识库
          </a>
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
            href="/autofill"
            aria-label="打开申请自动填资料页"
            style={{
              borderRadius: 999,
              padding: "11px 16px",
              background: "#2d5f78",
              color: "#fff",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 800,
              boxShadow: "0 10px 30px rgba(45,95,120,.24)",
            }}
          >
            ✦ 申请自动填
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
