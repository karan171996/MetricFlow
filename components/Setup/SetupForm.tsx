"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FIELDS = [
  { name: "NEWRELIC_API_KEY", label: "New Relic User API key", secret: true, help: "READS your data (starts NRAK-). Create it under API keys > key type \"User\"." },
  { name: "NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID", label: "New Relic account ID", secret: false, help: "A plain number, shown next to your keys in New Relic." },
  { name: "SENTRY_API_KEY", label: "Sentry auth token", secret: true, help: "Lets the dashboard read issues (scopes: project:read, event:read)." },
  { name: "SENTRY_ORG_SLUG", label: "Sentry organization slug", secret: false, help: "The name in your Sentry URL: sentry.io/organizations/<slug>/." },
  { name: "SENTRY_PROJECT_ID", label: "Sentry project slug", secret: false, help: "The project's slug from Project settings." },
] as const;

type Result = { ok: true } | { ok: false; error: string };

export function SetupForm() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSet, setIsSet] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((b) => {
        if (b.keys) setIsSet(b.keys);
        else if (b.error) setMessage({ ok: false, text: b.error });
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json();
      const res2: Record<string, Result> = body.results ?? {};
      setResults(res2);
      const firstBad = FIELDS.find((f) => res2[f.name] && !res2[f.name].ok);
      if (firstBad) setTimeout(() => formRef.current?.querySelector<HTMLInputElement>(`#${firstBad.name}`)?.focus(), 0);
      if (body.saved) {
        setSaved(true);
        setValues({});
        setIsSet(Object.fromEntries(FIELDS.map((f) => [f.name, true])));
        setMessage({ ok: true, text: "Saved. Your keys are valid and stored in .env.local. No restart needed." });
      } else {
        setMessage({ ok: false, text: body.error ?? "Nothing was saved. Fix the fields marked below." });
      }
    } catch {
      setMessage({ ok: false, text: "Could not reach the dashboard server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md max-w-2xl">
      <CardHeader>
        <CardTitle className="text-[18px] font-bold text-white tracking-tight">Connect New Relic and Sentry</CardTitle>
        <CardDescription className="text-sm text-gray-400">
          Keys are checked once, saved to .env.local in this folder, and never shown again. The key that sends events
          (Ingest - License) is separate and is added later on the Connect page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={save} className="flex flex-col gap-5">
          {FIELDS.map((f) => {
            const r = results[f.name];
            return (
              <div key={f.name} className="flex flex-col gap-1.5">
                <label htmlFor={f.name} className="text-sm font-medium text-gray-300">
                  {f.label} {isSet[f.name] && <span className="ml-2 text-xs text-[#3ee0a1]">✓ Set</span>}
                </label>
                <Input
                  id={f.name}
                  name={f.name}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={isSet[f.name] ? "•••••••• (leave blank to keep, type to replace)" : ""}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                  aria-invalid={r && !r.ok ? true : undefined}
                  aria-describedby={`${f.name}-help ${f.name}-result`}
                  className="bg-[#0f1419] border-[#2d3748] text-gray-200 font-mono text-xs"
                />
                <p id={`${f.name}-help`} className="text-xs text-gray-400">{f.help}</p>
                <div id={`${f.name}-result`} aria-live="polite">
                  {r && !r.ok && <p className="text-xs text-[#f87171]">✗ {r.error}</p>}
                  {r?.ok && <p className="text-xs text-[#3ee0a1]">✓ Checked</p>}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={busy}>{busy ? "Checking…" : "Check and save"}</Button>
            <span aria-live="polite" className={`text-sm ${message?.ok ? "text-[#3ee0a1]" : "text-[#f87171]"}`}>{message?.text}</span>
            {saved && <Link href="/connect" className={buttonVariants({ variant: "outline" })}>Next: connect your app</Link>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
