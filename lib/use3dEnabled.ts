"use client";

// use3dEnabled(): the hook every 3D view uses. The decision itself is lib/use3d.ts; this reads the real
// browser (reduced motion, cores, data saver, WebGL) and the user's saved choice.
// The first render is always "off" (server and hydration agree), then it settles on the client.

import { useSyncExternalStore } from "react";
import { evaluate3d, type Result3d } from "./use3d";

const KEY = "metricflow:3d";

export interface Use3d extends Result3d {
  /** What the Settings switch is set to, whatever the device allows. */
  userChoice: boolean;
}

const SERVER: Use3d = { enabled: false, reason: "off", userChoice: false };
const listeners = new Set<() => void>();
let cache: Use3d | null = null;
let webgl: boolean | null = null;
let memoryChoice = false; // used when localStorage is unavailable (private window, blocked site data)

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

function read(): Use3d {
  if (cache) return cache;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  const userChoice = readChoice();
  const result = evaluate3d({
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    cores: nav.hardwareConcurrency,
    saveData: nav.connection?.saveData === true,
    webgl: hasWebgl(),
    userChoice,
  });
  return (cache = { ...result, userChoice });
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

export function use3dEnabled(): Use3d {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}
