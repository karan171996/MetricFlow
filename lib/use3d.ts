// The one decision every 3D view must ask before it draws (docs/3d.md): is 3D allowed here, and did the
// user ask for it? Pure on purpose, so the rules are unit-testable without a browser.
// The hook that feeds it the real environment is lib/use3dEnabled.ts.

export type Reason3d = "reduced-motion" | "low-cores" | "save-data" | "no-webgl" | "off";

export interface Env3d {
  /** `prefers-reduced-motion: reduce` */
  reducedMotion: boolean;
  /** `navigator.hardwareConcurrency`. Missing or 0 is "unknown", not "low". */
  cores?: number;
  /** `navigator.connection.saveData`. Missing is "not on". */
  saveData?: boolean;
  /** A WebGL context can be created. */
  webgl: boolean;
  /** The user switched 3D on in Settings. */
  userChoice: boolean;
}

export interface Result3d {
  enabled: boolean;
  /** Why it is not enabled. Absent when it is. */
  reason?: Reason3d;
}

/** At or below this many logical cores a device counts as low-power. */
export const LOW_CORES = 2;

/**
 * Limits (accessibility, power, data, no WebGL) always win over the user's choice, so a switch left on
 * in one browser can never force 3D onto a device that cannot or should not draw it. 3D is opt-in:
 * with no limit and no choice the answer is "off" and the 2D view stays the default.
 */
export function evaluate3d(e: Env3d): Result3d {
  if (e.reducedMotion) return { enabled: false, reason: "reduced-motion" };
  if (typeof e.cores === "number" && e.cores > 0 && e.cores <= LOW_CORES) return { enabled: false, reason: "low-cores" };
  if (e.saveData === true) return { enabled: false, reason: "save-data" };
  if (!e.webgl) return { enabled: false, reason: "no-webgl" };
  if (!e.userChoice) return { enabled: false, reason: "off" };
  return { enabled: true };
}

/** True when the device itself rules 3D out, so the Settings switch cannot do anything. */
export const isLimit = (r?: Reason3d): boolean => r !== undefined && r !== "off";

/** Plain-language reason for the Settings help text. */
export function explain3d(r?: Reason3d): string {
  switch (r) {
    case "reduced-motion": return "Unavailable because your system asks for reduced motion.";
    case "low-cores": return "Unavailable on this device: it has too few processor cores for smooth 3D.";
    case "save-data": return "Unavailable because your browser has data saver turned on.";
    case "no-webgl": return "Unavailable because this browser cannot draw WebGL graphics.";
    default: return "Show optional 3D charts where available. Off by default.";
  }
}
