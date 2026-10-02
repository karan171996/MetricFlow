/** MetricFlow mark: an "M" drawn as a metric line. Uses currentColor; app/icon.svg is the same shape on the mint tile. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M6 23 11 9l5 10 5-10 5 14" />
    </svg>
  );
}
