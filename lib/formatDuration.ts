/** Milliseconds -> "850ms", "1.5s", "2m 5s", "1h 5m". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const abs = Math.abs(Math.round(ms));
  if (abs < 1000) return `${Math.round(ms)}ms`;
  if (abs < 59_950) return `${+(ms / 1000).toFixed(1)}s`;
  const sec = Math.round(abs / 1000);
  const sign = ms < 0 ? "-" : "";
  if (sec < 3600) return `${sign}${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${sign}${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}
