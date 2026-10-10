"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/formatDuration";
import type { MetricsPage } from "@/lib/metricsHistory";
import { hasPerformance, rankPages, type Thresholds } from "@/lib/thresholds";
import { use3dEnabled } from "@/lib/use3dEnabled";

// An isometric skyline of the pages: one tower each, height = load time, colour = status (the same
// judged status as the table), and a glowing plane at the user's load limit, so a tower that rises
// through it is over the limit. Real data only; a page with no performance numbers is not drawn.
// Pure CSS 3D, so it needs no WebGL and adds no library. The table below stays the accessible answer:
// every tower is a link with a text label, and the whole view is dropped for reduced motion, low
// power, data saver, or when the user turns 3D off in Settings (lib/use3dEnabled.ts).

const MAX_TOWERS = 10;
const FOOT = 46; // tower footprint, px
const GAP = 24;
const MIN_H = 16;
const MAX_H = 120; // a tower of this height rises about 100px on screen; the scene box below leaves room for it

// The DESIGN.md status tokens (dash-success / dash-warning / dash-danger), as hex because inline 3D
// styles cannot use utility classes. Status colours only.
const STATUS_COLOUR = { Critical: "#ef4444", Warning: "#f59e0b", Healthy: "#10b981" } as const;
const NO_STATUS = "#64748b";

const shade = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, #05080d)`;

export function PageSkyline({ pages, thresholds }: { pages: MetricsPage[]; thresholds: Thresholds }) {
  const { enabled } = use3dEnabled({ needsWebgl: false });
  const [active, setActive] = useState<string | null>(null);

  const scene = useMemo(() => {
    const towers = rankPages(pages, thresholds).filter(hasPerformance).slice(0, MAX_TOWERS);
    if (towers.length === 0) return null;
    const limitMs = thresholds.loadSeconds * 1000;
    const loads = towers.map((p) => p.metrics.loadTime ?? 0);
    const scale = Math.max(limitMs * 1.5, ...loads);
    const height = (ms: number) => MIN_H + (Math.min(ms, scale) / scale) * MAX_H;
    const cols = Math.ceil(Math.sqrt(towers.length));
    const rows = Math.ceil(towers.length / cols);
    const cell = FOOT + GAP;
    return {
      width: cols * cell + GAP,
      depth: rows * cell + GAP,
      limitMs,
      limitH: height(limitMs),
      towers: towers.map((p, i) => {
        const ms = p.metrics.loadTime ?? 0;
        return {
          page: p,
          ms,
          h: height(ms),
          x: GAP + (i % cols) * cell,
          y: GAP + Math.floor(i / cols) * cell,
          colour: p.status ? STATUS_COLOUR[p.status] : NO_STATUS,
          over: ms > limitMs,
        };
      }),
    };
  }, [pages, thresholds]);

  if (!enabled || !scene) return null;

  const hovered = scene.towers.find((t) => t.page.slug === active);
  const slowest = scene.towers.reduce((a, b) => (b.ms > a.ms ? b : a));
  const limitText = formatDuration(scene.limitMs);

  return (
    <Card data-slot="page-skyline" role="group" aria-label="Page skyline: load time per page" className="hidden overflow-hidden md:block">
      <CardHeader>
        <CardTitle>Page skyline</CardTitle>
        <CardDescription>
          Height is load time. The plane is your {limitText} limit; a tower through it is over. Click a tower to open the page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* 3D content is not clipped by its own box, so this one clips it, and the scene is pushed down to leave headroom for the towers. */}
        <div className="relative flex h-[340px] items-center justify-center overflow-hidden" style={{ perspective: "1100px" }}>
          <div
            className="motion-safe:skyline-sway relative"
            style={{ width: scene.width, height: scene.depth, marginTop: 70, transformStyle: "preserve-3d", transform: "rotateX(58deg) rotateZ(-36deg)" }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-sm border border-white/10"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
                backgroundColor: "rgba(15,20,25,0.6)",
              }}
            />
            {scene.towers.map(({ page, ms, h, x, y, colour, over }) => (
              <Link
                key={page.slug}
                href={`/performance/${page.slug}`}
                aria-label={`${page.name}: load time ${formatDuration(ms)}, limit ${limitText}${page.status ? `, ${page.status}` : ""}`}
                data-slug={page.slug}
                data-status={page.status ?? "none"}
                data-over={over ? "true" : "false"}
                className="skyline-tower"
                style={{ left: x, top: y, width: FOOT, height: FOOT }}
                onPointerEnter={() => setActive(page.slug)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(page.slug)}
                onBlur={() => setActive(null)}
              >
                <span
                  aria-hidden="true"
                  style={{ position: "absolute", left: 0, top: 0, width: FOOT, height: FOOT, transform: `translateZ(${h}px)`, background: colour, boxShadow: `0 0 22px ${colour}66` }}
                />
                <span
                  aria-hidden="true"
                  style={{ position: "absolute", left: 0, top: FOOT, width: FOOT, height: h, transformOrigin: "top", transform: "rotateX(90deg)", background: `linear-gradient(${shade(colour, 78)}, ${shade(colour, 52)})` }}
                />
                <span
                  aria-hidden="true"
                  style={{ position: "absolute", left: FOOT, top: 0, width: h, height: FOOT, transformOrigin: "left", transform: "rotateY(-90deg)", background: `linear-gradient(90deg, ${shade(colour, 58)}, ${shade(colour, 36)})` }}
                />
              </Link>
            ))}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-sm"
              style={{ transform: `translateZ(${scene.limitH}px)`, border: "1px dashed rgba(245,158,11,0.75)", background: "rgba(245,158,11,0.08)", boxShadow: "0 0 24px rgba(245,158,11,0.25)" }}
            />
          </div>
        </div>
        <p className="mt-1 min-h-5 text-center text-sm text-dash-muted" data-slot="skyline-readout">
          {hovered
            ? `${hovered.page.name}: load time ${formatDuration(hovered.ms)} (limit ${limitText})${hovered.page.status ? ` · ${hovered.page.status}` : ""}`
            : `${scene.towers.length} ${scene.towers.length === 1 ? "page" : "pages"} · slowest is ${slowest.page.name} at ${formatDuration(slowest.ms)}`}
        </p>
      </CardContent>
    </Card>
  );
}
