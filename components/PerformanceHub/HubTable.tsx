"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleDashed, OctagonAlert, TriangleAlert } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isSampled } from "@/lib/dashboardTransforms";
import type { MetricsPage } from "@/lib/metricsHistory";
import { TOOLS, isToolId, type Capability } from "@/lib/tools";
import { formatDuration } from "@/lib/formatDuration";
import { breachReasons, hasData, hasPerformance, limitLabel, metricStatus, rankPages, type Thresholds } from "@/lib/thresholds";
import type { PageStatus } from "@/types";

/** The table's heading. The breach banner moves focus here after Dismiss. */
export const HUB_TABLE_TITLE_ID = "pages-table-title";

type Has = (cap: Capability) => boolean;
const isOver = (status?: PageStatus) => status === "Warning" || status === "Critical";

// Shape and word carry the status; colour is on the icon, border and tint only (the word stays white).
const STATUS: Record<PageStatus, { Icon: typeof CircleCheck; icon: string; badge: string }> = {
  Critical: { Icon: OctagonAlert, icon: "text-dash-danger", badge: "border-dash-danger/40 bg-dash-danger/10" },
  Warning: { Icon: TriangleAlert, icon: "text-dash-warning", badge: "border-dash-warning/40 bg-dash-warning/10" },
  Healthy: { Icon: CircleCheck, icon: "text-dash-success", badge: "border-dash-success/40 bg-dash-success/10" },
};
const NO_STATUS = { Icon: CircleDashed, icon: "text-dash-muted", badge: "border-dash-border-light" };
const FOCUS_RING = "rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const TEXT_LINK = `font-medium text-dash-foreground underline underline-offset-4 hover:text-dash-muted-light ${FOCUS_RING}`;
// Every column but Page and Status is for lg and up; below that the Page cell carries a one-line summary instead.
const NUMERIC = "hidden px-3 text-right tabular-nums lg:table-cell";

/** Icon and word for a page's status. `page.status` must be the judged one (`deriveStatus`), never the server's. */
export function StatusBadge({ page }: { page: MetricsPage }) {
  const word = page.status ?? (hasData(page) ? "No performance data" : "No data yet");
  const { Icon, icon, badge } = page.status ? STATUS[page.status] : NO_STATUS;
  return (
    <Badge variant="outline" data-status={word} className={`text-dash-foreground ${badge}`}>
      <Icon aria-hidden="true" className={icon} />
      {word}
    </Badge>
  );
}

function NumericHead({ label, caption }: { label: string; caption?: string }) {
  return (
    <TableHead scope="col" className={`${NUMERIC} h-12 text-dash-muted`}>
      {label}
      {caption && <span className="block text-body-sm">{caption}</span>}
    </TableHead>
  );
}

/** A number in its column. `status` is the cell's own `metricStatus`: over its limit gets an icon, white heavier text and hidden "over limit". */
function NumericCell({ status, children }: { status?: PageStatus; children: ReactNode }) {
  const Icon = status === "Critical" ? OctagonAlert : TriangleAlert;
  return (
    <TableCell data-over-limit={isOver(status) || undefined} className={`${NUMERIC} ${isOver(status) ? "font-semibold text-dash-foreground" : "text-dash-muted"}`}>
      {isOver(status) && <Icon aria-hidden="true" className={`mr-1 inline size-3.5 align-[-2px] ${status === "Critical" ? "text-dash-danger" : "text-dash-warning"}`} />}
      {children}
      {isOver(status) && <span className="sr-only"> over limit</span>}
    </TableCell>
  );
}

/** Below lg the number columns are hidden: a breaching page shows why, any other page the values it has, a page with no data nothing. */
function smallScreenLine(page: MetricsPage, has: Has, t: Thresholds): string {
  if (!hasData(page)) return "";
  if (isOver(page.status)) {
    const reasons = breachReasons(page, t).join(", ");
    return reasons.charAt(0).toUpperCase() + reasons.slice(1);
  }
  const m = page.metrics;
  const measured = hasPerformance(page);
  return [
    measured && has("loadTime") && m.loadTime !== undefined && `Load ${formatDuration(m.loadTime)}`,
    measured && has("errorRate") && m.errorRate !== undefined && `Errors ${m.errorRate.toFixed(2)}%`,
    measured && has("apdex") && m.apdex !== undefined && `Apdex ${m.apdex.toFixed(2)}`,
    has("errors") && m.errors && `${m.errors.count} Sentry ${m.errors.count === 1 ? "error" : "errors"}`,
  ].filter(Boolean).join(" · ");
}

/** One line under the title: how many pages are over a limit, or why nothing is judged. Counts come from the same rule as the rows. */
function Summary({ rows, has, failed }: { rows: MetricsPage[]; has: Has; failed: string[] }) {
  const total = rows.length;
  const over = rows.filter((p) => isOver(p.status)).length;
  const judged = rows.filter((p) => p.status).length;
  const noData = rows.filter((p) => !hasData(p)).length;
  const failedTools = failed.filter(isToolId).map((id) => TOOLS[id].label);

  let main: ReactNode = null;
  let suffix = noData === 0 ? "" : noData === 1 ? "1 has no data yet." : `${noData} have no data yet.`;
  if (over) {
    main = total === 1 ? "This page is over a limit." : over === 1 ? `1 of ${total} pages is over a limit.` : `${over} of ${total} pages are over a limit. Worst first.`;
  } else if (judged) {
    // "All" only when every page was judged: a page with no data or no performance numbers is not "within your limits".
    const text = total === 1 ? "This page is within your limits."
      : judged === total ? `All ${total} pages are within your limits. Closest to a limit first.`
      : judged === 1 ? `1 of ${total} pages is within your limits.`
      : `${judged} of ${total} pages are within your limits. Closest to a limit first.`;
    main = <><CircleCheck aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px] text-dash-success" />{text}</>;
  } else if (failedTools.length) {
    main = `Could not load ${failedTools.join(" and ")} data, so pages are not checked against your limits.`;
    suffix = ""; // a page whose numbers failed to load is not a page with "no data yet"
  } else if (!has("loadTime")) {
    main = <>Ranked by Sentry errors in the last 24h. <Link href="/setup" className={TEXT_LINK}>Connect New Relic</Link> to check load time and error rate against your limits.</>;
  }
  // Pages are judged, but one tool's numbers are missing (in practice Sentry down, New Relic up): say so, as the header does.
  if (judged && failedTools.length) suffix = [suffix, `Could not load ${failedTools.join(" and ")} data.`].filter(Boolean).join(" ");
  if (!main && !suffix) return null;
  return <p data-slot="table-summary" className="text-body text-dash-muted">{main}{main && suffix && " "}{suffix}</p>;
}

/**
 * The one page table: "Fix first" on home (first `limit` rows) and "All pages" on /performance (every row).
 * Rows are ranked worst first by `rankPages`; there is deliberately no sort or filter.
 */
export function HubTable({ title, pages, has, thresholds, failed = [], limit }: {
  title: string;
  pages: MetricsPage[];
  has: Has;
  thresholds: Thresholds;
  /** Connected tools whose last load failed. */
  failed?: string[];
  /** Show only the first rows, with a link to the full list on /performance. */
  limit?: number;
}) {
  const router = useRouter();
  const rows = rankPages(pages, thresholds);
  // No page has a status unless every input of deriveStatus is provided; then there is no column either.
  const hasStatus = rows.some((p) => p.status);

  return (
    <Card className="bg-dash-card text-dash-foreground">
      <CardHeader>
        <h2 id={HUB_TABLE_TITLE_ID} tabIndex={-1} className={`title-enter w-fit text-h3 text-dash-foreground ${FOCUS_RING}`}>{title}</h2>
        <Summary rows={rows} has={has} failed={failed} />
      </CardHeader>
      <CardContent>
        <Table>
          <caption className="sr-only">Pages ranked worst first</caption>
          <TableHeader>
            <TableRow className="border-dash-border hover:bg-transparent">
              <TableHead scope="col" className="h-12 px-3 text-dash-muted">Page</TableHead>
              {hasStatus && <TableHead scope="col" className="h-12 px-3 text-dash-muted">Status</TableHead>}
              {has("loadTime") && <NumericHead label="Load time" caption={limitLabel("loadTime", thresholds)} />}
              {has("errorRate") && <NumericHead label="Error rate" caption={limitLabel("errorRate", thresholds)} />}
              {has("apdex") && <NumericHead label="Apdex" caption={limitLabel("apdex", thresholds)} />}
              {has("errors") && <NumericHead label="Sentry errors" caption="last 24h, no limit" />}
              {has("traffic") && <NumericHead label={isSampled(pages) ? "Page loads (sampled)" : "Views (24h)"} />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, limit).map((page) => {
              const live = hasData(page);
              // Without a view or a load time, New Relic's numbers for the page are unmeasured zeros: shown as "—".
              const measured = hasPerformance(page);
              const m = page.metrics;
              const href = `/performance/${page.slug}`;
              const line = smallScreenLine(page, has, thresholds);
              return (
                <TableRow
                  key={page.slug}
                  data-slug={page.slug}
                  className="h-14 cursor-pointer border-dash-border hover:bg-white/5 focus-within:bg-white/5 lg:h-12"
                  // The whole row is the pointer target; the link inside is the one tab stop and handles its own clicks.
                  onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) router.push(href); }}
                >
                  {/* max-w-0 + w-full lets this cell shrink and truncate instead of pushing the table sideways. */}
                  <th scope="row" data-slot="table-cell" className="w-full max-w-0 px-3 py-2 text-left align-middle font-normal">
                    <Link href={href} title={page.name} className={`block truncate text-body font-medium text-dash-foreground ${FOCUS_RING}`}>
                      {page.name}
                      <span className="sr-only">, view page details</span>
                    </Link>
                    <span title={page.url} className="block truncate font-mono text-body-sm text-dash-muted">{page.url}</span>
                    {line && <span data-slot="row-summary" className="mt-0.5 block text-body-sm text-dash-muted lg:hidden">{line}</span>}
                  </th>
                  {hasStatus && <TableCell className="px-3"><StatusBadge page={page} /></TableCell>}
                  {/* A value that is not there is "—", never 0. */}
                  {has("loadTime") && (
                    <NumericCell status={measured ? metricStatus("loadTime", m.loadTime, thresholds) : undefined}>
                      {measured && m.loadTime !== undefined ? formatDuration(m.loadTime) : "—"}
                    </NumericCell>
                  )}
                  {has("errorRate") && (
                    <NumericCell status={measured ? metricStatus("errorRate", m.errorRate, thresholds) : undefined}>
                      {measured && m.errorRate !== undefined ? `${m.errorRate.toFixed(2)}%` : "—"}
                    </NumericCell>
                  )}
                  {has("apdex") && (
                    <NumericCell status={measured ? metricStatus("apdex", m.apdex, thresholds) : undefined}>
                      {measured && m.apdex !== undefined ? m.apdex.toFixed(2) : "—"}
                    </NumericCell>
                  )}
                  {/* No limit on these two, so never a status colour. */}
                  {has("errors") && <NumericCell>{live && m.errors ? m.errors.count : "—"}</NumericCell>}
                  {has("traffic") && <NumericCell>{live && m.traffic ? page.visitors : "—"}</NumericCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {limit !== undefined && rows.length > limit && (
          <Link href="/performance" className={`mt-2 inline-flex min-h-11 items-center px-3 text-body md:min-h-8 ${TEXT_LINK}`}>
            View all {rows.length} pages
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
