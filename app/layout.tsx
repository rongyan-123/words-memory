import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "词轮 · Day by day",
  description: "简洁的整组背词列表。语义词组自动准备，中文点击揭晓，程序安排1 / 3 / 7天复习。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
