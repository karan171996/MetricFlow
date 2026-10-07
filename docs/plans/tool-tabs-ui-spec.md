# UI spec: show a tool only when its keys are provided (T2)

Designer spec for `docs/plans/tool-tabs-by-key.md`. Design only, no app code changed. Not checked in a browser: nothing is built yet, so the wireframes below are the reference.

**Ground rules for every screen**
- No new components. Reuse `Card`, `Badge`, `Button`, `Input`, `Skeleton`, `EmptyState`, `SidebarMenuButton`; the form groups are native `<fieldset>`/`<legend>`.
- Three different states, never mixed up: **not connected** = the part is removed from the page; **connected, no data yet** = today's "—" / "No data yet"; **connected, request failed** = "—" plus the existing warning banner naming the tool ("Could not load Sentry data."). Only "not connected" hides things.
- While the connected-tools answer is still loading, show the existing `Skeleton`. Never flash a tab, a "Connect" prompt or a number and then take it away.
- Match the classes already in each file; for new elements use the `dash-*` tokens (`dash-card`, `dash-border`, `dash-muted`, `dash-success`, `dash-danger`).

## 1. Setup form (`components/Setup/SetupForm.tsx`)

Same card, same fields, same labels and help text. The four fields are wrapped in one bordered `<fieldset>` per tool (`rounded-lg border border-dash-border p-4`), in `lib/tools.ts` order. Always one column, also on desktop.

```
Connect your tools
Add keys for the tools you use. You only need one. Keys are checked once,
saved to .env.local in this folder, and never shown again.

┌ New Relic  [✓ Connected] ──────────────────────────┐
│ New Relic User API key   ✓ Set                      │
│ [ •••••••• (leave blank to keep, type to replace) ] │
│ New Relic account ID     ✓ Set                      │
│ [ •••••••• (leave blank to keep, type to replace) ] │
└─────────────────────────────────────────────────────┘
┌ Sentry  [Optional] ─────────────────────────────────┐
│ Sentry auth token                                   │
│ [ sntrys_...                                      ] │
│ Sentry DSN                                          │
│ [                                                 ] │
│ ✗ Add the Sentry DSN, or clear the Sentry auth      │
│   token to skip Sentry.                             │
└─────────────────────────────────────────────────────┘
[Check and save]   Nothing was saved. Fix the fields marked below.
```

- **Optional**: a grey outline `Badge` reading "Optional" in the legend of every group that is not connected. No asterisks anywhere. The card description carries the rule ("You only need one").
- **Connected group**: legend badge becomes green "✓ Connected". Each field keeps today's "✓ Set" and the masked placeholder. The saved value is never fetched or displayed, not even the last characters, and there is no show/hide control. Blank means keep; typing replaces. This also applies to the non-secret fields (account ID, DSN).
- **Half-filled group**: a field counts as filled if it is typed or already set. If a group has some fields filled and some not, saving is rejected and the error sits under the missing field (existing red `✗` line), naming the field and the way out. Focus moves to that field (existing behaviour). Nothing is saved for any group.
- **Save button**: label "Check and save". Disabled only when every input is empty; while disabled, the line beside it reads "Fill in both fields for at least one tool." (when a tool is already connected: "Type a new key to change what is saved.") and is tied to the button with `aria-describedby`. A half-filled form keeps the button enabled so the error can explain itself.
- **Loading**: button reads "Checking…" and is disabled; inputs are read-only and keep their text; `aria-busy` on the form. On first load, legend badges are a small `Skeleton` until `GET /api/setup` answers; if it fails, show its error in the existing message line and treat all groups as "Optional".
- **Success**: message names what changed, then the existing "Next: connect your app" button.
- The sentence about the Ingest - License key moves from the card description into the New Relic group, under its last field.

## 2. Sidebar (`components/sidebar/Sidebar.tsx`)

```
Desktop rail        Phone drawer
 TOOLS               TOOLS
 [NR icon]           [icon] New Relic
 [+]                 [ + ]  Add a tool
```

- The group lists connected tools only, then "Add a tool" as the last item: same `SidebarMenuButton`, lucide `Plus` icon, links to `/setup`, tooltip and accessible name "Add a tool".
- The heading stays "Tools" in every case, including one tool (it never becomes "Tool"; the group still holds two items and the label does not jump when the second tool arrives).
- Both tools connected: the "Add a tool" item is removed entirely, no disabled leftover.
- No tool connected: the group shows the heading and "Add a tool" only.
- Loading: heading plus one `Skeleton` square (`h-10 w-10`) in place of the items.

## 3. "Connect <tool>" on `/tools/<tool>`

Page heading and description stay as today (`h1` tool name, tool description), so a shared link explains itself. Below them, `EmptyState` with no Retry button:

| | New Relic | Sentry |
|---|---|---|
| title | Connect New Relic | Connect Sentry |
| reason | Add your New Relic keys to see load time and Core Web Vitals for each page. | Add your Sentry keys to see the errors on each page. |
| button | Add New Relic keys → `/setup#new-relic` | Add Sentry keys → `/setup#sentry` |

The fieldset carries the tool id as its `id`, so the link lands on the right group. Loading shows the `Skeleton`; a failed load shows the existing "Could not load metrics" with Retry, not this prompt.

## 4. Shared screens with one tool

| Screen | New Relic only | Sentry only |
|---|---|---|
| **Header line** | `4 of 6 pages reporting · 1,204 views in 24h · updated 10:42` (errors part dropped) | `3 pages with errors · 12 open errors · updated 10:42` (reporting and views parts dropped) |
| **Hub stat cards** | Pages reporting, Avg load time. Grid becomes `md:grid-cols-2`. | Pages with errors, Open errors. Grid `md:grid-cols-2`. |
| **Hub table** | Page name, Path, Visitors (24h), Avg load, Status. Errors column removed. | Page name, Path, Errors, Last seen. No Visitors, Avg load or Status column. Card title "Pages with errors" and the limit line (section 5) as `CardDescription`. |
| **Detail KPI strip** | Unchanged (all three cards are New Relic). | Whole strip removed (all three cards are New Relic). |
| **Detail errors list** | Card removed. Page ends after the KPI strip. | Card stays and goes full width (drop `lg:w-[400px]`), directly under the breadcrumb. |
| **Home cards** | Unchanged: every home card is built from New Relic numbers. | The New Relic grid is not rendered. Show the Sentry stat cards and "Sentry by page" table from `ToolInsights`, with the limit line, then one muted line linking to `/setup#new-relic`. |
| **`/connect`** | Hide the "Sentry errors" status row and the Sentry snippet. | Hide the Connection card, the "Two different New Relic keys" card, the red browser-key warning and both New Relic snippets. "Events received" keeps one row, "Sentry errors", and its description drops the New Relic account sentence. |
| **`/tools/sentry`** | Connect state (section 3). | "Pages with errors" card shows a plain count ("3"), not "3 of 3". Limit line under the table title. |

Closing-up rules
- Header parts are joined from a list of the parts that exist, so there is never a leading, trailing or doubled " · ".
- Card grids set their column count from the number of cards shown (2 cards → 2 columns). Never leave an empty third slot, and never show a stat card alone in a row: if only one would remain, fold it into the table card's description instead.
- Table columns are removed with their header; no empty or "—" column for an unconnected tool. Sentry-only rows have no status badge and no placeholder for one.
- `/connect` snippet numbers come from the visible list: New Relic only "1. New Relic Browser agent, 2. emitMetric() helper, 3. Verify"; Sentry only "1. Sentry errors, 2. Verify".
- Sentry-only with no errors yet: the hub, home and `/tools/sentry` show one `EmptyState` (copy below) instead of cards and an empty table.

## 5. Copy (new or changed strings)

| Where | Text |
|---|---|
| Setup card title | Connect your tools |
| Setup card description | Add keys for the tools you use. You only need one. Keys are checked once, saved to .env.local in this folder, and never shown again. |
| Group badges | Optional / ✓ Connected |
| Half-filled error (pattern) | Add the {missing field label}, or clear the {filled field label} to skip {tool}. Example: "Add the New Relic account ID, or clear the New Relic User API key to skip New Relic." |
| Nothing entered | Fill in both fields for at least one tool. |
| Nothing entered, a tool already connected | Type a new key to change what is saved. |
| Saved, one tool | Saved. {Tool} is connected. No restart needed. |
| Saved, both | Saved. New Relic and Sentry are connected. No restart needed. |
| Sidebar link | Add a tool |
| Not set up (replaces "Add your New Relic and Sentry keys to see real numbers." in 4 places) | Add your New Relic or Sentry keys to see real numbers. |
| `/connect` not set up | Add your New Relic or Sentry keys, then come back to connect your site. |
| Sentry-only limit line | This list comes from Sentry, so it only shows pages that had an error in the last 24 hours. Connect New Relic to see every page. |
| Sentry-only hub table title | Pages with errors |
| Sentry-only stat cards | Pages with errors / Open errors |
| Sentry-only header | {n} pages with errors · {n} open errors |
| Sentry-only home line | Connect New Relic to see load time and Core Web Vitals here. |
| Sentry-only, no errors yet: title / reason / button | No pages to show yet / Sentry has not reported an error in the last 24 hours. A page appears here after its first error. / Check your connection → `/connect` |
| `/connect` Verify, Sentry only | Cause an error on your site, then watch "Sentry errors" above turn green. |
| One tool failed to load | Could not load {Tool} data. |
| Connect state | See section 3. |

New strings are sentence case. Existing labels are Title Case ("Avg Load Time", "Tracked Pages Overview"); they are left alone here, see open point 7.

## 6. Accessibility

- **Not colour alone**: every status has words and a symbol ("✓ Connected", "✓ Set", "✗ Add the…", "Optional"). Sentry-only pages carry no status at all rather than a grey one.
- **Labels**: every input keeps its visible `<label>`; the placeholder is never the label. `<fieldset>` + `<legend>` give each field its tool name when read aloud. Legend badges are plain text, not focusable.
- **Focus order** follows the page: New Relic fields, Sentry fields, "Check and save", then "Next: connect your app". After a rejected save, focus moves to the first field with an error.
- **Error announcement**: the field gets `aria-invalid` and its error sits in the existing `aria-live="polite"` region already linked by `aria-describedby`, so moving focus there reads label, help and error. The summary line beside the button stays `aria-live="polite"`.
- **Keyboard**: "Add a tool" and the Connect button are real links. Hub and tool tables open a page by row click only today; make the page name a link so it works from the keyboard (the row click can stay).
- **Contrast**: new small text uses `text-gray-400` / `dash-muted` or lighter on card backgrounds; do not use `text-gray-500` for new text (too faint on `dash-card`).

## 7. Phone width

- **Setup form**: groups stack with `p-3`; the legend badge may wrap under the tool name. Inputs are full width and `text-base sm:text-xs` (16px stops iOS zooming on focus). The button is full width and at least 44px tall, with the message line under it (`flex-wrap`).
- **One-tool hub table** (below `sm`): the Path column is removed and the path appears as a second line under the page name (`font-mono text-xs text-gray-400 truncate`). New Relic only then shows Page, Avg load, Status (Visitors hidden below `sm`). Sentry only shows Page, Errors (Last seen hidden below `sm`). No sideways scrolling is needed in either case. The Sentry limit line wraps above the table and is never truncated.

## Open points for the tech lead's note

1. **Where the connected-tools list comes from, and when.** If the sidebar gets it from the server on first paint, the sidebar skeleton in section 2 is not needed; if it arrives with `/api/metrics`, it is.
2. **Half-filled check**: is it done in the browser, on the server, or both, and does the server return the error against the missing field's key so it can sit under that field?
3. **One tool fails while both are connected**: the design needs the API to say which tool failed, to show "Could not load {Tool} data." and "—" rather than hiding that tool.
4. **Sentry-only pages**: how page name and slug are made from an error URL, and whether "Last seen" exists per page.
5. **Sentry-only home**: can AI suggestions run without New Relic numbers, and what feeds the "Rankings Moved" card (`/api/timings`)? Both are hidden for Sentry only until confirmed.
6. **Not reviewed**: the header threshold alert and bell, and the Settings keys panel (US4 mentions Settings). They should follow the same rules; Settings should reuse the grouped form.
7. **Label casing**: switch existing Title Case labels to sentence case in this change, or leave them?
