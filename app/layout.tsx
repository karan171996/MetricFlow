import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MetricFlow",
  description: "Local performance dashboard for your site: New Relic metrics and Sentry errors per page.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
