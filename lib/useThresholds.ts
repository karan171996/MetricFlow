"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/thresholds";

const KEY = "perf-thresholds";
const listeners = new Set<() => void>();
let cache: Thresholds | null = null;

/** Defaults first; any stored value that isn't a finite number (null, NaN, old formats) falls back to the default. */
function merge(raw: Record<string, unknown> | null): Thresholds {
  const out = { ...DEFAULT_THRESHOLDS };
  for (const k of Object.keys(out) as (keyof Thresholds)[]) {
    const v = raw?.[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function read(): Thresholds {
  if (cache) return cache;
  try {
    cache = merge(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    cache = DEFAULT_THRESHOLDS;
  }
  return cache!;
}

function apply(next: Thresholds) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

/** Updates instantly in this browser, then saves to the server so everyone shares it. */
export function setThresholds(patch: Partial<Thresholds>) {
  apply({ ...read(), ...patch });
  fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => {}); // ponytail: no retry/error toast; add if save failures matter
}

let synced = false;
/** Server copy is the source of truth; localStorage is only the instant-paint cache. */
function syncFromServer() {
  if (synced) return;
  synced = true;
  fetch("/api/settings")
    .then((r) => (r.ok ? r.json() : null))
    .then((t) => t && apply(merge(t)))
    .catch(() => {
      synced = false;
    });
}

function onStorage(e: StorageEvent) {
  if (e.key !== KEY) return;
  cache = null;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  syncFromServer();
  window.addEventListener("storage", onStorage); // other tabs
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useThresholds(): Thresholds {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_THRESHOLDS);
}
