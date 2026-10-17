import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Depth3D } from "@/components/Depth3D";

export const metadata: Metadata = {
  title: "MetricFlow",
  description: "Local performance dashboard for your site: New Relic metrics and Sentry errors per page.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Depth3D />
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
