"use client";

import { useSyncExternalStore } from "react";

export interface NotificationPrefs {
  alert: boolean;
}

const DEFAULTS: NotificationPrefs = { alert: true };
const KEY = "notification-prefs";
const listeners = new Set<() => void>();
let cache: NotificationPrefs | null = null;

function read(): NotificationPrefs {
  if (cache) return cache;
  const out = { ...DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    for (const k of Object.keys(out) as (keyof NotificationPrefs)[]) if (typeof raw[k] === "boolean") out[k] = raw[k];
  } catch {}
  return (cache = out);
}

export function setNotificationPrefs(patch: Partial<NotificationPrefs>) {
  cache = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {}
  listeners.forEach((l) => l());
}

function onStorage(e: StorageEvent) {
  if (e.key !== KEY) return;
  cache = null;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", onStorage); // other tabs
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useNotificationPrefs(): NotificationPrefs {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}
