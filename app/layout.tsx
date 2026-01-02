import type { Metadata } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "Pushup Tracker 2026",
  description: "Track your pushups and compete on the leaderboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white dark:bg-[#1a1a1a]">
        {children}
        <BottomNav />
      </body>
    </html>
  );
}


