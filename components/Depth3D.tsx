"use client";

import { useEffect } from "react";
import { use3dEnabled } from "@/lib/use3dEnabled";

// The 3D look is CSS (app/globals.css, under html:not([data-depth="off"])), so it is on from the very first
// paint. This component only does two things: it sets data-depth="off" when the guard says 3D is not
// allowed here (reduced motion, low power, data saver, or the user turned it off in Settings), and it
// gives cards a glare that follows the pointer, plus a small tilt on compact ones. It renders nothing.

const MAX_TILT = 3; // degrees
const MAX_HEIGHT = 360; // px: taller cards (tables, long lists) stay flat so they stay easy to read and click
const TILTABLE = '[data-slot="card"], [data-slot="stat-tile"]';

export function Depth3D() {
  const { enabled, ready } = use3dEnabled({ needsWebgl: false });

  useEffect(() => {
    if (!ready) return; // not read yet: keep the default (on) so nothing flashes
    document.documentElement.dataset.depth = enabled ? "3d" : "off";
  }, [enabled, ready]);

  useEffect(() => {
    if (!enabled || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let current: HTMLElement | null = null;
    let frame = 0;

    const reset = (el: HTMLElement | null) => {
      for (const p of ["--tilt-x", "--tilt-y", "--glare-x", "--glare-y"]) el?.style.removeProperty(p);
    };
    const onMove = (e: PointerEvent) => {
      const card = (e.target as Element | null)?.closest?.(TILTABLE) as HTMLElement | null;
      if (card !== current) {
        reset(current);
        current = card;
      }
      if (!card) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        // The glare follows the pointer on every card; only compact ones also tilt.
        card.style.setProperty("--glare-x", `${((px + 0.5) * 100).toFixed(1)}%`);
        card.style.setProperty("--glare-y", `${((py + 0.5) * 100).toFixed(1)}%`);
        if (card.offsetHeight > MAX_HEIGHT) return;
        card.style.setProperty("--tilt-y", `${(px * MAX_TILT * 2).toFixed(2)}deg`);
        card.style.setProperty("--tilt-x", `${(-py * MAX_TILT * 2).toFixed(2)}deg`);
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      reset(current);
      current = null;
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
      reset(current);
    };
  }, [enabled]);

  return null;
}
