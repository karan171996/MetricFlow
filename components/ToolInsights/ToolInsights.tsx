"use client";

import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useMetrics, hasData, NEEDS_NEW_RELIC } from "@/lib/useMetrics";
import { TOOLS, type Tool, type ToolId } from "@/lib/tools";

export function ToolInsights({ tool }: { tool: ToolId }) {
  const { state, retry } = useMetrics();
  const router = useRouter();
  const { label, stats, columns }: Tool = TOOLS[tool];

  if (state.status === "loading") return <Skeleton className="mt-6 h-64 w-full bg-[#2d3748]" />;
  if (state.status === "error") {
    return <EmptyState title="Could not load metrics" reason={state.message} onRetry={retry} />;
  }
  if (!state.configured) {
    return <EmptyState title="Connect your data" reason="Add your New Relic or Sentry keys to see real numbers." href="/setup" cta="Set up keys" />;
  }
  if (!state.tools.includes("new-relic")) return <EmptyState {...NEEDS_NEW_RELIC} />;
  // A failed load shows "Could not load", never zeros.
  if (state.failed.includes(tool)) return <EmptyState title={`Could not load ${label} data`} reason="The request failed. Your other data is unaffected." onRetry={retry} />;
  const live = state.pages.filter(hasData);
  if (!live.length) return <EmptyState />;

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8 mt-4">
        {stats(live).map((s) => (
          <Card key={s.label} className="border-[#2d3748] bg-[#1a202c] shadow-md">
            <CardContent className="p-6">
              <span className="text-sm font-medium text-gray-400">{s.label}</span>
              <div className="mt-4 truncate text-3xl font-bold text-white tracking-tight">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-[#2d3748] bg-[#1a202c] shadow-md flex-1">
        <CardHeader>
          <CardTitle className="text-[18px] font-bold text-white tracking-tight">{label} by Page</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-[#2d3748] overflow-hidden">
            <Table>
              <TableHeader className="bg-[#0f1419]">
                <TableRow className="border-[#2d3748] hover:bg-transparent">
                  <TableHead className="text-gray-400">Page Name</TableHead>
                  <TableHead className="text-gray-400">Path</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.header} className="text-gray-400">{c.header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.pages.map((page) => (
                  <TableRow
                    key={page.slug}
                    className="border-[#2d3748] hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => router.push(`/performance/${page.slug}`)}
                  >
                    <TableCell className="font-medium text-white">{page.name}</TableCell>
                    <TableCell className="text-gray-500 font-mono text-xs">{page.url}</TableCell>
                    {columns.map((c) => (
                      <TableCell key={c.header} className="max-w-[320px] truncate text-gray-400">
                        {hasData(page) ? c.cell(page) : "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
