"use client";

import { useEffect, useState } from "react";
import type { ToolId } from "@/lib/tools";

/** Connected tools from GET /api/setup (cheap, no New Relic/Sentry call). `null` while loading or if the answer failed. */
export function useConnectedTools(): ToolId[] | null {
  const [tools, setTools] = useState<ToolId[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/setup")
      .then((r) => r.json())
      .then((b) => { if (!cancelled && Array.isArray(b.tools)) setTools(b.tools); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return tools;
}
