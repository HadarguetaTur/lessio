# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the owner of a tutoring centre in Israel with two to five teachers, a few dozen to a few hundred students, and monthly billing to parents. They reach Lessio from a spreadsheet, a WhatsApp thread per family, and Bit or bank transfers. Their state of mind when they arrive: operational overload, cancellations that were never charged, a month-end that takes days, and a sense that the business is held together by hand.

Other people who touch the product, all confirmed:

- `admin` / office manager: day-to-day operations in the same dashboard, no financial settings.
- `teacher`: their own schedule, availability, lesson outcomes and homework in a reduced workspace.
- Parents: never see the dashboard. They use the centre's WhatsApp number (buttons and menus, no free-text understanding) and a phone-OTP parent portal.
- Students: receive homework and reminders on WhatsApp.

A single private tutor is a supported plan (Solo) but not the audience the marketing addresses.

## Product Purpose

Lessio is a multi-tenant operating system for tutoring centres: scheduling, cancellations, monthly billing, payments, receipts, homework, reports and parent communication over official WhatsApp, in one record per student.

Success for the owner is measured in one sentence: every cancellation is priced and collected, and every month closes with one approval. Time saved and "calm" are consequences, not the promise.

## Positioning

The mechanism a neighbouring product cannot truthfully copy: a cancellation policy the parent sees and confirms inside WhatsApp before it is final, and a monthly bill per student that builds itself from lessons, subscriptions and cancellation charges, goes out as a WhatsApp payment request after one approval, and is followed by a receipt from a licensed Israeli provider. The parent never installs anything. Nothing is charged, sent or cancelled without a confirmation from a human.

Lessio was not built for every tutor. It was built for a business that already runs.

## Operating Context

- Hebrew-first, right-to-left, with native English (never translated sentence by sentence). The WhatsApp bot answers in the parent's language.
- Meta's WhatsApp Business Platform, App Review approved, one business number per centre, approved message templates. Unofficial WhatsApp automations are explicitly rejected.
- Payments through Bit, PayBox, Cardcom, PayPlus, Stripe and Grow. Receipts and tax documents only through licensed external providers (Green Invoice, iCount, Sumit); Lessio never issues tax documents itself.
- Jewish and Israeli holidays load into the calendar automatically. Cancellation policies follow the lessons world (hours before the lesson, percentage charged), not retail refunds.
- Google login and read-only Google Calendar conflict detection exist. Two-way calendar sync does not.
- Rollout: spreadsheet import of students, parents and lessons; the system works before WhatsApp is connected. Connecting WhatsApp through Meta is the longest setup step.

## Capabilities and Constraints

Claims the marketing may make are limited to shipped behaviour. Explicitly not claimable:

- free-text natural-language understanding ("Noa won't come tomorrow" is not parsed; flows are button and menu driven);
- rescheduling a lesson from WhatsApp;
- two-way Google Calendar sync;
- a broad "AI secretary" (the staff copilot classifies an intent and always requires a confirm tap);
- "only we have official WhatsApp", or any claim about competitors;
- customer names, testimonials, usage numbers or benchmarks (none exist yet).

Plan catalog (decision #39, final): Solo ₪149/month (one teacher), Studio ₪349/month (up to five teachers), Center by bespoke quote (six or more). Every paid tier carries every feature; the only value metric is teacher seats. Prices are final with no VAT added and are read from the database at render time, never hard-coded in copy. The trial is 30 days of the full Studio plan, no credit card. The Hebrew word for a tier is «מסלול».

Terminology: lesson, student, parent, teacher, cancellation charge, monthly bill, payment request, receipt, parent portal, punch card (כרטיסייה), subscription (מנוי).

Landing page technical constraints: one React component tree renders both locales from `src/lib/marketing/landingCopy.ts`; direction (`rtl`/`ltr`) comes from the locale; pricing rows come from `getPublicPricingRows()`; primary calls to action carry `data-cta` attributes read by the attribution tracker; the Center inquiry form posts through a server action passed as a prop; legal links (privacy, terms, data deletion) and business contact details in the footer are required for Meta and Google app review.

## Brand Commitments

- The name LESSIO, set in caps in the wordmark.
- The existing logo: a white "L" on a rounded square with a teal-to-violet gradient. It is the only visual element carried over from the previous landing page. The dashboard palette and the Heebo typeface are not binding for the landing page.
- Voice: short sentences, no exclamation marks, no promises the code cannot keep, no hype. The page tells one story, a parent's 21:40 WhatsApp message becoming a priced charge, a freed slot and a line on the monthly bill.

## Evidence on Hand

- Twelve real product screenshots per locale under `public/landing/{he,en}/`: the WhatsApp cancellation flow, the dashboard "needs attention" card, the weekly calendar, the billing detail and table, the payment request in WhatsApp, the parent portal (payments, booking), teachers, the homework board, the revenue report. Dashboard frames are 1920×1080, phone captures 780×1688.
- One worked example that must stay numerically consistent everywhere it appears: Noa Levi, lesson 31/08 at 14:00 with Michal Abramov, ₪120 lesson, policy "within 24 hours full charge, within 2 hours 50%", cancelled at 21:40 the evening before, charge ₪60.
- Absent, and not to be fabricated: named customers, logos, quotes, adoption or revenue numbers, press. A 75-second demo video exists on YouTube but its narration still addresses "private tutors and learning centres" and is not embedded on the landing page.

## Product Principles

1. One promise before anything else: every cancellation priced and collected, every month closed with one approval.
2. Show, do not claim: real screens and the worked example carry the argument; nothing is asserted that the product cannot demonstrate.
3. Filter rather than flatter: the page says who it is not for.
4. Nothing happens without a confirmation, and the copy never implies otherwise.
5. Hebrew is the baseline; English is written natively, not translated.

## Accessibility & Inclusion

Right-to-left and left-to-right must both be first-class. The product-wide UX audit gate is zero axe Critical or Serious findings; the landing page is held to the same bar. Entrance motion must respect `prefers-reduced-motion`.
