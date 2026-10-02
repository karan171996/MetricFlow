"use client";

import { useEffect, useState } from "react";
import type { MetricsPage } from "@/lib/metricsHistory";
import { deriveStatus } from "@/lib/thresholds";
import { useThresholds } from "@/lib/useThresholds";

export type MetricsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; configured: boolean; pages: MetricsPage[] };

/** A page that has never reported has no beacon hit: show "No data yet", never 0ms/Healthy. */
export function hasData(p: MetricsPage): boolean {
  return p.newRelic.throughput > 0 || p.newRelic.loadTime > 0 || p.sentry.errorCount > 0;
}

export function useMetrics() {
  const [state, setState] = useState<MetricsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/metrics")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (!cancelled) setState({ status: "ready", configured: body.configured, pages: body.pages });
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
      ? { ...state, pages: state.pages.map((p) => ({ ...p, status: deriveStatus(p.newRelic, thresholds) })) }
      : state;

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };
  return { state: out, retry };
}
