// CLI output/formatting. Zero dependencies. Spec: CLI_OUTPUT.md
// Rules: human text -> stdout, errors/progress -> stderr, --json -> one JSON object per line on stdout.

const flags = new Set(process.argv.slice(2));
export const wantsJson = flags.has("--json");
export const wantsHelp = flags.has("--help") || flags.has("-h");
export const wantsVersion = flags.has("--version") || flags.has("-v");

const colorOn = (stream) =>
  !wantsJson &&
  !flags.has("--no-color") &&
  !("NO_COLOR" in process.env && process.env.NO_COLOR !== "") &&
  (process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== "0" : stream.isTTY && process.env.TERM !== "dumb");

const paint = (code, on) => (s) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);
const mk = (stream) => {
  const on = colorOn(stream);
  return { bold: paint(1, on), dim: paint(2, on), red: paint(31, on), green: paint(32, on), yellow: paint(33, on), cyan: paint(36, on) };
};
const c = mk(process.stdout);
const ce = mk(process.stderr);

// Symbols fall back to ASCII on legacy Windows consoles.
const unicode = process.platform !== "win32" || !!process.env.WT_SESSION;
const sym = unicode ? { ok: "✔", warn: "⚠", err: "✖", info: "ℹ" } : { ok: "ok", warn: "!", err: "x", info: "i" };

const json = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

export const out = {
  ok: (msg, data = {}) => (wantsJson ? json({ event: "ok", message: msg, ...data }) : console.log(`${c.green(sym.ok)} ${msg}`)),
  info: (msg, data = {}) => (wantsJson ? json({ event: "info", message: msg, ...data }) : console.log(`${c.cyan(sym.info)} ${msg}`)),
  warn: (msg, data = {}) => (wantsJson ? json({ event: "warn", message: msg, ...data }) : console.error(`${ce.yellow(sym.warn)} ${msg}`)),

  // error: what failed, then an optional "how to fix" line. code feeds --json consumers.
  error(msg, { hint, code = "error" } = {}) {
    if (wantsJson) json({ event: "error", code, message: msg, ...(hint && { hint }) });
    else console.error(`${ce.red(sym.err)} ${ce.bold(msg)}${hint ? `\n  ${ce.dim("→")} ${hint}` : ""}`);
  },

  // Aligned "label  value" rows. Rows: [[label, value], ...]. data is the --json payload.
  kv(rows, data = {}) {
    if (wantsJson) return json({ event: "summary", ...data });
    const w = Math.max(...rows.map(([k]) => k.length));
    for (const [k, v] of rows) console.log(`  ${c.dim(k.padEnd(w))}  ${v}`);
  },

  // Spinner on a TTY (stderr); one plain line otherwise. Returns stop().
  spinner(msg) {
    if (wantsJson) return () => {};
    if (!process.stderr.isTTY || !colorOn(process.stderr)) {
      console.error(`${msg}...`);
      return () => {};
    }
    const frames = unicode ? "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏" : "-\\|/";
    let i = 0;
    const t = setInterval(() => process.stderr.write(`\r${ce.cyan(frames[i++ % frames.length])} ${msg}`), 80);
    return () => {
      clearInterval(t);
      process.stderr.write("\r\x1b[2K");
    };
  },
};

export const helpText = (version) => `${c.bold("performance-dashboard")} ${c.dim(`v${version}`)}
Start the performance dashboard and open it in your browser.

${c.bold("Usage")}
  performance-dashboard [port] [options]

${c.bold("Options")}
  -h, --help       Show this help
  -v, --version    Show version
  --host <addr>    Address to listen on (default 127.0.0.1, this machine only).
                   --host 0.0.0.0 exposes the dashboard to your network
  --json           Machine-readable output: one JSON object per line
  --no-color       Disable colors (also honors NO_COLOR and non-TTY)

${c.bold("Environment")}
  PORT             Port to listen on (default 3000)
  .env.local, .env in the current folder are loaded (New Relic, Sentry keys)

${c.bold("Examples")}
  performance-dashboard
  performance-dashboard 4000 --no-color
  performance-dashboard --json
`;
