"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PROVIDERS = [
  { id: "gemini", label: "Google Gemini", help: "Create a key at aistudio.google.com/apikey." },
  { id: "claude", label: "Anthropic Claude", help: "Create a key at console.anthropic.com > API keys." },
  { id: "openai", label: "OpenAI", help: "Create a key at platform.openai.com/api-keys." },
] as const;

export function AiKeyForm() {
  const [provider, setProvider] = useState<string>(PROVIDERS[0].id);
  const [key, setKey] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [isSet, setIsSet] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/setup/ai")
      .then((r) => r.json())
      .then((b) => {
        if (!b.keys) return;
        setIsSet(b.keys);
        setActive(b.provider);
        if (b.provider) setProvider(b.provider);
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/setup/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      const body = await res.json();
      if (body.saved) {
        setKey("");
        setActive(provider);
        setIsSet({ ...isSet, [provider]: true });
        setMessage({ ok: true, text: "Saved. AI suggestions now use this provider. No restart needed." });
      } else {
        setMessage({ ok: false, text: body.error ?? "Nothing was saved." });
      }
    } catch {
      setMessage({ ok: false, text: "Could not reach the dashboard server." });
    } finally {
      setBusy(false);
    }
  }

  const current = PROVIDERS.find((p) => p.id === provider)!;

  return (
    <Card className="border-[#2d3748] bg-[#1a202c] shadow-md max-w-2xl mt-6">
      <CardHeader>
        <CardTitle className="text-[18px] font-bold text-white tracking-tight">AI suggestions (optional)</CardTitle>
        <CardDescription className="text-sm text-gray-400">
          Add a Gemini, Claude or OpenAI key to get AI insights and recommendations for your pages. Only page names, load
          times and error counts are sent to the provider you pick. Without a key, the dashboard shows sample suggestions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ai-provider" className="text-sm font-medium text-gray-300">Provider</label>
            <select
              id="ai-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="h-9 rounded-md border border-[#2d3748] bg-[#0f1419] px-3 text-sm text-gray-200"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {active === p.id ? " (in use)" : isSet[p.id] ? " (key saved)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ai-key" className="text-sm font-medium text-gray-300">
              {current.label} API key {isSet[provider] && <span className="ml-2 text-xs text-[#3ee0a1]">✓ Set</span>}
            </label>
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={isSet[provider] ? "•••••••• (type to replace)" : ""}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              aria-describedby="ai-key-help"
              className="bg-[#0f1419] border-[#2d3748] text-gray-200 font-mono text-xs"
            />
            <p id="ai-key-help" className="text-xs text-gray-400">{current.help}</p>
          </div>
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={busy || !key.trim()}>{busy ? "Checking…" : "Check and save"}</Button>
            <span aria-live="polite" className={`text-sm ${message?.ok ? "text-[#3ee0a1]" : "text-[#f87171]"}`}>{message?.text}</span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
