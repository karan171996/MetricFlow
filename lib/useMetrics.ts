"use client";

import { useEffect, useState } from "react";
import type { MetricsPage, MetricsResponse, Sources } from "@/lib/metricsHistory";
import { withNeutralShape } from "@/lib/legacyMetrics";
import type { Capability } from "@/lib/tools";
import { deriveStatus } from "@/lib/thresholds";
import { useThresholds } from "@/lib/useThresholds";

export type MetricsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ({ status: "ready" } & Pick<MetricsResponse, "configured" | "tools" | "failed" | "sources" | "pages" | "project"> & { timestamp?: string });

/** True when a connected tool supplies the capability and its last load worked (a failed load shows "Could not load", never zeros). */
export const provides = (s: { sources: Sources; failed: string[] }, cap: Capability): boolean =>
  s.sources[cap] !== undefined && !s.failed.includes(s.sources[cap]!);

/** EmptyState props when no connected tool lists pages (`sources.pages` is absent). Today that is Sentry-only: pages are listed from New Relic. */
export const NEEDS_NEW_RELIC = {
  title: "Sentry is connected",
  reason: "Pages are listed from New Relic, so there is nothing to show per page yet. Add your New Relic keys to see pages and their errors.",
  href: "/setup#new-relic",
  cta: "Add New Relic keys",
};

/** A page that has never reported has no beacon hit: show "No data yet", never 0ms/Healthy. */
export function hasData(p: MetricsPage): boolean {
  const m = p.metrics;
  return (m.traffic?.count ?? 0) > 0 || (m.loadTime ?? 0) > 0 || (m.errors?.count ?? 0) > 0;
}

export function useMetrics() {
  const [state, setState] = useState<MetricsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/metrics")
      .then(async (res) => {
        const raw = await res.json();
        if (!res.ok) throw new Error(raw.error ?? `HTTP ${res.status}`);
        const body = withNeutralShape(raw);
        if (!cancelled) setState({ status: "ready", configured: body.configured, tools: body.tools, failed: body.failed, sources: body.sources, pages: body.pages, project: body.project, timestamp: body.timestamp });
      })
      .catch((e) => {
        if (!cancelled) setState({ status: "error", message: e instanceof Error ? e.message : "Request failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const thresholds = useThresholds();
  const out: MetricsState =
    state.status === "ready"
      ? { ...state, pages: state.pages.map((p) => ({ ...p, status: deriveStatus(p.metrics, thresholds) })) }
      : state;

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };
  return { state: out, retry };
}
