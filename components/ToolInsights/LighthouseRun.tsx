"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Status = { state: "idle" | "running" | "error"; done: number; total: number; lastRunAt: string | null; error?: string; target: boolean };

// Quick while a run is going, so "Running x of y" moves; slow otherwise, to notice a run the hourly schedule started.
const pollMs = (s: Status | null) => (s?.state === "running" ? 2000 : 30000);

/** Status line and Run now for Lighthouse runs on the project address. Renders nothing when no address is set. */
export function LighthouseRun() {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lighthouse")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: Status) => { if (!cancelled) { setStatus(b); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [tick]);

  useEffect(() => {
    if (!status?.target) return;
    const t = setTimeout(() => setTick((n) => n + 1), pollMs(status));
    return () => clearTimeout(t);
  }, [status, tick]);

  async function runNow() {
    try {
      const r = await fetch("/api/lighthouse", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error();
      setStatus(await r.json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  if (!status?.target) return null;
  const running = status.state === "running";
  const text = running
    ? (status.total ? `Running ${Math.min(status.done + 1, status.total)} of ${status.total}` : "Finding pages…")
    : status.state === "error"
      ? status.error
      : status.lastRunAt ? `Last run ${new Date(status.lastRunAt).toLocaleString()}` : "Not run yet";

  return (
    <div className="mt-4 flex flex-wrap items-center gap-4">
      <Button type="button" onClick={runNow} disabled={running}>{running ? "Running…" : "Run now"}</Button>
      <span role="status" aria-live="polite" className={`text-sm ${status.state === "error" ? "text-[#f87171]" : "text-gray-400"}`}>{text}</span>
      {failed && <span className="text-sm text-[#f87171]">Could not reach the dashboard server.</span>}
    </div>
  );
}
