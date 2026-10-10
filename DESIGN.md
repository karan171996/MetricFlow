---
name: MetricFlow
description: Local performance dashboard for your site, New Relic metrics and Sentry errors per page.
colors:
  signal-blue: "#3b82f6"
  console-black: "#0f1419"
  panel-navy: "#1a202c"
  recess-navy: "#1a1f2e"
  hairline-slate: "#2d3748"
  field-slate: "#374151"
  focus-slate: "#4a5568"
  readout-white: "#ffffff"
  quiet-slate: "#a0aec0"
  soft-slate: "#cbd5e0"
  healthy-green: "#10b981"
  healthy-cyan: "#06b6d4"
  caution-amber: "#f59e0b"
  alarm-red: "#ef4444"
  series-violet: "#8b5cf6"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.2
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "26px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.readout-white}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.console-black}"
    textColor: "{colors.readout-white}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    textColor: "{colors.readout-white}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-destructive:
    textColor: "{colors.alarm-red}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  card:
    backgroundColor: "{colors.panel-navy}"
    textColor: "{colors.readout-white}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    textColor: "{colors.readout-white}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  badge:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.readout-white}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
    height: "20px"
---

# Design System: MetricFlow

## Overview

**Creative North Star: "The Night Console"**

MetricFlow looks like a calm, dark control room. Surfaces are deep navy-black and stay quiet; the status colours light up only where a page needs attention. An engineer should be able to glance at a screen and see what is wrong before reading a word.

The mood is calm, precise, technical and friendly. It sits comfortably next to a terminal and an editor, uses exact numbers and tight alignment, and still reads easily for someone who is not an observability expert. Components are compact and restrained: small controls, flat panels, hairline edges.

The app is dark only. `<html>` carries the `dark` class permanently; the light values in `app/globals.css` are unused shadcn defaults, not a second theme.

**Key Characteristics:**
- Dark only, on a navy-black base
- System font stack; no web fonts are loaded
- Compact 32px controls and 14px body text
- Flat panels edged with a hairline ring
- Colour carries status, not decoration

## Colors

A near-monochrome navy base with one blue accent and four status colours that double as the chart series.

### Primary
- **Signal Blue** (`signal-blue`): the single accent. Primary buttons, links, and chart series 3. The active sidebar item does not use it (see Navigation).

### Secondary
- **Healthy Green** (`healthy-green`) and **Healthy Cyan** (`healthy-cyan`): good readings and chart series 1 and 2.
- **Caution Amber** (`caution-amber`): warnings, medium severity, chart series 5.
- **Alarm Red** (`alarm-red`): errors, high severity, destructive actions.

### Tertiary
- **Series Violet** (`series-violet`): chart series 4 only. It has no status meaning.

### Neutral
- **Console Black** (`console-black`): the page and sidebar background.
- **Panel Navy** (`panel-navy`): cards and popovers.
- **Recess Navy** (`recess-navy`): muted fills, secondary buttons, hover backgrounds.
- **Hairline Slate** (`hairline-slate`): borders and dividers.
- **Field Slate** (`field-slate`): input borders and input fill (at 30% opacity).
- **Focus Slate** (`focus-slate`): the focus ring (at 50% opacity).
- **Readout White** (`readout-white`): primary text and numbers.
- **Quiet Slate** (`quiet-slate`): secondary text, captions, axis labels.
- **Soft Slate** (`soft-slate`): a lighter secondary text step, used sparingly.

### Named Rules
**The Status-Only Rule.** Green, amber and red mean healthy, warning and failing. They are never used as decoration.

**The One Accent Rule.** Signal Blue is the only non-status accent. Violet belongs to charts.

**Contrast.** Alarm Red (`#ef4444`) on Panel Navy is 4.34:1 and Signal Blue (`#3b82f6`) is about 4.44:1 on the card; both fall under 4.5:1. Red or blue text must be large (24px bold or larger) or sit beside a white status word.

**Known drift.**
- A second accent: mint `#3ee0a1` sits on the logo tile, the AI sparkle and good deltas, next to `#10b981` for the same meaning. It is not part of the palette.
- Decorative green: the API latency bars and the Apdex area chart use green with no status meaning, against The Status-Only Rule.
- Raw hex: most components use raw hex (`#131518`, `#1a202c`, `#2d3748`, `#9ca3af`, `#1f2937`) instead of theme tokens. Only `app/page.tsx` uses the `dash-*` tokens consistently.

## Typography

**Display Font:** system UI stack (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, sans-serif)
**Body Font:** the same stack
**Label/Mono Font:** `ui-monospace`, `SFMono-Regular`, `SF Mono`, `Menlo`, `Consolas`

**Character:** native and unbranded. The interface uses whatever the engineer's OS already renders, so it feels like a local tool, loads nothing, and keeps numbers crisp.

### Hierarchy
- **Display** (800, 32px, 1.2): the global `h1` rule. The header overrides it: the project name renders at 16px, 18px from `md` (`components/header/Header.tsx`), so no page shows the 32px step today.
- **Headline** (700, 24px, 1.3): section `h2`.
- **Title** (600, 18px, 1.4): `h3` and panel headings. Card titles are smaller: 16px, weight 500.
- **Body** (400, 14px, 1.5): default text.
- **Body small** (400, 12px, 1.4): captions, badges, table metadata.
- **Label** (500, 13px, 1.4): form labels and control text.

### Named Rules
**The Title Entrance Rule.** Titles fade in and rise 8px once on mount (400ms, ease-out) through the `title-enter` utility. With reduced motion they render in their final state.

## Layout

A fixed sidebar and a fluid content column.

- **Sidebar:** a fixed 70px icon rail (`collapsible="none"` on desktop), not collapsible.
- **Content:** capped at 1600px. Setup and form screens use narrow columns (`max-w-md`, `max-w-2xl`).
- **Grids:** one column on mobile, two or three from `md`, up to four at `lg`.
- **Rhythm:** a 4px base. Gaps are mostly 8px and 12px inside components, 16px and 24px between panels. Page and panel padding is 24px, rising to 32px on roomier screens.
- **Density:** compact. Controls are 32px tall; cards pad 16px (12px in the small size).

## Elevation & Depth

A hybrid that leans flat. Depth comes first from tone: Panel Navy on Console Black, with a 1px ring of white at 10% opacity around each card. Shadows are a second, lighter layer on some dashboard panels and on floating surfaces.

### Shadow Vocabulary
- **Panel shadow** (`box-shadow: 0 4px 6px rgba(0,0,0,0.3)`): dashboard chart and score panels.
- **Raised** (Tailwind `shadow-md`): popovers, tooltips, and some panels.
- **Floating** (Tailwind `shadow-lg`): drawers and sheets.

### Named Rules
**The Ring-First Rule.** A new panel gets the hairline ring and no shadow. Add a shadow only when the surface floats above others.

**Known drift.** The chart cards (`LineChartCard`, `BarChartCard`) add a `#2d3748` border and the panel shadow on top of the card.

## Shapes

Gently rounded, never sharp and never bubbly. Everything derives from one base radius of 10px (`--radius: 0.625rem`).

- Controls (buttons, inputs): 10px
- Small controls: 8px
- Cards: 14px
- Badges: full pill
- Borders are 1px hairlines in Hairline Slate, or the 10% white ring on cards.

## Components

Compact and restrained. Built on shadcn patterns over Base UI primitives, in `components/ui/`.

### Buttons
- **Shape:** gently rounded (10px), 32px tall, 10px horizontal padding, 14px medium text. Sizes: xs 24px, sm 28px, lg 36px, plus square icon sizes.
- **Primary:** Signal Blue fill with white text; hover drops the fill to 80% opacity.
- **Outline:** hairline border over a 30% Field Slate fill; hover deepens it to 50%.
- **Secondary:** Recess Navy fill, lightened 5% on hover.
- **Ghost:** no fill until hover, then a muted fill.
- **Destructive:** Alarm Red text on a 20% red tint, not a solid red block.
- **Focus / Active:** a 3px Focus Slate ring at 50%; pressing nudges the button down 1px.
- **Known drift:** some controls miss the 32px rule: the header bell is 36px and the sidebar nav buttons are 40px.

### Badges
- **Style:** 20px pill, 12px medium text, 8px horizontal padding.
- **Variants:** default (blue), secondary, destructive (red tint), outline, ghost.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** Panel Navy.
- **Shadow Strategy:** none by default; see Elevation.
- **Border:** 1px ring of white at 10%.
- **Internal Padding:** 16px, with a 16px gap between header, content and footer. The small size uses 12px. Footers sit on a muted band above a top border.

### Inputs / Fields
- **Style:** 32px tall, 10px radius, Field Slate border, 30% Field Slate fill.
- **Focus:** border shifts to Focus Slate with a 3px ring at 50%.
- **Error / Disabled:** red border and red ring when invalid; 50% opacity when disabled.

### Navigation
- **Sidebar:** a fixed 70px icon rail on `#131518` with a Hairline Slate edge (`components/sidebar/Sidebar.tsx`). Items are 40px grey icons; hover and the active item show a grey fill, not Signal Blue. It becomes an off-canvas sheet on mobile.

### KPI tiles
- Each tile shows a status word and the limit beside the value (`Warning · limit 2%`). The value turns amber (Warning) or red (Critical) over the limit and stays white when healthy, so colour is never the only signal.

### Thresholds
- Load time, error rate and Apdex Minimum are user thresholds (defaults 1.5s, 2%, 0.9). Status is Warning above the load or error threshold, or below the Apdex minimum; Critical above twice the load or error threshold. Apdex has no Critical step (`lib/thresholds.ts`).

### AI Suggestions and deltas
- **Unavailable:** one line of copy and an "Open setup" link to `/setup`.
- **Deltas:** "No prior data yet" and "No change" show no arrow and use the muted colour.

### Charts
- **Series order:** green, cyan, blue, violet, amber.
- **Motion:** bars grow in together with their labels; titles use the entrance rule.

## Do's and Don'ts

### Do:
- **Do** keep the app dark only, on Console Black.
- **Do** use the theme tokens (`bg-card`, `text-muted-foreground`, `border-border`) rather than raw hex. (Most components still use raw hex; see Colors.)
- **Do** keep controls at 32px and body text at 14px.
- **Do** give new panels the hairline ring first (The Ring-First Rule).
- **Do** wrap entrance motion in `motion-safe`, as `title-enter` does.

### Don't:
- **Don't** use green, amber or red for anything but status.
- **Don't** add a second accent colour beside Signal Blue.
- **Don't** load web fonts; the system stack is the type system.
- **Don't** build a light theme from the unused `:root` values without deciding to.
