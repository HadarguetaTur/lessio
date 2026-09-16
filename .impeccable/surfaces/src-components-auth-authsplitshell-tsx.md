---
version: 1
slug: "src-components-auth-authsplitshell-tsx"
primary_target: "src/components/auth/AuthSplitShell.tsx"
related_targets: ["src/components/auth/AuthNotePage.tsx","src/components/diary/DiaryField.tsx","src/app/login/LoginForm.tsx","src/app/signup/SignupForm.tsx"]
---

# Auth pages (`/login`, `/signup`, `/signup/verify`, `/signup/complete`, `/forgot-password`, `/reset-password`) — surface brief

Scope: the public sign-in family, both locales, rendered through `src/components/auth/AuthSplitShell.tsx` (the diary opened at a note page) and `AuthNotePage.tsx`. Visitor mode: **Operate** (the visitor completes a form), inside the landing page's Persuade world. This is an extension of the established world in DESIGN.md, not a new one.

Audience and job: a centre owner arriving from the landing page's "try free" action or the demo email, with one thing to do: create an account, sign in, or recover a password. Copy stays in next-intl (`auth.*`); server actions untouched; `/reset-password` stays gated by the `pw_reset` cookie in `src/proxy.ts`.

## Direction contract (extension)

THESIS: The diary does not close when the visitor clicks "try free". The cover carries the one promise from the landing page; the facing page is a note on ruled paper with the form written on the lines. No card, no panel, no filled button.

OWN-WORLD: DESIGN.md's world. New vocabulary added here, all evidenced in `src/components/diary/diary.css`: `.field` (label in the pen's hand, input on a `rule` hairline, focus thickens to `ink`, error turns the line `pen` red with a `PenX` note), `button.hl-cta` (the highlighter as a real button), `.link-rule` (secondary action underlined in `rule`), `.stub` (Google sign-in as a hairline ticket, the only bordered thing besides a printout), `.divider-pen` ("or" in the pen's hand on the ruling), `.note-page` (one 26rem column, centred on phones).

STORY: The visitor recognises the diary they just read, writes their details on the lines, and the same highlighter that said "try free" now says "create the account". A failed sign-in is a red pen line under the password with a short note; a sent email is a ticked box the pen draws.

FIRST VIEWPORT: at `lg`+, the cover on the reading-start side with the promise in Secular One, the subheadline in `cover-ink-2`, and the trial note in the pen's hand on a highlighter mark; the note page on ruled paper on the other side, title underlined by the pen, fields on the ruling, the highlighter action, the divider and the Google stub, the other-way-in line. On phones, the header strip, one pen line of the promise on the cover, then the note.

FORM: extension of the teacher's paper week diary (seed 6fb73d73); no new roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
