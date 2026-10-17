# Phase 0 screen designs (task 0.1) — Angela

Design only, no app code. Reuse existing cards, badges, buttons and the Settings form styling. All states use text + colour (never colour alone); all inputs have visible labels.

## Shared state components (used everywhere)
| State | Look | Copy |
|---|---|---|
| **Not set up** (no keys) | Centered card, icon, one primary button | "Connect your data" / "Add your New Relic and Sentry keys to see real numbers." [Set up keys] |
| **No data yet** (keys OK, nothing received) | Same card, neutral grey | "No data yet" / "Keys work, but no page events have arrived." [Send your first events] → `/connect` |
| **Error** (API/key failure) | Amber/red inline banner above content, content dimmed | "Couldn't load data from New Relic (key rejected)." [Retry] [Check keys] |
| **Loading** | Skeleton cards matching final layout | none |
| **Stale** (served cached after failure) | Small amber chip in header | "Showing data from 4 min ago" |

Rules: metrics with no data show "—" + grey "No data", never 0ms or "Healthy". Hub stat cards show "—". Dashboard home uses the same Not set up / No data cards in place of its grid.

## `/setup` — wireframe
```
Set up Metricflow                         [Step 1 of 2: New Relic]
Runs on this machine only. Keys are saved to .env.local and never shown again.

┌ New Relic ───────────────────────────────┐
│ Account ID        [ 1234567           ]  │  plain number
│ User key          [ ••••••••••  show  ]  │  help: "Reads your data (starts NRAK-). Not the Insert key."
│                   [Test connection]      │
│ ✔ Connected — account "Acme"  /  ✖ Key rejected (401). Check it is a User key.
└──────────────────────────────────────────┘
┌ Sentry ──────────────────────────────────┐
│ Org slug  Project ID  Auth token         │
│ [Test connection]  ✔ / ✖ result          │
└──────────────────────────────────────────┘
▸ Optional: Gemini key (AI summaries)   (collapsed)
[Save and continue]  (disabled until each section passes or is skipped)
```
- Each section tests with one read call; result inline, plain words, no key echoed. After save, fields show "Saved ••••" with [Replace].
- Sentry may be skipped ("Skip for now") so New Relic alone unblocks the app; errors panels then show "Sentry not connected".
- Success: "Saved. Next: send your first events" → `/connect`.
- Error messages never include the key; wrong-format keys are caught inline before the call.
- Non-localhost access: page shows "Setup is only available on this machine." (supports Jim's bind fix).

## `/connect` — wireframe
```
Send your first events
Status: ● Waiting for events…  (grey)  →  ● 12 events in the last 5 min · last 10s ago (green)

Tabs: [Browser metrics] [Custom events] [Errors (Sentry)]
┌ Browser metrics (recommended) ───────────┐
│ 1. Paste this in your site <head>:       │
│    [ code block ........................ Copy ]
│ 2. Reload your site.                     │
│ Gives: page loads, LCP, CLS, INP, JS errors. No custom code.
└──────────────────────────────────────────┘
Key explainer (always visible): User key = read data into this dashboard. Insert key = send custom events from your site. Different keys.
[Send test event] → "Test event sent. It appears below within ~1 min"; a row shows in "Events received" (time, page, type)
```
- Order: status first, snippet second, test third. Copy button confirms "Copied".
- Test failure: banner naming the cause (Insert key missing / rejected) and the fix.
- Footer link "Skip, I'll do this later" → hub empty state.

## Empty states per page
- **Hub**: stat cards "—"; table replaced by "No pages found yet" with [Send your first events]. After discovery, only discovered pages are listed; a page with no recent data shows grey "No data".
- **Detail**: header intact (name, path), KPI cards all "—/No data", suggestions panel hidden, errors "No unresolved errors" only if Sentry is connected, else "Sentry not connected" + [Connect].
- **Dashboard home**: a single Not set up or No data card.

## Accessibility and responsive
Single column below 768px; buttons at least 44px tall; status changes announced (aria-live polite); focus moves to the result message after Test; key fields have show/hide.

## For Phyllis
Build with existing components; no new library. Ask me before changing copy; Kelly owns the plain-language wording pass. I will review the built screens against this doc.

## Addendum for Phyllis's request (conv-63860c)

### Tokens (existing `dash-*` colors in the app)
Card: `dash-card` + `dash-border`; page/nested surface: `dash-surface` / `dash-surface-alt`; text: `dash-foreground`, `dash-muted`. Status: pass `dash-success`, warn `dash-warning`, fail `dash-danger`, info `dash-blue`. Empty/no-data = `dash-muted` only (neutral, not a status colour). Use existing Card, Badge, Button; no new components except one `EmptyState` and one `KeyField`.

### EmptyState (one component, props: `kind`, `onRetry?`)
| kind | Title | Reason line | Button |
|---|---|---|---|
| `no-keys` | Connect your data | Add your New Relic key to see real numbers. | Set up keys → `/setup` |
| `no-data` | No data yet | Keys work, but no page events have arrived. | Send your first events → `/connect` |
| `error` (banner, not card) | Couldn't load data | New Relic rejected the request (401). / Network error. | Retry (calls `onRetry`) · Check keys → `/setup` |
| `loading` | skeleton | matches final layout | none |
Hub table: whole card replaced. Hub stat cards: value "—", caption "No data". Detail page: header stays, KPI cards "—/No data".

### `/setup` fields (order)
1. NR Account ID (number, plain). 2. **NR User key** (`NRAK-…`) — label "User key · reads your data", help "Used by this dashboard to query New Relic." 3. **NR Insert key** (`Ingest-License`, optional) — label "Insert key · sends test events", help "Only needed for the Send test event button and custom events. Different from the User key." 4. Sentry token, org slug, project ID. 5. Gemini (collapsed, optional).
- Each key: masked input with show/hide while typing; once saved, shows `•••• 4f2a` (last 4) + [Replace]. Never echo the full key.
- Per-key status chip beside each field: grey "Not tested" → spinner "Testing" → green "Valid" / red "Rejected (401)" / amber "Can't reach New Relic". Insert key chip shows "Not set (optional)" when empty.
- [Test connection] per section; [Save] writes `.env.local` only when every non-skipped key passes.

### `/connect` layout
Top: **status row**, one chip each — `New Relic keys: Valid` · `Events (last 5 min): 12` · `Last event: 10s ago`; Sentry has `Sentry key: Valid` · `Last error: —`. Grey when empty, green when live; the row polls every 10s (aria-live polite).
Below: 4 blocks, each a Card with title, one-line purpose, code block, [Copy] (turns to "Copied" 2s):
1. New Relic Browser agent (recommended, no custom code). 2. `emitMetric()` helper (custom events, needs Insert key; shows warning chip if Insert key not set, link to `/setup`). 3. Sentry init (needs `SENTRY_DSN`). 4. (4th block per Phyllis's list; suggest "Verify" checklist: reload site → status row turns green).
Bottom: [Send test event] (disabled with tooltip text "Add an Insert key in Setup" if missing); after click: inline "Test event sent. Usually shows within a minute." and the status row refreshes.
