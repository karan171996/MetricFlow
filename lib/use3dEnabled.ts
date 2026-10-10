"use client";

// use3dEnabled(): the hook every 3D view uses. The decision itself is lib/use3d.ts; this reads the real
// browser (reduced motion, cores, data saver, WebGL) and the user's saved choice.
// 3D is ON by default where the device allows it, and the user can switch it off in Settings.
// The first render is always "off" (server and hydration agree), then it settles on the client.

import { useMemo, useSyncExternalStore } from "react";
import { evaluate3d, type Env3d, type Result3d } from "./use3d";

const KEY = "metricflow:3d";

export interface Use3d extends Result3d {
  /** What the Settings switch is set to, whatever the device allows. */
  userChoice: boolean;
  /** False until the browser has been read, so a caller can tell "not known yet" from "off". */
  ready: boolean;
}

export interface Use3dOptions {
  /**
   * Whether this view draws with WebGL. Default true. A CSS 3D view passes false, so a browser
   * without WebGL still gets it; reduced motion, low power and data saver apply either way.
   */
  needsWebgl?: boolean;
}

const OFF: Use3d = { enabled: false, reason: "off", userChoice: false, ready: false };
const listeners = new Set<() => void>();
let cache: Env3d | null = null;
let webgl: boolean | null = null;
let memoryChoice = true; // used when localStorage is unavailable (private window, blocked site data)

function hasWebgl(): boolean {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement("canvas");
    webgl = Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return webgl;
}

function readChoice(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? memoryChoice : v === "1";
  } catch {
    return memoryChoice;
  }
}

/** The browser's facts, cached until something changes, so the snapshot is referentially stable. */
function read(): Env3d {
  if (cache) return cache;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  return (cache = {
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    cores: nav.hardwareConcurrency,
    saveData: nav.connection?.saveData === true,
    webgl: hasWebgl(),
    userChoice: readChoice(),
  });
}

function notify() {
  cache = null;
  listeners.forEach((l) => l());
}

/** Turns 3D on or off for this browser. A device limit still wins; see `evaluate3d`. */
export function setUse3dChoice(on: boolean) {
  memoryChoice = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onStorage = (e: StorageEvent) => e.key === KEY && notify(); // another tab changed it
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", notify);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", notify);
  };
}

export function use3dEnabled({ needsWebgl = true }: Use3dOptions = {}): Use3d {
  const env = useSyncExternalStore(subscribe, read, () => null);
  return useMemo(() => {
    if (!env) return OFF;
    return { ...evaluate3d({ ...env, webgl: needsWebgl ? env.webgl : true }), userChoice: env.userChoice, ready: true };
  }, [env, needsWebgl]);
}
