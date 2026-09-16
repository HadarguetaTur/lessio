---
version: 1
slug: "src-components-marketing-legalsimplelayout-tsx"
primary_target: "src/components/marketing/LegalSimpleLayout.tsx"
related_targets: ["src/app/privacy/page.tsx","src/app/terms/page.tsx","src/app/data-deletion/page.tsx"]
---

# Legal pages (`/privacy`, `/terms`, `/data-deletion`) — surface brief

Scope: the three public legal documents, both locales, rendered through `src/components/marketing/LegalSimpleLayout.tsx`. Visitor mode: **Read**. An extension of the established world in DESIGN.md; the document prose (`PrivacyHe/En.tsx`, `TermsHe/En.tsx`, the data-deletion page) keeps its content and structure and is styled by `.legal-doc` in `src/components/diary/diary.css`.

Audience and job: a signing-up owner checking what they agree to; Meta and Google reviewers verifying the policy links; a parent asking how to delete their data. Reading must be comfortable on a phone.

## Direction contract (extension)

THESIS: A contract written into the diary: the same paper, the same ruling, one reading column, the title underlined by the pen, the version line in the pen's hand under it. No decoration behind the text (the pastel shapes are gone), no card around it.

OWN-WORLD: DESIGN.md's world plus the document vocabulary in `.legal-doc`: h2 in Secular One 1.5rem on a `rule` hairline, h3 Assistant 700, body and list items in `ink-2` at the body size, disc/decimal lists with `ink-3` markers, links underlined in `rule` turning `ink`, tables as hairline rows with tabular figures, and a quoted block as a note on a side rule (`.legal-note`).

STORY: The reader recognises the diary, reads a document set like a printed contract on its pages, and finds the way back to the front cover at the end.

FIRST VIEWPORT: the cover strip with the back link, the title underlined by the pen, the version/updated line under it in the pen's hand, the first section on ruled paper in a 68ch column.

FORM: extension of the teacher's paper week diary (seed 6fb73d73); no new roll.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
