"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { METRICS_REFRESH_EVENT } from "@/lib/useMetrics";
import { LIGHTHOUSE_WAIT } from "@/lib/tools";

type Status = { state: "idle" | "running" | "error"; done: number; total: number; lastRunAt: string | null; error?: string; target: boolean };

// Quick while a run is going, so "Running x of y" moves; slow otherwise, to notice a run the hourly schedule started.
const pollMs = (s: Status | null) => (s?.state === "running" ? 2000 : 30000);
const UNREACHABLE = "Could not reach the dashboard server.";
const NO_TARGET = "Set a project address on Setup first.";

/** Status line and Run now for Lighthouse runs on the project address. Renders nothing once it knows no address is set. */
export function LighthouseRun() {
  const [status, setStatus] = useState<Status | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const wasRunning = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lighthouse")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: Status) => { if (!cancelled) { setStatus(b); setProblem(null); } })
      .catch(() => { if (!cancelled) setProblem(UNREACHABLE); });
    return () => { cancelled = true; };
  }, [tick]);

  useEffect(() => {
    // A run just finished: refetch the table now rather than on its next 30s poll.
    const running = status?.state === "running";
    if (wasRunning.current && !running) window.dispatchEvent(new Event(METRICS_REFRESH_EVENT));
    wasRunning.current = running;
    if (!status?.target) return;
    const t = setTimeout(() => setTick((n) => n + 1), pollMs(status));
    return () => clearTimeout(t);
  }, [status, tick]);

  async function runNow() {
    try {
      const r = await fetch("/api/lighthouse", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (r.status === 409) return setProblem(NO_TARGET);
      if (!r.ok) throw new Error();
      setStatus(await r.json());
      setProblem(null);
    } catch {
      setProblem(UNREACHABLE);
    }
  }

  if (status && !status.target) return null;
  const running = status?.state === "running";
  const text = !status
    ? ""
    : running
      ? (status.total ? `Running ${Math.min(status.done + 1, status.total)} of ${status.total}` : "Finding pages…")
      : status.state === "error"
        ? status.error
        : status.lastRunAt ? `Last run ${new Date(status.lastRunAt).toLocaleString()}` : `Not run yet. ${LIGHTHOUSE_WAIT}`;

  // The live region is mounted from the first render, so its first text is announced.
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4">
      {status && <Button type="button" onClick={runNow} disabled={running}>{running ? "Running…" : "Run now"}</Button>}
      <span role="status" aria-live="polite" className={`text-sm ${status?.state === "error" ? "text-[#f87171]" : "text-gray-400"}`}>
        {text}
        {running && <span className="block text-xs text-gray-500">{LIGHTHOUSE_WAIT}</span>}
      </span>
      {problem && <span className="text-sm text-[#f87171]">{problem}</span>}
    </div>
  );
}
