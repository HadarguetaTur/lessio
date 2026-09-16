---
version: 1
slug: "src-components-marketing-landingpage-tsx"
primary_target: "src/components/marketing/LandingPage.tsx"
related_targets: ["src/lib/marketing/landingCopy.ts","src/components/marketing/LandingPricing.tsx","src/components/marketing/LandingWhatsAppChat.tsx","src/components/marketing/LandingFaqAccordion.tsx"]
---

# Landing page (`/`) — surface brief

Scope: the public landing page only, both locales (he RTL baseline, en LTR), rendered by `src/components/marketing/LandingPage.tsx` from `src/lib/marketing/landingCopy.ts`. Visitor mode: **Persuade**.

Audience and job: the owner of an Israeli tutoring centre with 2–5 teachers and monthly billing, arriving from a cold email, an ad or a WhatsApp link, deciding within seconds whether this is for them and starting a 30-day trial. Proof allowed: real product screenshots under `public/landing/{he,en}/` and the worked example (Noa Levi, 31/08 14:00, ₪120 lesson, cancelled 21:40, policy 24h full / 2h 50%, charge ₪60). No customers, quotes, numbers or video embed. Prices come from `getPublicPricingRows()`; CTAs keep `data-cta`; the Center inquiry dialog, locale toggle, legal footer links and contact details stay.

Untouched: login, signup, legal pages, dashboard, the LESSIO wordmark and the existing L logo.

## Direction contract

THESIS: The page is a teacher's paper week diary, opened to the week the cancellation happened. It refuses the category scaffold, hero plus screenshot cards plus three-column features, entirely: no eyebrow, no cards, no gradient text, no glass. The diary's ruling lines are the only geometry on the page, for the calendar, the pricing table and the FAQ alike.

OWN-WORLD: True white paper (#FFFFFF) ruled with pale-blue hairlines (#A9C4DB) on an hour grid; ink #141618; a red pen (#C8102E) that strikes and annotates; one fluorescent highlighter (#FFE34D) reserved for the ₪60 and the primary action; the diary's deep teal-green hard cover (#115E59) as the committed colour field for the cover strip, the month-end summary pages and the closing spread. Display face Secular One (he+en), text Assistant, pen entries Amatic SC. Type weight tracks state: scheduled regular, cancelled struck, charged bold. Icons drawn as pen marks, not glyphs. Dark mode is the diary under a desk lamp: same paper, warmer shadow; never a black page.

STORY: The visitor recognises their own week, watches one lesson get struck out in red, priced in the margin in highlighter, and reappear as a bold line on the month-end summary page at the back of the diary. They believe cancellations will be collected and the month will close, and they start the trial from the highlighted line.

FIRST VIEWPORT: Full-bleed week spread; hours 08:00–22:00 down the reading-start side; five day columns Sun–Thu in reading order (right-to-left in Hebrew). Tuesday 31/08 at 14:00 holds "נועה לוי · פסנתר" in pen. The headline sits in the top reading-start corner over the spread, two lines in Secular One, followed by the highlighter-marked primary action and its no-card note. The WhatsApp exchange is a small clipped printout over the far column. In the margin, in highlighter: "ביטול 21:40 · ₪60". Signature interaction, scroll-driven and authored once: the red strike draws across the cell, the margin note writes itself, the cell empties, and the ₪60 travels down the page into the month-end summary line. Reduced motion shows the final state.

FORM: the teacher's paper week diary, candidate 3 on my ordered grounded list; seed key 6fb73d73; assigned card locked by Hadar on 16.09.2026; code-led, no comp.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
