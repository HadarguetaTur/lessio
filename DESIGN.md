---
name: Lessio public diary (the week diary)
description: A teacher's paper week diary. The landing page, the sign-in note pages and the legal documents are pages of it; the app shell keeps its own system.
colors:
  paper: "#ffffff"
  rule: "#a9c4db"
  rule-soft: "#dbe6f0"
  ink: "#141618"
  ink-2: "#4a5058"
  ink-3: "#6b7280"
  pen: "#c8102e"
  highlighter: "#ffe34d"
  highlighter-deep: "#ffd60a"
  cover: "#115e59"
  cover-deep: "#0c4744"
  cover-ink: "#f2f7f5"
  cover-ink-2: "#b9d6d1"
  wa-green: "#075e54"
  wa-bubble: "#d9fdd3"
  wa-paper: "#efeae2"
typography:
  display:
    fontFamily: "Secular One, Assistant, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 4.5vw, 3.25rem)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "0"
  headline:
    fontFamily: "Secular One, Assistant, system-ui, sans-serif"
    fontSize: "clamp(2rem, 3.5vw, 2.9rem)"
    fontWeight: 400
    lineHeight: 1.08
  title:
    fontFamily: "Secular One, Assistant, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2vw, 1.75rem)"
    fontWeight: 400
    lineHeight: 1.08
  legal-heading:
    fontFamily: "Secular One, Assistant, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.15
  row-title:
    fontFamily: "Assistant, system-ui, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.6
  body:
    fontFamily: "Assistant, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  pen:
    fontFamily: "Amatic SC, cursive"
    fontSize: "clamp(1.05rem, 1.6vw, 1.6rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.01em"
  pen-number:
    fontFamily: "Amatic SC, cursive"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1
  field-label:
    fontFamily: "Amatic SC, cursive"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.05
  label:
    fontFamily: "Assistant, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
    lineHeight: 1.6
    letterSpacing: "0.02em"
rounded:
  none: "0"
  focus: "2px"
  pill: "999px"
spacing:
  line: "2.25rem"
  line-lg: "2.75rem"
  row: "1.25rem"
  beat: "2.5rem"
  page: "3rem"
  page-lg: "4rem"
  gutter: "1rem"
  gutter-lg: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.ink}"
    typography: "{typography.display}"
    rounded: "{rounded.none}"
    padding: "0.3em 0.5em"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.highlighter-deep}"
    textColor: "{colors.ink}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0"
    height: "44px"
  button-stub:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0.5rem 1rem"
    height: "44px"
  input-field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 0.15em"
    height: "{spacing.line}"
  input-field-readonly:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
  tab:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.6rem 0.35rem"
  tab-active:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.ink}"
  cover-section:
    backgroundColor: "{colors.cover}"
    textColor: "{colors.cover-ink}"
  printout:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  wa-printout:
    backgroundColor: "{colors.wa-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
---

# Design System: Lessio public diary (the week diary)

## Overview

**Creative North Star: "The Teacher's Week Diary"**

**Scope.** This file records the visual world of every public page a visitor sees before signing in: the landing page (`src/components/marketing/`), the sign-in family (`/login`, `/signup`, `/signup/verify`, `/signup/complete`, `/forgot-password`, `/reset-password`, through `src/components/auth/`) and the legal documents (`/privacy`, `/terms`, `/data-deletion`, through `LegalSimpleLayout`). All of them render through one shell, `src/components/diary/DiaryShell.tsx`, which loads the three faces, scopes every rule under the `.diary` class (`src/components/diary/diary.css`) and carries the cover strip (`DiaryHeader`) and the back cover (`DiaryFooter`); both locales, he RTL baseline and en LTR. The dashboard, admin shell and parent portal keep their own incumbent shadcn/oklch system in `src/app/globals.css` (Geist, `--radius: 0.5rem`, `--primary: oklch(0.52 0.19 255)`); this diary world does not replace it and nothing here is scoped to leak into it. Two brand commitments carry across both worlds: the LESSIO wordmark set in caps, and the existing L logo (a white "L" on a rounded square with a teal-to-violet gradient). Everything else on the diary's pages is new.

The page is a paper week diary that belongs to a tutoring-centre owner, opened to the week a parent cancelled. The materials are literal and few: white paper ruled in pale blue on an hour grid, black ink, one red pen, one fluorescent highlighter, and the diary's deep teal-green hard cover. The ruling is the page's only geometry. The calendar, the pricing table, the FAQ and every list on the page are hairline rows on the same paper; there are no cards, no filled panels, no gradient text, no glass, no eyebrows. Where the product has to be shown, a real screenshot is clipped into the page with a drawn paperclip and a slight tilt, like a printout. When the visitor clicks "try free" the diary does not close: it opens at a note page, the cover on one side with the landing promise, ruled paper on the other with the form written on the lines. A legal document is a contract written into the same diary, one reading column on the ruling.

The page carries one authored motion, "the pen writes": when the week spread scrolls into view, the red pen strikes the cancelled lesson, the highlighter sweeps the margin note, and the freed slot is inked in. At the back of the diary, on the cover, the same pen marks the ₪60 line on the month-end ledger. On a note page the same pen underlines the title and draws the ticked box when an email has gone out. Nothing else animates on scroll. Under `prefers-reduced-motion` the final state is shown outright. Dark scheme is the diary under a desk lamp: the paper stays white, and only the printout shadow warms.

**Key Characteristics:**
- Hairline ruling (`rule`, `rule-soft`) is the only structure; no cards or boxed containers on paper.
- Three self-hosted faces with Hebrew and Latin: Secular One (display), Assistant variable (text), Amatic SC (pen).
- One highlighter, reserved for the primary action, the ₪60 and the active thumb tab; on sign-up, the trial note.
- One red pen for strikes, numerals, pen-hand titles, the cross mark and the corrected answer on a form line; never a fill, never a badge.
- The teal cover is the single committed colour field: header strip, closing spread with the ledger, footer, and the facing column of an opened note page.
- Forms are written on the ruling: a pen-hand label, the answer in ink on a hairline, the same highlighter as the action.
- Icons are hand-drawn pen marks; no glyph libraries.
- Motion is authored once, fires once, and is class-toggled (`data-pen` → `.is-on`).
- RTL is the baseline; every offset is logical (`inset-inline-*`, `ps-`/`pe-`), and the strike and sweep reveal from the reading start.

## Colors

The palette is a stationery drawer: paper, blue ruling, black ink, one red pen, one yellow highlighter, and the cover's teal.

### Primary
- **Highlighter** (`highlighter`): the fluorescent marker. Behind the primary action (`.hl-cta`, link or button), as an inline mark on the ₪60 (`.hl-mark`), as the sweep on the margin note and the ledger amount, as the active/hover thumb tab, as text selection, as the "approved" note on the cover, and on the sign-up cover as the mark under the trial note. Deepens to **Highlighter Deep** (`highlighter-deep`) on hover only.
- **Red Pen** (`pen`): the correcting pen. The strike stroke, the large beat and step numerals, pen-hand section titles on the centre page, the "most centres" pricing note, the underline on problem titles, the cross mark in "not for". On a form it is the teacher's correction: the line under a wrong answer (`aria-invalid`) turns `pen`, the short note under it (`.field-error`, with `PenX`) and the form-level note above the action (`.form-error`) are written in it. It is never used for buttons, never as a fill, never as a badge or a box border.

### Secondary
- **Cover Teal** (`cover`): the diary's hard cover. The sticky header strip, the closing spread that holds the month-end ledger, the facing column of an opened note page (the auth pages), and (as **Cover Deep**, `cover-deep`) the footer. Text on the cover is **Cover Ink** (`cover-ink`) with **Cover Ink Muted** (`cover-ink-2`) for secondary lines; hairlines on the cover are `rgba(242, 247, 245, 0.35)`; a `.link-rule` on the cover underlines in `cover-ink-2` and turns `cover-ink`.

### Tertiary
- **WhatsApp Green**, **WhatsApp Bubble**, **WhatsApp Paper** (`wa-green`, `wa-bubble`, `wa-paper`): used only inside the WhatsApp printout so it reads as the phone the parent held, not as themed UI. The printout also keeps WhatsApp's own hard-coded chrome (`#25d366` avatar, `#111b21` bubble text, `#3f4f57` timestamps, `#0b5fc4` button labels). These never leave the printout. The Google stub likewise carries Google's own four-colour glyph, and nothing else on the paper does.

### Neutral
- **Paper** (`paper`): the page and every printout's backing. Pure white on purpose; the dark scheme does not change it. A form field keeps the paper under browser autofill (`-webkit-box-shadow: 0 0 0 1000px paper inset`).
- **Ruling** (`rule`): the visible hairline. Section rules (`.rule-t/-b/-s/-e`), the spread's outer and hour-column borders, the printout border, the thumb tab border, the strong ruling, the scrollbar thumb, the secondary-link underline at rest, the line a field is written on, the stub's border, the "or" divider, the legal document's h2 and table hairlines and its side-rule note.
- **Ruling Soft** (`rule-soft`): the faint ruling behind page bodies (`.ruled`, one hairline per `--line`) and the inner cell borders of the week spread.
- **Ink** (`ink`): headlines, body copy, the primary action's text, the focus outline, the secondary-link underline on hover, field labels and typed answers, the field line on focus, the stub's border on hover.
- **Ink 2** (`ink-2`): supporting paragraphs, intros, notes, the FAQ plus mark, the thumb tabs at rest, the "not for" column, the note page's footer line, a legal document's body and list text.
- **Ink 3** (`ink-3`): hour labels, dates, the synthetic-week disclaimer, the paperclip, the struck entry after the pen passes, the "slot open again" note, placeholders, a readonly field, the "or" divider, list markers and the version line in a legal document.

### Named Rules
**The One Highlighter Rule.** The highlighter marks the primary action, the ₪60 wherever it appears, and the page in view. Nothing else is highlighted; a second highlighted thing on a page cancels the first. On the auth pages the trial note on the cover is marked only on sign-up, where it is the one highlighted thing in the viewport besides the action on the facing page.

**The Red Pen Rule.** Red is a pen, not a status. It strikes, numbers and annotates in the pen hand, and on a form it corrects: the line under a wrong answer and the note beside it. It never fills a button, never sits in a badge or a pill, never draws a box border.

**The Cover Rule.** The teal cover is the only colour field. It holds the header strip, the closing spread with the ledger, the footer, and the facing column when the diary is opened at a note page, and nowhere else. The highlighter keeps ink-coloured text on the cover.

## Typography

**Display Font:** Secular One (with Assistant, system-ui, sans-serif), self-hosted, weight 400 only, exposed as `--font-display`.
**Body Font:** Assistant variable (with system-ui, sans-serif), self-hosted, weight axis 200–800, exposed as `--font-text`.
**Pen Font:** Amatic SC (with cursive), self-hosted, 400 and 700, exposed as `--font-pen`.

The three are loaded once in `src/components/diary/fonts.ts` and put on the diary root by `DiaryShell`, so the landing, auth and legal pages can never disagree.

**Character:** A printed diary written in by hand. Secular One is the diary's printed headings, blocky and single-weight; Assistant is the printed body; Amatic SC is the owner's pen, used only for what a person would actually write into a diary: entries, the week label, margin notes, the big numerals, the "most centres" note, the "approved" line, and on a note page the labels beside the lines, the "or", a correction in red and the version line of a document. All three carry Hebrew and Latin natively so the two locales share one ramp.

### Hierarchy
- **Display** (400, 2.25rem → 2.9rem at `sm`, or 2.3rem → 2.7rem at `xl` when written as a note over the spread; 2rem → 2.75rem → 3.25rem on the closing cover; line-height 1.08, `text-wrap: balance`): the two-line headline over the week and the closing cover's title. On the auth cover the same headline is 2.4rem → 2.9rem at `xl` (line-height 1.1, max 16ch). A note page's title is 2.1rem set on the ruling (line-height `--line`, two lines tall, bottom-aligned); a legal document's title is 2rem → 2.6rem at `sm`.
- **Headline** (400, 2rem → 2.5rem → 2.9rem, line-height 1.08): page titles (`h2`) at the top of each diary page; max width 40rem.
- **Title** (400, 1.5rem → 1.75rem, line-height 1.08): beat titles, sub-page titles (`h3`), the closing lines on problem and audience pages (1.5rem → 1.9rem), pricing tier names (1.75rem), the pricing monthly figure (2.75rem, line-height 1).
- **Legal heading** (Secular One 400, 1.5rem, line-height 1.15): a legal document's `h2`, set on a `rule` hairline with 2.5rem above and 0.75rem below. Its `h3` is Assistant 700 at 1.125rem.
- **Row title** (Assistant 700, 1.2rem): the bold lead of a hairline row on the problem, rollout and trust pages; the FAQ question at 1.0625rem 600.
- **Body** (Assistant 400, 1.0625rem, line-height 1.6): all paragraphs. Supporting copy is `ink-2`; intros go to 1.125rem at `sm`; the auth cover's subheadline is 1.125rem in `cover-ink-2`. Measures are held at 44–62ch (`max-w-[52ch]` is the common one); a legal document reads at 68ch with its body and list text in `ink-2` and tables at 1rem. On a note page every paragraph sits on the ruling at `line-height: var(--line)`.
- **Pen** (Amatic SC 700, letter-spacing 0.01em, line-height 1.05): diary entries 1.05rem → 1.3rem → 1.5rem (0.95rem on phones); the week label 1.5rem → 1.75rem; margin note 1rem → 1.35rem; the "for" line 1.35rem; centre-page titles 1.6rem; the policy result and the approved note 1.6rem; the trial note on the auth cover 1.6rem; the phone cover's promise 1.2rem; a legal document's version line 1.35rem in `ink-3`.
- **Field label** (Amatic SC 700, 1.5rem, line-height 1.05, `ink`): the label written above a form line. The form-level correction (`.form-error`) is 1.35rem, the "or" divider 1.3rem in `ink-3`, the "sent again" note 1.4rem.
- **Pen number** (Amatic SC 700, 2.25rem, line-height 1, red): beat and step numerals.
- **Label** (Assistant 600, 0.72rem, letter-spacing 0.02em): the vertical thumb tabs. Hour labels and dates are 0.72rem / 0.62rem–0.75rem in `ink-3` with tabular numerals; the header nav and the header's back link are 0.875rem 600; a field's correction note is 0.95rem; the "forgot?" link beside a label is 0.875rem.

### Named Rules
**The Pen Writes What a Person Would Write Rule.** Amatic SC appears only where a hand would: entries, the week label, margin notes, numerals, short notes, the labels beside a form's lines and the correction under them. It never sets a paragraph, a heading, or a button.

**The Tabular Money Rule.** Every amount, hour and date is set with `font-variant-numeric: tabular-nums` (`.tabular`), and currency is formatted per locale with `dir="ltr"` on the figure. A legal document's table cells are tabular too.

**The No Eyebrow Rule.** There is no kicker above any heading. The "who it is for" line is a red pen note written under the primary action, after the headline, not above it; a document's version line is written under its title, never above.

## Layout

The page is a single scroll container (`#diary-scroll`, the wrapper is the scroller because the root `<body>` is `overflow-hidden`) inside which every page shares one column: `max-w-7xl`, gutters 1rem → 1.5rem at `sm` → 2rem at `lg`. A diary page is a `<section>` with `py-12` → `py-14` → `py-16`, ruled in `rule-soft` at one hairline per `--line`, and separated from the next by a `rule` hairline.

**The line.** `--line` is 2.25rem and is the page's vertical unit: the ruling repeats at it, the week spread's rows are it, and headline notes over the spread are positioned in multiples of it. On the spread at `lg` and above, `--line` becomes 2.75rem so the story cell has air.

**The week spread (first viewport).** A CSS grid of a 3.25rem (4rem at `sm`) hour column plus five equal day columns, rows of `--line`, bounded by `rule` above and below, with `rule-soft` cell borders and a `rule` hairline after the hour column. Hours run 08:00–22:00 down the reading-start side; on phones only 12:00–17:00 are shown so the story stays in view. Days run Sun–Thu in reading order (right-to-left in Hebrew). The story entry sits in the second day column at 14:00. Below `lg` the headline is written above the spread and the WhatsApp printout below it (max 22rem); at `lg` and above the headline is a paper-backed note laid over rows 1–5 of the spread (inset by the hour column) and the printout is clipped over the far 21% of the spread from row 6.6 down.

**Hairline rows.** Every list is a `rule-t` list with `rule-b` rows. Two-column rows use a fixed label column (`14rem` or `16rem`) at `sm`. Row padding: `py-5` for text rows, `py-3` for check lists and ledger rows, `py-7` for pricing columns, `py-10` → `py-14` for illustrated beats. Illustrated beats and capability rows alternate side (`order-last` on odd rows) in a `1fr / 1.15–1.2fr` two-column grid with `gap-14` at `lg`.

**The diary opened at a note page (auth).** `AuthSplitShell` is a `main` grid of `1fr / 1.15fr` at `lg`: the cover column (`aside.cover`) on the reading-start side, the paper column (`.np-column ruled`) on the other, the sticky header strip above and the footer below. At `lg`+ the cover column is `px-12 py-16`, start-aligned, and carries the landing headline in Secular One (max 16ch), the subheadline 2rem below in `cover-ink-2`, and the trial note 2.5rem under that in the pen's hand at 1.6rem. The paper column centres a `.note-page` of `max-width: 26rem`, padded in whole lines (`padding-block: 2 lines / 3 lines` at `lg`; `1 line / 2 lines` below), and is ruled from its own top edge so the note's grid lands on the column's ruling. Below `lg` the layout stacks: the header strip, then the cover shrunk to a centred strip (`px-4 py-5`) holding one line of the promise in the pen's hand at 1.2rem in `cover-ink-2` (the headline's first half only, `leading-tight`), then the note. That line is not clamped to one line: at 390px with the current headline copy the Hebrew promise renders on one pen line and the English on two, a cited adaptation of the copy rather than a promise of one line.

**Note page rhythm.** Inside `.note-page`, `--line` is pinned to 2.25rem and every block is a whole number of lines tall, so a field's line is a page ruling: the title two lines (bottom-aligned), each `.np-block` one line of margin above, a field one line for the label row and one for the input with one line of margin under it, the correction note one line, the action row (`.np-action`) two lines, the "or" divider one line, the stub row (`.np-stub`) two lines, the drawn checkbox (`.doodle`) two lines square, paragraphs at `line-height: var(--line)`, and one line of padding at the bottom. Two fields sit side by side at `sm` in a `grid-cols-2 gap-x-6` (the two password lines on sign-up). On phones the note is centred (title, action, paragraphs) while fields and their labels stay start-aligned.

**A legal document.** `LegalSimpleLayout` is a ruled `main` (`px-4 py-12` → `py-16` at `lg`) with one centred `article.legal-doc` at `max-width: 68ch`: the title, the version line 0.75rem under it, the document 2rem below, and a `.link-rule` back to the front cover 3rem after the last paragraph.

**Cover.** The header is `sticky top-0 z-50` with `py-3`; on the auth and legal pages its actions slot holds only the locale toggle and a back-to-home link (0.875rem 600). The closing spread is `py-20` → `py-24` → `py-28` in a `1.1fr / 1fr` grid at `lg`, ledger on the reading-end side (`justify-self-end`, max 28rem); the footer is `py-8` with `pb-24` on phones to clear the sticky action strip.

**Breakpoints in use:** 640px (`sm`), 768px (`md`, header nav appears), 1024px (`lg`, headline note over the spread, taller line, the auth cover column), 1280px (`xl`, thumb tabs appear).

## Elevation & Depth

The system is flat paper. Depth is drawn, not lit: hairlines separate everything, and the cover's darker field marks the back of the diary. The one exception is the clipped printout, which casts a soft, diffuse shadow to read as a sheet lying on the page. There are no hard offset shadows, no glass, no blur. A focused field does not glow: its hairline thickens to two pixels of `ink` (a `1px` `box-shadow` under the border) and returns in 160ms.

### Shadow Vocabulary
- **Printout** (`box-shadow: 0 6px 18px -8px rgba(20, 22, 24, 0.28), 0 1px 0 rgba(20, 22, 24, 0.04)`): under `.clip` only, together with a `rule` border and a tilt of −0.8° (`.tilt-a`) or 0.7° (`.tilt-b`).
- **Printout, desk lamp** (`box-shadow: 0 8px 22px -8px rgba(70, 45, 10, 0.42), 0 1px 0 rgba(70, 45, 10, 0.08)`): the same shadow under `prefers-color-scheme: dark`; the only thing the dark scheme changes.
- **WhatsApp bubble** (`box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06)`): inside the printout only, part of WhatsApp's chrome.
- **Logo** (`shadow-sm` with `ring-1 ring-white/15`): the carried-over L logo in the header.
- **Thickened line** (`box-shadow: 0 1px 0 ink`, or `pen` when invalid): not a shadow but the second pixel of a field's line on focus or correction.

### Named Rules
**The Desk Lamp Rule.** Dark scheme never turns the page black. The paper stays `paper`, the ink stays `ink`; only the printout shadow warms to brown.

**The Clip Rule.** A screenshot is never shown bare and never inside a card. It is a `.clip`: paper-backed, `rule`-bordered, softly shadowed, tilted, with the drawn paperclip at its top reading-end corner. Portrait phone captures are cropped to 24rem and anchored top or bottom by content.

## Shapes

Square. Paper has no corners, so the diary draws none: the primary action, printouts, tabs, rows, the pricing table, the spread, form lines and the Google stub are all `border-radius: 0`. The highlighter is a skewed rectangle, not a pill: `skew(-6deg, -0.6deg)` behind the action, `skew(-5deg)` for the sweep, and a vertical gradient band (8%–88%) for the inline mark, so it bleeds past the glyphs like a real marker.

Lines are hairlines, one CSS pixel of `rule` or `rule-soft`. A form field is one hairline along its bottom edge and nothing else (no box); a readonly field's line is dashed. The one bordered element on paper besides a printout is the `.stub`, a hairline ticket for a foreign sign-in, whose border turns `ink` on hover. Drawn strokes (strike, pen marks) are round-capped, 2.4–2.5 units wide with `vector-effect: non-scaling-stroke` and a slight hand wobble in the path; the paperclip is 1.9.

The only rounded things are carried chrome: the L logo (`rounded-xl`), the WhatsApp printout's bubbles (`rounded-lg`) and avatar (`rounded-full`), the scrollbar thumb (`999px`), and the 2px focus outline radius.

## Components

### Buttons
The diary has no filled buttons. Actions are highlighted text, underlined text, or a hairline ticket.
- **Shape:** square, drawn as a skewed highlighter stroke behind display type (radius 0).
- **Primary (`.hl-cta`):** Secular One 1.375rem on `ink`, `padding: 0.3em 0.5em`, `min-height: 44px`, inline-flex with the label centred, `highlighter` band inset `0.08em -0.25em 0.12em -0.35em` and skewed `-6deg, -0.6deg`. The header variant is 1rem and the mobile sticky strip's is 1.15rem. All primary actions carry `data-cta`. As a real `<button>` (`button.hl-cta`, every form submit) it strips the UA chrome (`appearance: none; background: none; border: 0; font: inherit`) and keeps the same face and size; while pending it is `disabled`, fades to 60% with `cursor: progress`, and its band stays flat.
- **Hover / Active:** the band deepens to `highlighter-deep` and scales `1.035, 1.08` over 220ms `cubic-bezier(0.2, 0.8, 0.2, 1)`; active scales `0.99, 0.98`. Focus is the diary-wide `2px solid ink` outline at 3px offset.
- **Secondary (`.link-rule`, the underlined link):** Assistant 600 on `ink`, `min-height: 44px` when it is an action, 2px underline in `rule` at 6px offset that turns `ink` on hover (160ms). Used for non-featured pricing tiers, the Center inquiry trigger, "forgot?" beside the password label, the other way in under a note, the resend action, consent links, and the way back from a legal document. On the cover it is `cover-ink` underlined in `cover-ink-2`.
- **Stub (`.stub`, a foreign sign-in):** a full-width hairline ticket: `paper` background, 1px `rule` border, radius 0, Assistant 600 at 1rem on `ink`, `min-height: 44px`, `padding: 0.5rem 1rem`, the provider's own glyph (Google's four colours at 1.125rem) 0.6rem before the label. Hover turns the border `ink`; disabled fades to 60% with `cursor: progress`. Never a filled button.
- **Text links:** header nav and footer links underline on hover; on the cover they are `cover-ink-2` at rest and `cover-ink` on hover.

### Cards / Containers
There are none on paper. The two containers that exist are printouts.
- **Printout (`.clip`):** `paper` background, 1px `rule` border, Printout shadow, tilt a/b, `PenClip` at `top: -0.9rem; inset-inline-end: 1.1rem` (1.6rem × 3.2rem, `ink-3`). Contains one `<img>` at 100% width, or the WhatsApp chat plus a 0.68rem trust line.
- **WhatsApp printout (`.wa`):** `wa-paper` background, 1px `rule` border; `wa-green` head with white text (0.8rem 600 name, 0.62rem status); white bubbles at 0.72rem with `rounded-lg`, parent bubbles in `wa-bubble` aligned to the end; button rows under a `rgba(0,0,0,0.06)` top hairline; the ₪60 line carries `.hl-mark` in bold. Static by design.

### Inputs / Fields
A field is a line of the diary written on (`DiaryField`, `.field`): the label in the pen's hand above the line, the answer in ink on it. No box, no radius.
- **Label:** Amatic SC 700 at 1.5rem in `ink`, one line tall (`height: var(--line)`, bottom-aligned). When something sits beside it at the reading end (the "forgot?" link, a `.link-rule` at 0.875rem) the row is a `.field-head` flex with the two at opposite ends.
- **Input:** transparent, `appearance: none`, no border except `border-bottom: 1px solid rule`, radius 0, Assistant 1.0625rem in `ink`, `padding: 0 0.15em`, exactly one line tall (`height: var(--line)`). Placeholders are `ink-3`. Email and password inputs are `dir="ltr"`.
- **Focus:** the line thickens to `ink` (border colour plus `box-shadow: 0 1px 0 ink`) over 160ms; no outline, no glow.
- **Readonly:** text in `ink-3` on a dashed line.
- **Error:** `aria-invalid="true"` turns the line `pen` (border plus the 1px shadow); a `.field-error` note follows on the next line, `PenX` at 1rem then the message at 0.95rem, both in `pen`, linked by `aria-describedby`. A form-level failure is a `.form-error` note in the pen's hand at 1.35rem in `pen`, one line, above the action, `role="alert"`.
- **Autofill:** the paper is kept under browser autofill (inset paper shadow, `ink` text and caret).
- **The "or" divider (`.divider-pen`):** the word in the pen's hand at 1.3rem in `ink-3`, one line tall, with a `rule` hairline running out on both sides.

### Navigation
- **Header (cover strip):** sticky, `cover` background. L logo (size 9, `rounded-xl`, teal→violet gradient, white "L" 0.875rem 700) beside the LESSIO wordmark in Secular One 1.125rem `tracking-wide`; section links at `md`+ in 0.875rem 600 `cover-ink-2`; the locale toggle (0.75rem–0.875rem 600, `min-h-9`); login link; the primary action at 1rem. Shared as `DiaryHeader` with `nav` and `actions` slots; on the auth and legal pages the wordmark links home and the actions slot holds only the toggle and a back-to-home link.
- **Thumb index (`.tabs`):** fixed at the reading-end edge, vertically centred, `xl`+ only. One vertical tab per page: `paper` background, `rule` border with no reading-end border, 0.72rem 600 0.02em `ink-2`, `padding: 0.6rem 0.35rem`, 2px gap. Hover and the page in view (`aria-current`, computed at 40% of the scroller height) fill with `highlighter` and `ink`; 160ms transition. Rotated 180° in RTL. Landing page only.
- **Skip link:** `sr-only` until focused; then `highlighter` background at the reading-start top. Every diary page has one (`DiaryShell` `skipTo`), jumping to the note or the document.
- **Sticky action strip (mobile):** `sm:hidden`, fixed bottom, `paper` with a `rule` top hairline, note at 0.7rem `ink-2` beside the 1.15rem primary action; slides in over 300ms once the week has left the viewport, respecting the safe-area inset.

### Accordion (FAQ)
Hairline rows (`rule-t` list, `rule-b` items). The trigger is the question at 1.0625rem 600 with a `PenPlus` mark in `ink-2` that rotates 45° into a minus over 300ms (none under reduced motion). Content is 62ch max with `pe-9`; the opening sentence is bold, the rest `ink-2`.

### Pen marks (icon system)
SVG marks in `LandingPenMarks.tsx`, `currentColor`, `fill: none`, stroke 2.4, round caps and joins, `non-scaling-stroke`, each one or two strokes with a hand wobble. Small marks at `size-5` (1.25rem): **PenCheck** (list ticks, `ink`), **PenX** (the "not for" list in `pen`; a field's correction note at 1rem), **PenPlus** (FAQ). **PenUnderline** (200 × 12, stroke 2.6, `pen`) sits under page titles. **PenClip** (1.5rem × 3rem, stroke 1.9) is on every printout. Four margin doodles on a 48-box at `size-12`: **PenSeal**, **PenQuietBubble**, **PenCheckbox**, **PenToggle**, drawn beside the trust promises; **PenCheckbox** is also the ticked box a note page draws (two lines square) when a verification or reset email has gone out. These, plus the Google glyph inside its stub, are the diary's only icons.

### The note page (signature, auth)
`AuthNotePage` on the paper column of `AuthSplitShell`: a `display` title at 2.1rem wrapped in `.title-pen` (its own `data-pen`, the red underline drawn on arrival, `bottom: -0.1em; height: 0.3em`), then the form as one `.np-block`, then an optional second block (the "or" divider and the Google stub) and a footer line in `ink-2` with the other way in as a `.link-rule`. Sign-in: email, password with "forgot?" beside its label, the action, the divider, the stub, "no account?". Sign-up: organisation, name, email, the two password lines side by side at `sm`, a red form note if needed, the action, the consent line with two `.link-rule`s. Verify and forgot-sent: a `data-pen` block that draws the `PenCheckbox` (`.doodle`, wiped in from the reading start over 520ms) above the body line, then the resend `.link-rule` in an action row. Every block sits on the ruling (see Layout, note page rhythm). On the sign-up cover only, the trial note is `.hl-mark`ed with `ink` text; on every other auth page it is plain `cover-ink`.

### The legal document (signature)
`article.legal-doc`: the title in `.title-pen`, the version line in the pen's hand (1.35rem, `ink-3`) 0.75rem under it, then the prose. `h2` Secular One 1.5rem on a `rule` hairline (`padding-bottom: 0.35rem`, 2.5rem above, 0.75rem below); `h3` Assistant 700 1.125rem (1.5rem above); paragraphs and list items in `ink-2` with 0.75rem between paragraphs and 0.35rem between items; `strong` back to `ink`; `ul` disc and `ol` decimal, indented 1.25rem, markers in `ink-3`; links `ink` 600 underlined 2px in `rule` at 5px offset, `ink` on hover; tables full width at 1rem, collapsed, a `rule` hairline above and under every row, `th` bold `ink`, `td` `ink-2` with tabular numerals, cells `padding: 0.5rem 0.4rem`, start-aligned; a quoted block (`.legal-note`) as a note on a side rule (`border-inline-start: 1px solid rule`, `padding-inline-start: 1rem`). No decoration behind the text, no card around it.

### The week spread (signature)
Server-rendered grid (`role="img"` with the synthetic-week label). Day heads are Secular One 0.95rem → 1.125rem with the date in `ink-3` tabular under it, on a `rule` hairline. Entries are pen 700, one line, ellipsised at `sm`+ and wrapped to two pen lines on phones. The story cell is `overflow: visible; z-index: 2` and carries three things: the entry with its `.strike` SVG (path `M2 11 C 20 9, 40 13, 60 10 S 90 9, 98 11`, `pen`, width 2.5), the `.after-note` freed-slot note in `ink-3` (hidden on phones), and the `.sweep` margin note in pen hand pinned one `--line` below the entry at the reading start.

### The month-end ledger (signature)
On the cover, max 28rem. Secular One 1.35rem title on a `rule-b` hairline; `rule-b` rows at `py-3` with the label at the start and the tabular amount at the end; the final row is bold 1.15rem. The cancellation line is the last row: bold, `.arrive`, with its amount at 1.35rem in `.sweep`. Under the ledger, the "approved" line in pen hand at 1.6rem in `highlighter`.

### The pen writes (motion)
One `IntersectionObserver` (`root` = the diary scroller, threshold 0.45) adds `.is-on` to each `data-pen` element once and unobserves it. The `data-pen` elements are the spread, the ledger, every page title (`PageTitle`, the plans title, the questions title), the note page and legal document titles, and the sent-email block on a note page. From `.is-on`:
- **Strike:** `clip-path` wipe from the reading start, 520ms `cubic-bezier(0.3, 0, 0.1, 1)`, delay 300ms; the struck entry fades to `ink-3` over 300ms after 700ms.
- **Sweep:** `scaleX(0 → 1)` from the reading-start origin, 420ms `cubic-bezier(0.2, 0.8, 0.2, 1)`, delay 900ms; the note's text inks in over 240ms after 1100ms.
- **After-note:** inks in over 360ms after 1500ms.
- **Arrive (ledger):** the ₪60 row comes down 1.25rem into place while fading in, 520ms `cubic-bezier(0.2, 0.8, 0.2, 1)`, delay 200ms, then its amount is swept.
- **Title underline:** each page title is wrapped in `.title-pen` with a `PenUnderline` SVG (one hand stroke, red pen, 2.6 non-scaling) sitting on its baseline; it is revealed by the same `clip-path` wipe from the reading start, 460ms, delay 120ms. The hero headline and the cover titles are not underlined.
- **Doodle:** a margin doodle or the note page's ticked box is wiped in from the reading start over 520ms, staggered by `--doodle-delay` (260ms per row on the trust page; none on a note page).
- **Field line:** border colour and the 1px shadow move over 160ms on focus and correction; the stub's border over 160ms on hover.
- **Phones (under 640px):** page titles, intros, closing lines, the hero headline block, the plans, the closing spread, the footer and the note page are centred; ruled lists and form fields keep their start alignment and are centred as blocks. The highlighter action is an inline-flex box so its label sits in the middle of the stroke.
- **Reduced motion:** every one of these is set to its final state with `animation: none`, and `scroll-behavior` is `auto`.

## Do's and Don'ts

### Do:
- **Do** structure every list, table and calendar as hairline rows (`rule` between sections, `rule-soft` inside), on ruled paper at one line per `--line` (2.25rem; 2.75rem on the spread at `lg`).
- **Do** set the primary action as the highlighter stroke (`.hl-cta`: Secular One 1.375rem on `ink`, `highlighter` band skewed −6°, 44px minimum) and keep `data-cta` on it; as a form submit make it a real `button.hl-cta` with a disabled pending state.
- **Do** keep the highlighter to the primary action, the ₪60 and the page in view (on sign-up, the trial note on the cover), and let it deepen to `highlighter-deep` only on hover.
- **Do** use the red pen for strikes, numerals, pen-hand titles, the cross mark and the correction under a wrong answer, always as ink, never as a fill.
- **Do** write a form on the ruling: `DiaryField` with a pen-hand label above a `rule` hairline, the answer in ink on it, focus thickening the line to `ink`, `aria-invalid` turning it `pen` with a `PenX` note.
- **Do** keep every block on a note page a whole number of lines (`.np-block`, `.np-action`, `.np-stub`, paragraphs at `line-height: var(--line)`) so the form's lines are the page's ruling, and rule the paper column from its own top edge.
- **Do** clip screenshots into the page (`.clip`: paper, `rule` border, Printout shadow, ±0.8° tilt, drawn paperclip) and keep the WhatsApp exchange in WhatsApp's own colours.
- **Do** write in Amatic SC only where a hand would write, and set every amount, hour and date tabular.
- **Do** use the pen marks for icons; draw a new one the same way (stroke 2.4, round caps, one or two wobbly strokes) if one is missing.
- **Do** set a legal document in `.legal-doc` at 68ch: Secular One `h2` on a hairline, `ink-2` body, hairline tables with tabular figures, and the version line in the pen's hand under the title.
- **Do** author motion once, class-toggled from `data-pen`, and give every animated element a reduced-motion final state.
- **Do** write layout in logical properties so the Hebrew RTL baseline and English LTR share one stylesheet; reveal strokes from the reading start.
- **Do** render every public page through `DiaryShell` (`DiaryHeader`, `DiaryFooter`) so the faces, the skip link and the pen observer are loaded once.

### Don't:
- **Don't** put a card, panel, filled box, border-radius or glass surface on the paper; the ruling is the only geometry. The only bordered things are a printout and the `.stub` ticket for a foreign sign-in.
- **Don't** box a form field; it is one hairline along its bottom edge, never a bordered rectangle with a glow.
- **Don't** add an eyebrow or kicker above a heading; notes go under the action or under the title, in pen.
- **Don't** use a second colour field beyond the cover teal, and don't put the cover anywhere but the header strip, the closing spread, the footer and the facing column of an opened note page.
- **Don't** use gradient text, hard offset shadows, or blur; the only shadow is the printout's diffuse one.
- **Don't** import glyph icons (Lucide, Heroicons, icon fonts) onto any diary page; the one foreign mark allowed is a provider's own glyph inside its `.stub`.
- **Don't** turn the page dark under `prefers-color-scheme: dark`; only the printout shadow changes.
- **Don't** let the diary's tokens or `.diary` rules leak into the app shell, and don't restyle the app shell's shadcn/oklch system from here; the dashboard, admin and portal are not diary pages.
- **Don't** set the whole page in the pen face, and don't set body copy below 1.0625rem outside labels, hours, corrections and printout chrome.
