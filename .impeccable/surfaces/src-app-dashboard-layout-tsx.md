---
version: 1
slug: "src-app-dashboard-layout-tsx"
primary_target: "src/app/(dashboard)/layout.tsx"
related_targets: ["src/app/(dashboard)/dashboard/page.tsx","src/components/dashboard/lessons/WeekViewClient.tsx"]
---

# The product shell (`src/app/(dashboard)/`, teacher sub-shell, admin, portal, booking) — surface brief

Scope: the authenticated product's visual system, starting with the foundations (tokens, faces, shell, primitives) and two proof screens, `/dashboard` and `/lessons`. Visitor mode: **Operate**. A second register of the established world in DESIGN.md, not a new world. Decision #48 in `docs/decisions.md` is the product-side authority.

Audience and job: a centre owner, office manager or teacher working in the product for hours: dense tables, long forms, a calendar with dozens of lessons a day. The tool must disappear into the task; familiarity is a feature.

## Direction contract (extension, Operate register)

THESIS: The product wears the diary's materials, not its costume. It refuses both the previous identity (navy sidebar, brand blue, pastel status tints, a Latin-only face) and the temptation to bring the diary's metaphor inside (handwritten labels, fields on a ruling, drawing animations).

OWN-WORLD: paper `#ffffff` on a canvas tinted from the ruling; ink `#141618` / `#4a5058`; hairlines `#d5e0ea` and `#a9c4db`; the cover teal `#115e59` as primary and as the sidebar; the highlighter `#ffe34d` reserved for the one primary action of a screen, the selected item and an amount needing attention; the red pen `#c8102e` for cancelled, overdue and destructive; radius 0.3rem; hairline cards with no shadow; Assistant as the single UI family on a fixed rem scale; Secular One only in the page title and the wordmark; lucide icons stay (standard affordances). One five-tone status palette (`src/lib/ui/statusTone.ts`).

STORY: The owner who signed up from the diary recognises its colours and its calm when they land inside, and then stops noticing the interface. Four diary moments mark where the product does what the landing page promised: the struck-out cancelled lesson, the "approved" monthly bill, the pen in empty states and onboarding, and "needs attention" as margin notes.

FIRST VIEWPORT (`/dashboard`): the teal cover sidebar with the L mark, the LESSIO wordmark in Secular One and a highlighter rail on the active item; a white top bar on a hairline; the page title in Secular One with the screen's one primary action in the highlighter; hairline paper cards; status badges from the five tones.

FORM: extension of the teacher's paper week diary (seed 6fb73d73), Operate register; no new roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
