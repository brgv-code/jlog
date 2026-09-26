# jlog — design system

The implemented system — the file to keep open while editing a component. The longer
rationale, and the decisions still outstanding, are kept outside the repo.

**`/designsystem`** renders all of this live: every token with its resolved value in both
themes, every animation playable, and a button that copies the whole spec as plain text
for pasting into a model prompt. It reads the computed stylesheet rather than restating
it, so it cannot drift from `tokens.css`. The route is deliberately not in the sidebar.

## The short version

Light by default. White content, off-white chrome, a hairline between them. Greyscale
everywhere except two places that mean something: **application status**, and the **nav
icons**. The one loud thing on any screen is a single black button.

## Where colour is allowed

| Role | Token | Used for |
|---|---|---|
| Primary | `--color-primary` | The one primary action per screen. Black on light, white on dark. |
| Accent | `--color-accent` | Links, focus rings, selection. **Never a button background.** |
| Status | `--color-status-*` | The six application statuses, and nothing else. |
| Nav icons | `--color-icon-*` | One hue per destination, so the rail is not five grey glyphs. |
| Citation | `--color-cite-*` | Teal = base CV, ochre = job description. Pre-existing, unchanged. |

Everything else is `--color-text-{primary,secondary,tertiary}`, `--color-surface*`, and
`--color-border`. If a new colour seems necessary, the answer is almost always more
padding instead.

### Why primary is not accent

`--color-primary` is black and `--color-accent` is blue, deliberately. Wiring one token
to both jobs is what turns a quiet UI into a blue one: every button becomes an
advertisement and the accent stops meaning "this is interactive". Note also that
shadcn's `--accent` is a *hover surface*, not the brand accent — the blue lives in
`--ring` and `--link`.

### Status colours are inks

Each status renders as text on a 10% wash of itself (`Badge` does the mix; do not
hand-write the pair). So each value must clear 4.5:1 on its own ground. That is why
`interviewing` is a burnt amber `#b45309` and not yellow — yellow cannot be read on
white at any weight, which is exactly how the previous palette broke when the app went
light.

## Rules in force

1. **Space before ornament.** A screen that feels wrong needs padding, not a card.
2. **Dividers, not boxes.** Depth is a 1px border. Shadows only on things that genuinely
   float — popovers and dialogs — and only via `--shadow-*`.
3. **Empty states are one formula**: glyph · "No X yet" · one line on *why the thing
   exists* · exactly one action. `EmptyState` enforces the shape. An empty *result* is
   not an empty *account* — say "No matching applications" when a filter is on, and give
   a cold account a way in rather than four empty charts.
4. **Render the shell before the data.** Labels, columns and units appear at zero rows.
5. **Mono means "a value you copy"** — IDs, tokens, emails, model names, file names.
6. **One focus ring**, defined once in `tokens.css` on `:focus-visible`.

## Layout

A left rail (`Sidebar.tsx`), then a 56px breadcrumb bar carrying the page's one primary
action, then content. The breadcrumb is not a page header: the rail already says where
you are, and a 28px title restating it spends the top of every screen.

Three signed-in surfaces:

| Route | Shell | What it is |
|---|---|---|
| `/dashboard` | `HomeShell` | Home. What needs attention today, then the charts behind it. Also where the API lands you after OAuth, which is why it keeps this path. |
| `/applications` | `ApplicationsShell` | The list. Accepts `?status=` and `?view=ghosted` so Home's tiles land pre-filtered. |
| `/cv` | `CvShell` | CV import and profile. Was two cards inside Settings; it is what every generated CV is built from, so it gets a primary place. |
| `/settings` | `SettingsShell` | Centred at 760px — a column pinned left leaves half a wide screen empty. |

The application detail view lives inside `/applications` rather than its own route. It
pins to `calc(100vh - 56px)` so the document pane and the rail scroll independently
instead of the page scrolling as one column.

| Region | Holds |
|---|---|
| Identity bar | Company and role, both editable in place, plus status and the posting link. |
| Document pane | Job description and notes as tabs. Rendered by default; editing is a mode you enter. |
| Rail (340px) | Applied date, location, salary, source, Tailor CV, follow-up, activity, delete. |

Two rules that page enforces. **Reading is the default state** — the job description used
to render into a `rows={4}` textarea, so a thousand-word posting was read through a
four-line window. And **a fact appears once**: company and role are the heading, so they
are edited there rather than repeated as rail rows purely to have somewhere editable.

## Job description formatting

Postings arrive from the extension as plain text — the markup that made them readable on
the job board is gone, so headings, bullets and paragraphs all come through as
undifferentiated lines. `lib/jobText.ts` puts the structure back by inference before the
markdown renderer sees it: typographic bullets (`•`, `–`, `▪`) become list items, short
unpunctuated lines that shout, introduce a list, or stand alone between blanks become
headings, and lines hard-wrapped mid-sentence are rejoined into flowing paragraphs.

It is heuristic and will sometimes be wrong, so the detail view keeps a toggle back to
the original — a formatter you cannot see through is worse than no formatter. Text that
already carries markdown is detected and left alone; notes are never inferred over, since
the user wrote that markdown deliberately.

The rules live behind tests (`jobText.test.ts`) because they are the kind of heuristic
that silently rots the moment someone tweaks a regex.

## Long-form text

`.jlog-prose` styles anything passed through `renderMarkdown`. The renderer emits one
`<p>` per physical line and a `<br>` per blank line, and most job descriptions arrive as
hard-wrapped plain text rather than markdown — so `<p>` carries zero margin (wrapped
lines stack as one block) and the `<br>` supplies the paragraph break. List markers are
set explicitly because Tailwind's preflight strips `list-style`.

## Charts

Data comes from `GET /api/stats/overview` in one round trip. Charts are hand-rolled
inline SVG in `components/charts/` — no charting dependency.

**One chart carries the accent.** The trend line is `--color-chart-mark` (the blue);
every bar and column is `--color-chart-bar` (neutral ink). Built the other way round,
with all four charts in accent blue, the page came out a wall of saturated colour —
decoration, not signal, and the opposite of what the rest of the app does.

**The status palette never fills a bar.** Offer and rejected are ΔE 4.2 apart under
deuteranopia: fine on a pill that carries its own text label, misleading when bar length
is the comparison. In the pipeline chart the status colour rides a dot beside the label
instead.

Marks follow one spec: bars ≤24px thick with a 4px rounded data-end and a square
baseline, 2px lines with round caps, ≥8px markers with a 2px surface ring, area fills at
10% opacity, hairline recessive axes. Single-series charts get no legend — the panel
heading names them. Label selectively; never a number on every point.

Collapsed, the rail keeps the same order and vertical positions, so it is the same
muscle memory rather than a second layout.

## Theme

Three choices — light, dark, system — stored under `jlog_theme`. **Nothing stored means
light**: a dark desktop is not on its own a request for a dark jlog. `Layout.astro` has a
pre-paint inline script and `lib/theme.ts` has the same rule; if you change one, change
both or the control will show a state the page did not honour.

`ThemeSegmented` is the single control, rendered in both places people look: the account
popover (`compact`) and Settings → Appearance.

## Adding a component

- Read colour from `var(--color-*)`, never a literal. The **only** exception is a brand
  mark that is not ours to restyle: the jlog logo (`ui/JlogMark.tsx`, matching
  `public/favicon.svg`) and the provider logos on the sign-in page. Those are literal on
  purpose — a logo that recolours itself per theme is a different logo. Everywhere else,
  a hex value in `src/` is a bug.
- Motion comes from `styles/motion.css` — four durations, three easings, and a named
  class per gesture. Do not write a bare `@keyframes` in a component; if the gesture you
  want is missing, add it there with a note on when *not* to use it.
- shadcn components inherit everything through `styles/shadcn.css`; do not restyle them
  locally.
- Spacing comes from `--space-*`. If the step you want is missing, add it to the scale
  rather than typing a pixel value — an undefined `var()` fails silently and the
  declaration is dropped.
