"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { KEY_FIELDS, TOOLS, TOOL_IDS, type Tool, type ToolId } from "@/lib/tools";

// One field per required key of each tool, in TOOLS order. A tool added to the registry gets its group here with no edit.
const FIELDS = TOOL_IDS.flatMap((tool) => TOOLS[tool].keys.required.map((name) => ({ name, tool, ...KEY_FIELDS[name] })));

type Result = { ok: true; notice?: string } | { ok: false; error: string; notice?: string };

export function SetupForm() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSet, setIsSet] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connected, setConnected] = useState<ToolId[] | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((b) => {
        if (b.keys) setIsSet(b.keys);
        if (Array.isArray(b.tools)) setConnected(b.tools);
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
        // Only the groups that were filled in are now set; an untouched group stays as it was.
        const filled = new Set(FIELDS.filter((f) => values[f.name]?.trim()).map((f) => f.tool));
        setIsSet((prev) => ({ ...prev, ...Object.fromEntries(FIELDS.filter((f) => filled.has(f.tool)).map((f) => [f.name, true])) }));
        const now = TOOL_IDS.filter((id) => filled.has(id) || connected?.includes(id));
        setConnected(now);
        setMessage({ ok: true, text: `Saved. ${now.map((id) => TOOLS[id].label).join(" and ")} ${now.length > 1 ? "are" : "is"} connected. No restart needed.` });
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
        <CardTitle className="text-[18px] font-bold text-white tracking-tight">Connect your tools</CardTitle>
        <CardDescription className="text-sm text-gray-400">
          Add keys for the tools you use. You only need one. Keys are checked once, saved to .env.local in this folder, and never shown again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={save} className="flex flex-col gap-5">
          {TOOL_IDS.map((id) => (
            <fieldset key={id} id={id} className="flex flex-col gap-5 rounded-lg border border-[#2d3748] p-4">
              <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-white">
                {TOOLS[id].label}
                {connected?.includes(id)
                  ? <Badge variant="outline" className="border-[#3ee0a1] text-[#3ee0a1] bg-[#3ee0a1]/10">✓ Connected</Badge>
                  : <Badge variant="outline" className="border-[#4a5568] text-gray-400">Optional</Badge>}
              </legend>
            {FIELDS.filter((f) => f.tool === id).map((f) => {
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
                  {r?.notice && <p className="text-xs text-[#fbbf24]">{r.notice}</p>}
                </div>
              </div>
            );
            })}
              {(TOOLS[id] as Tool).setupNote && <p className="text-xs text-gray-400">{(TOOLS[id] as Tool).setupNote}</p>}
            </fieldset>
          ))}
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={busy || !FIELDS.some((f) => values[f.name]?.trim())}>{busy ? "Checking…" : "Check and save"}</Button>
            <span aria-live="polite" className={`text-sm ${message?.ok ? "text-[#3ee0a1]" : "text-[#f87171]"}`}>{message?.text}</span>
            {!FIELDS.some((f) => values[f.name]?.trim()) && !message && !saved && (
              <span className="text-sm text-gray-400">{connected?.length ? "Type a new key to change what is saved." : "Fill in both fields for at least one tool."}</span>
            )}
            {saved && <Link href="/connect" className={buttonVariants({ variant: "outline" })}>Next: connect your app</Link>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
