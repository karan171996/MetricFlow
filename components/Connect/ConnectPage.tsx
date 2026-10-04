"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BROWSER_SNIPPET, EMIT_SNIPPET, SENTRY_SNIPPET } from "./snippets";

interface Source {
  recent: number | null;
  lastEventAt: string | null;
  error?: string;
}
interface Status {
  error?: string;
  configured: boolean;
  accountId?: string;
  insertKeySet?: boolean;
  browser?: Source;
  custom?: Source;
  sentry?: Source;
}

const POLL_MS = 5000;
const cardCls = "border-[#2d3748] bg-[#1a202c] shadow-md";

function CopyBlock({ n, title, help, code }: { n: number; title: string; help: string; code: string }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  return (
    <Card className={cardCls}>
      <CardHeader>
        <CardTitle className="text-base font-bold text-white">{title}</CardTitle>
        <CardDescription className="text-sm text-gray-400">{help}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <pre tabIndex={0} aria-label={`Code snippet ${n}`} className="overflow-x-auto rounded-md border border-[#2d3748] bg-[#0f1419] p-3 text-xs text-gray-300">{code}</pre>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            aria-label={`Copy snippet ${n}: ${title.replace(/^\d+\. /, "")}`}
            onClick={() => {
              navigator.clipboard.writeText(code).then(
                () => setCopied("ok"),
                () => setCopied("fail")
              );
              setTimeout(() => setCopied(null), 2500);
            }}
          >
            Copy
          </Button>
          <span aria-live="polite" className={`text-sm ${copied === "fail" ? "text-[#f87171]" : "text-[#3ee0a1]"}`}>
            {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed, select the text and copy manually" : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusRow({ label, s }: { label: string; s?: Source }) {
  let text = "Checking…";
  let tone = "text-gray-400";
  if (s?.error) {
    text = s.error;
    tone = "text-[#f87171]";
  } else if (s) {
    const seen = s.recent !== null && s.recent > 0;
    text = seen
      ? `Receiving data${s.lastEventAt ? ` · last event ${new Date(s.lastEventAt).toLocaleTimeString()}` : ""}`
      : s.lastEventAt
        ? `None in the last 5 minutes · last event ${new Date(s.lastEventAt).toLocaleString()}`
        : "None yet";
    tone = seen ? "text-[#3ee0a1]" : "text-[#f59e0b]";
  }
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#2d3748] py-2 last:border-0">
      <span className="text-sm text-gray-300 shrink-0">{label}</span>
      <span className={`min-w-0 break-words text-right text-sm ${tone}`}>{text}</span>
    </div>
  );
}

export function ConnectPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [insertKey, setInsertKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/connect")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function saveInsertKey() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ NEWRELIC_INSERT_KEY: insertKey }),
      });
      const body = await res.json();
      if (body.saved) {
        setInsertKey("");
        setReplacing(false);
        setMsg({ ok: true, text: "Insert key saved." });
        refresh();
      } else {
        setMsg({ ok: false, text: body.error ?? body.results?.NEWRELIC_INSERT_KEY?.error ?? "Could not save the key." });
      }
    } catch {
      setMsg({ ok: false, text: "Could not reach the dashboard server." });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/connect", { method: "POST" });
      const body = await res.json();
      setMsg(body.sent ? { ok: true, text: "Test event sent. It can take up to a minute to show below." } : { ok: false, text: body.error ?? "Failed." });
      refresh();
    } catch {
      setMsg({ ok: false, text: "Could not reach the dashboard server." });
    } finally {
      setBusy(false);
    }
  }

  if (status?.error) {
    return (
      <Card className={cardCls}>
        <CardContent className="p-10 text-center" aria-live="polite">
          <p className="text-sm text-[#f87171]">{status.error}</p>
        </CardContent>
      </Card>
    );
  }

  if (status && !status.configured) {
    return (
      <Card className={cardCls}>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <h3 className="text-lg font-semibold text-white">Set up your keys first</h3>
          <p className="max-w-md text-sm text-gray-400">Add your New Relic and Sentry keys, then come back to connect your site.</p>
          <Link href="/setup" className={buttonVariants()}>Go to setup</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <Card className={cardCls}>
        <CardHeader>
          <CardTitle className="text-base font-bold text-white">Events received (last 5 minutes)</CardTitle>
          <CardDescription className="text-sm text-gray-400">
            {status?.accountId ? <>Querying New Relic account <span className="font-mono text-gray-200">{status.accountId}</span>. </> : null}
            Updates every few seconds. All rows empty? Check this is the account your site sends to.
          </CardDescription>
        </CardHeader>
        <CardContent aria-live="polite">
          <StatusRow label="Browser agent (page views)" s={status?.browser} />
          <StatusRow label="Custom events (emitMetric / test event)" s={status?.custom} />
          <StatusRow label="Sentry errors" s={status?.sentry} />
        </CardContent>
      </Card>

      <Card className={cardCls}>
        <CardHeader>
          <CardTitle className="text-base font-bold text-white">Two different New Relic keys</CardTitle>
          <CardDescription className="text-sm text-gray-400">
            <strong className="text-gray-200">User API key</strong> (set on Setup): lets this dashboard <em>read</em> your data.{" "}
            <strong className="text-gray-200">Ingest - License key</strong> (below): lets a script <em>send</em> events. Only the Insert key is used by the test button. The Browser agent snippet uses a third key, the <strong className="text-gray-200">Ingest - Browser</strong> key. Dashboards for US New Relic accounts only.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {status?.insertKeySet && !replacing ? (
            <p className="text-sm text-[#3ee0a1]">
              ✓ Insert key is set{" "}
              <button type="button" className="ml-2 text-gray-300 underline" onClick={() => setReplacing(true)}>Replace</button>
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="insert-key" className="text-sm font-medium text-gray-300">Insert key · sends test events</label>
              <p id="insert-key-help" className="text-xs text-gray-400">Only needed for the test button and custom events. Different from the User key. Create it as type &quot;Ingest - License&quot;.</p>
              <div className="flex items-center gap-2">
              <Input
                id="insert-key"
                aria-describedby="insert-key-help"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="Ingest - License key"
                value={insertKey}
                onChange={(e) => setInsertKey(e.target.value)}
                className="bg-[#0f1419] border-[#2d3748] text-gray-200 font-mono text-xs"
              />
              <Button onClick={saveInsertKey} disabled={busy || !insertKey.trim()}>Save</Button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-4">
            <Button onClick={sendTest} disabled={busy || !status?.insertKeySet}>Send test event</Button>
            {!status?.insertKeySet && <span className="text-sm text-gray-400">Add an Insert key first</span>}
            {msg && <span aria-live="polite" className={`text-sm ${msg.ok ? "text-[#3ee0a1]" : "text-[#f87171]"}`}>{msg.text}</span>}
          </div>
        </CardContent>
      </Card>

      <Card className={cardCls}>
        <CardContent className="p-4 text-sm text-[#f87171] border-l-2 border-[#f87171]">
          <strong>Snippet 1 runs in the browser, so its key is public.</strong> Use the <strong>Ingest - Browser</strong> key (starts <span className="font-mono">NRJS-</span>), never your <span className="font-mono">NRAK-</span> User key from Setup - that one would hand every visitor full read/write access to your account. The application ID is also not your account ID.
        </CardContent>
      </Card>
      <CopyBlock n={1} title="1. New Relic Browser agent" help="Gives page views, load timing and Core Web Vitals. Create the Browser app in New Relic first (Add data > Browser monitoring) - that is where the NRJS- key and the application ID come from." code={BROWSER_SNIPPET} />
      <CopyBlock n={2} title="2. emitMetric() helper" help="Send your own numbers from your site. Uses the agent from snippet 1, so no key goes in your code." code={EMIT_SNIPPET} />
      <CopyBlock n={3} title="3. Sentry errors" help="Send JavaScript errors to Sentry. Use your project's DSN." code={SENTRY_SNIPPET} />
      <Card className={cardCls}>
        <CardHeader>
          <CardTitle className="text-base font-bold text-white">4. Verify</CardTitle>
          <CardDescription className="text-sm text-gray-400">Reload your site, then watch &quot;Events received&quot; above turn green. Use Send test event to check the custom-event path.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
