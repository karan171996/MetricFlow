# Requirement: show a tool only when its key is provided

Author: Andy (Product) · 2026-10-07 · Status: approved by the human 2026-10-07, with the manager to delegate · No code changed.

## 1. Request (from the human)

If a user has only a New Relic account, show only New Relic data; the Sentry tab stays hidden until Sentry keys are provided, and the other way round. The same rule applies to any tool added later: a tab appears only for a tool whose key is provided.

## 2. What the code does today

- The sidebar lists every tool, always: `components/sidebar/Sidebar.tsx:34` maps over `TOOL_IDS` from `lib/tools.ts` (New Relic, Sentry).
- Setup is all-or-nothing. `isConfigured()` in `lib/env.ts:52` needs all four keys (`NEWRELIC_API_KEY`, `NEXT_PUBLIC_NEWRELIC_ACCOUNT_ID`, `SENTRY_API_KEY`, `SENTRY_DSN`). `POST /api/setup` rejects any missing key as "Required." A New Relic-only user cannot finish setup at all.
- `GET /api/metrics` returns nothing unless all keys are set, and always calls both tools.
- Tracked pages are discovered from New Relic only (`discoverPages`). A Sentry-only user would have no page list.
- `/tools/[tool]` renders for any known tool id, with or without keys.
- Sentry and New Relic numbers are mixed on shared screens: header totals, hub table and stat cards, detail KPIs and errors list, dashboard cards (`components/header/Header.tsx`, `components/PerformanceHub/*`, `components/Analytics/*`, `lib/dashboardTransforms.ts`).

## 3. Problem

A user with one tool is blocked at setup, and the app shows tabs and numbers for a tool they do not have.

## 4. Users

- A team that uses New Relic only.
- A team that uses Sentry only.
- A team that adds the second tool later.

## 5. User stories and acceptance criteria

**US1. Set up with one tool.** As a New Relic-only (or Sentry-only) user, I can finish setup with just that tool's keys.
- `/setup` groups keys by tool; each group is optional; at least one complete group is required to save.
- A half-filled group (e.g. New Relic key without account ID) is rejected with a message naming the missing field.
- Each provided group is validated as today; an empty group is not validated and not written.

**US2. See only my tools.** As a user, I see a sidebar tab only for a tool whose keys are set.
- New Relic keys only: sidebar shows New Relic, not Sentry. Sentry keys only: the reverse. Both: both.
- Opening `/tools/<tool>` for a tool without keys does not show an empty data page: it shows a short "Connect <tool>" state linking to `/setup` (or 404; see open question 1).
- The tab appears after saving keys with no restart.

**US3. No numbers from a tool I do not have.** As a user, shared screens never show values for an unconnected tool.
- Header totals, hub columns and stat cards, detail KPIs, errors list and dashboard cards hide the parts that belong to an unconnected tool. They never show 0, "Healthy" or "No errors" for it.
- `/api/metrics` calls only connected tools and says which tools are connected.

**US4. Add the other tool later.** As a user, I can add the second tool's keys in `/setup` or Settings and its tab and data appear.
- Existing keys are kept; the new tab appears without restart.
- Removing a tool's keys hides its tab again (see open question 3).

**US5. Works for future tools.** As the team, adding a tool means one entry declaring its required keys; sidebar, setup form and visibility follow from it.
- Each tool in `lib/tools.ts` declares its required keys; no per-tool visibility checks scattered in components.

## 6. Scope

In: `/setup` per-tool groups, connected-tools signal from the API, sidebar filtering, `/tools/[tool]` guard, hiding unconnected-tool parts on shared screens, `/connect` showing only relevant snippets, tests, README.

Out: new tools (CrUX, PageSpeed, GA4), changing what each tool shows, hosted storage.

## 7. Open questions (need a decision)

1. **Hidden tool URL:** "Connect <tool>" prompt or 404? Recommend the prompt, so a shared link explains itself.
2. **Sentry-only page list:** pages come from New Relic today. For Sentry-only, build the page list from Sentry's error URLs (pages with no errors would not appear), or show only the Sentry tab and an explanation on Performance? Recommend the first, flagged as limited. This is the largest piece of work; tech lead to size it.
3. **Removing keys:** should users be able to disconnect a tool from the UI? Recommend yes in Settings, later if it adds much effort.
4. **Discoverability:** with a tool hidden, where does the user learn they can add it? Recommend one "Add a tool" link at the bottom of the sidebar group to `/setup`.
5. **AI suggestions:** already optional by key; confirm they follow the same rule.

## 8. Priority and suggested order

- **P0:** US1 (setup with one tool) and US2 (sidebar + tool page). Without US1 the request cannot work at all.
- **P0:** US3 for the New Relic-only case (the common one).
- **P1:** Sentry-only page list (open question 2), US4 polish.
- **P2:** disconnect a tool from the UI.

## 9. Suggested owners (manager decides)

Tech lead: tool-to-keys model and the Sentry-only page list approach. Developer: setup route, env, metrics API, sidebar, guards. Designer: grouped setup form, hidden-tool and partial states. Tester: one-tool, both-tools, add-later, half-filled group, hidden URL. Security: review the setup route change (it writes secrets). CLI engineer: check the CLI's setup/connection messages still read correctly with one tool.

## 10. Risks

- Shared types assume both `newRelic` and `sentry` exist on every page; many components read them directly.
- Existing tests (setup API, Cypress states, fresh-install) assume all four keys.
- Status ("Healthy/Warning/Critical") is derived from New Relic; Sentry-only needs its own rule or no status.

## 11. Additions from Product review (2026-10-07, approved by the human)

Checked against the code on `feat/tool-tabs-by-key`. UI detail lives in `docs/plans/tool-tabs-ui-spec.md`; nothing here repeats it.

**A. Gaps in section 2 (more places that need all four keys)**
- `app/api/connect/route.ts:10` returns `configured: false` unless all four keys are set, so `/connect` is dead for a one-tool user.
- `app/performance/[slug]/page.tsx:14` only loads the page when all four keys are set.
- `app/api/setup/route.ts:35` refuses the New Relic Ingest key with "Finish setup first." unless all four keys are set.
- All three, plus `/api/metrics`, call `isConfigured()` in `lib/env.ts`. Fix the rule there once, not in each caller.

**B. Definition of "connected" (add to US2)**
- A tool is connected when all its required keys are present. Nothing else decides it.
- A key that is present but rejected by the tool (expired, revoked) is "connected, request failed": the tab stays and shows an error. It is never hidden, or the user cannot tell a broken key from a missing one.
- A hand-edited `.env.local` with half a tool's keys counts as not connected, and `/setup` shows that group as incomplete.

**C. New acceptance criteria**
- **US3, one tool fails while both are connected:** the API says which tool failed; that tool's parts show "—" and "Could not load <Tool> data."; the other tool's data still shows.
- **US3, AI suggestions:** the prompt sent to the AI leaves out lines for an unconnected tool. Today `lib/aiAnalysis.ts:73` would send "Errors: undefined errors" for a New Relic-only user.
- **US3, alerts:** the threshold alert, the bell and the Settings notification options (shipped in #66) never show or fire for a metric from an unconnected tool.
- **US4, history:** records saved before the second tool was added have no values for it. Trends show a gap for that period, not 0.
- **US1, Ingest key:** `NEWRELIC_INSERT_KEY` belongs to the New Relic group. A Sentry-only user is never asked for it.
- **US6 (new). Nothing changes for today's users.** A user who already has all four keys upgrades and sees the same tabs, numbers and setup state, with no re-entry of keys.

**D. Done when (for the tester)**
- Fresh install, New Relic keys only: setup saves, dashboard shows data, and the word "Sentry" appears on no screen except `/setup` and "Add a tool".
- Same check the other way for Sentry only (P1).
- Fresh install with all four keys behaves exactly as before this change.

**E. Suggested delivery**
- PR 1 (P0): sections A and B, US1, US2, US3 for New Relic only, US6.
- PR 2 (P1): Sentry-only page list and screens, US4.
- PR 3 (P2): disconnect a tool.

**F. Answers to the open questions (approved by the human)**
1. Hidden tool URL: "Connect <tool>" prompt.
2. Sentry-only page list: build from Sentry error URLs, labelled as limited, in PR 2.
3. Removing keys: yes, in Settings, in PR 3.
4. Discoverability: "Add a tool" link in the sidebar.
5. AI suggestions: follow the same rule (see C).
