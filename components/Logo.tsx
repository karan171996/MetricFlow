/** Vitalsly "Pulse V" mark: a heartbeat line whose spike forms a V. Uses currentColor; app/icon.svg is the same shape in mint on the dark tile. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M4 30H16L20 24L24 30L32 50L42 12L46 30H60" />
    </svg>
  );
}
