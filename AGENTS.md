# LESSIO — AI Operating Manual
*Current Sprint: Sprint 20 — AI Assistant + WhatsApp Hardening*

---

## Project Overview

LESSIO is a multi-tenant SaaS platform for tutoring businesses and learning centers.
It replaces manual scheduling, billing, and WhatsApp coordination with a structured, automated system.

**Tech Stack:** Next.js 16 App Router + TypeScript (strict) | Supabase (Postgres + Auth + Edge Functions) | shadcn/ui (Nova) | Meta WhatsApp Cloud API | Vercel

---

## Current Sprint: Sprint 20 — AI Assistant + WhatsApp Hardening

**Sprint source of truth:** `/docs/sprint-20-scope.md`

**Goal:**
- Wire idempotency layer (`claimIncomingMessage` / `releaseIncomingMessageClaim`) into the webhook handler
- Complete conversation log write path (user + assistant turns)
- Remove silent dead-ends in the webhook (no-student, unresolvable parent, token decryption failure)
- Harden AI runtime: API key guard in settings action + OpenAI error classification
- Regression tests: idempotency helpers, retry/duplicate webhook paths, conversation log, fallback

**Users in scope:**
- WhatsApp: parents (receive reliable replies, no silent drops)
- Dashboard: owner (AI enable guard, key-absent warning)

**New dependencies:** none

**New env vars:** none

**Schema changes:** none (all tables built in Sprint 19)

---

## Implementation Status

| Layer | Status |
|---|---|
| /docs baseline (plan, schema, decisions, security, sprint scopes) | ✅ Done |
| Next.js project initialized | ✅ Done |
| shadcn/ui initialized (Nova preset) | ✅ Done |
| Supabase project connected | ✅ Done |
| DB migrations (all tables) | ✅ Done (Sprint 1) |
| RLS baseline | ✅ Done (Sprint 1) |
| Booking engine (getAvailableSlots, slot locking, confirmBooking) | ✅ Done (Sprint 1) |
| Booking WebView (`/book/[token]`) | ✅ Done (Sprint 1) |
| WhatsApp webhook | ✅ Done (Sprint 1) |
| JWT booking link generator | ✅ Done (Sprint 1) |
| Seed data | ✅ Done (Sprint 1) |
| Route protection + dashboard shell | ✅ Done (Sprint 2) |
| Students CRUD | ✅ Done (Sprint 2) |
| Parents CRUD | ✅ Done (Sprint 2) |
| Parent-Student relationships | ✅ Done (Sprint 2) |
| Teachers CRUD + invite flow | ✅ Done (Sprint 2) |
| Teacher availability (weekly) | ✅ Done (Sprint 2) |
| Availability overrides | ✅ Done (Sprint 2) |
| Today view dashboard | ✅ Done (Sprint 2) |
| Weekly calendar | ✅ Done (Sprint 2) |
| Lesson status updates | ✅ Done (Sprint 2) |
| teachers.hourly_rate migration + UI | ✅ Done (Sprint 3) |
| Cancellation policy model + owner UI | ✅ Done (Sprint 3) |
| calculateCancellationCharge (pure lib + tests) | ✅ Done (Sprint 3) |
| Billing parent resolution | ✅ Done (Sprint 3) |
| Manual lesson cancellation from dashboard | ✅ Done (Sprint 3) |
| Charge engine (idempotent) | ✅ Done (Sprint 3) |
| Automatic charge on lesson completed | ✅ Done (Sprint 3) |
| Charges list UI + filters | ✅ Done (Sprint 3) |
| Mark charge as paid + note | ✅ Done (Sprint 3) |
| Parent debt summary | ✅ Done (Sprint 3) |
| Lead capture + deduplication | ✅ Done (Sprint 4) |
| Leads management list UI | ✅ Done (Sprint 4) |
| Lead conversion to parent + student | ✅ Done (Sprint 4) |
| WhatsApp cancellation intent detection + lesson selection | ✅ Done (Sprint 4) |
| Apply cancellation + charge outcome + notifications | ✅ Done (Sprint 4) |
| Build + send payment request | ✅ Done (Sprint 4) |
| Sprint 4 acceptance + regression | ✅ Done (Sprint 4) |
| Teacher calendar view | ✅ Done (Sprint 5) |
| Teacher lesson outcome update | ✅ Done (Sprint 5) |
| Route guards and server action hardening | ✅ Done (Sprint 5) |
| Org isolation and RLS validation | ✅ Done (Sprint 5) |
| UX polish on touched Sprint 5 flows | ✅ Done (Sprint 5) |
| Archive integrity / duplicate-submit / stale-state hardening | ✅ Done (Sprint 5) |
| Sprint 5 acceptance + regression | ✅ Done (Sprint 5) |
| Secret and access audit | ✅ Done (Sprint 6) |
| Structured logging + error visibility | ✅ Done (Sprint 6) |
| Graceful failure handling for external flows | ✅ Done (Sprint 6) |
| Environment separation + env validation | ✅ Done (Sprint 6) |
| Migration discipline + release checklist | ✅ Done (Sprint 6) |
| E2E scenario QA on staging | ✅ Done (Sprint 6) |
| Cross-cutting QA + Data Recovery Playbook | ✅ Done (Sprint 6) |
| First customer onboarding checklist | ✅ Done (Sprint 6) |
| First customer staging validation | ✅ Done (Sprint 6) |
| Backup and restore validation | ✅ Done (Sprint 6) |
| First customer readiness | ✅ Done (Sprint 6) |
| lesson_students junction table + lesson_type + group_pricing_mode (pre-S7 migration) | ✅ Done (Sprint 7) |
| Per-org whatsapp_phone_number_id + encrypted whatsapp_access_token (schema) | ✅ Done (Sprint 7) |
| AES-256-GCM token encryption utility (`src/lib/crypto/index.ts`) | ✅ Done (Sprint 7) |
| WHATSAPP_TOKEN_ENCRYPTION_KEY / META_APP_ID / META_APP_SECRET env validation | ✅ Done (Sprint 7) |
| Owner WhatsApp settings page + Meta Embedded Signup UI | ✅ Done (Sprint 7) |
| saveWhatsAppConnection + disconnectWhatsApp server actions | ✅ Done (Sprint 7) |
| Webhook routing cutover: phone_number_id lookup + decrypted token | ✅ Done (Sprint 7) |
| WhatsApp nav entry in sidebar | ✅ Done (Sprint 7) |
| Schema migration: organizations.payment_provider + payment_config_encrypted + charges columns | ✅ Done (Sprint 8) |
| Payment abstraction layer: PaymentProvider interface + factory.ts + cardcom.ts + payplus.ts | ✅ Done (Sprint 8) |
| Owner payment settings page + savePaymentProvider + disconnectPayment | ✅ Done (Sprint 8) |
| sendPaymentRequest updated to use factory + real payment link | ✅ Done (Sprint 8) |
| Payment webhook POST /api/payments/[provider] | ✅ Done (Sprint 8) |
| PAYMENT_CONFIG_ENCRYPTION_KEY env validation + .env.local.example | ✅ Done (Sprint 8) |
| Payment nav entry in sidebar (owner) | ✅ Done (Sprint 8) |
| Charges UI: payment_link + payment_provider display | ✅ Done (Sprint 8) |
| Schema migration: organizations.auto_send_payment_request | ✅ Done (Sprint 9) |
| KPI stats query (src/lib/dashboard/stats.ts) | ✅ Done (Sprint 9) |
| Dashboard KPI cards (monthlyRevenue, pendingDebt, lessonsThisMonth, activeStudents) | ✅ Done (Sprint 9) |
| Charges aging summary bar (pending / invoiced / paid this month) | ✅ Done (Sprint 9) |
| autoSendPaymentRequest fire-and-forget after lesson completion | ✅ Done (Sprint 9) |
| Auto payment request toggle in /settings/payment (owner) | ✅ Done (Sprint 9) |
| Schema migration: organization_holidays table + RLS | ✅ Done (Sprint 10) |
| src/lib/organizations/holidays.ts — getOrgHolidays | ✅ Done (Sprint 10) |
| /settings/holidays — holiday management page + actions (owner/admin) | ✅ Done (Sprint 10) |
| getAvailableSlots: block slots on holiday dates | ✅ Done (Sprint 10) |
| /teacher/availability — teacher self-service availability page + actions | ✅ Done (Sprint 10) |
| /teacher/overrides — teacher self-service overrides page + actions | ✅ Done (Sprint 10) |
| Sidebar: חגים וחופשות (owner/admin), הזמינות שלי + חריגים ביומן (teacher) | ✅ Done (Sprint 10) |
| Teacher schedule: holiday label in week grid | ✅ Done (Sprint 10) |
| Schema migration: lesson_series table + lessons.series_id + RLS | ✅ Done (Sprint 11) |
| src/lib/lessons/createSeries.ts — createLessonSeries (conflict detection + partial success) | ✅ Done (Sprint 11) |
| src/lib/lessons/cancelSeries.ts — cancelLessonSeries (all / from_date scopes) | ✅ Done (Sprint 11) |
| /lessons/new-series — admin form + createSeriesAction + result summary | ✅ Done (Sprint 11) |
| /lessons/[id] — SeriesBanner + cancelSeriesAction (from_date / all) | ✅ Done (Sprint 11) |
| /lessons — Repeat badge on series lessons + "יצירת שיעורים קבועים" button (owner/admin) | ✅ Done (Sprint 11) |
| Schema migration: organizations reminder columns + notification_log table + RLS | ✅ Done (Sprint 12) |
| /settings/reminders — reminder settings page + saveReminderSettings action (owner) | ✅ Done (Sprint 12) |
| Sidebar: תזכורות nav entry (owner) | ✅ Done (Sprint 12) |
| supabase/functions/lesson-reminders — hourly cron, dedup via notification_log | ✅ Done (Sprint 12) |
| supabase/functions/payment-reminders — daily 09:00 UTC cron, dedup via notification_log | ✅ Done (Sprint 12) |
| supabase/functions/_shared/crypto.ts — Deno AES-256-GCM decryption (SubtleCrypto) | ✅ Done (Sprint 12) |
| supabase/functions/_shared/whatsapp.ts — sendTextMessage for Deno | ✅ Done (Sprint 12) |
| Cron registration in config.toml (lesson-reminders + payment-reminders) | ✅ Done (Sprint 12) |
| Notification log UI — last 20 entries in /settings/reminders (owner) | ✅ Done (Sprint 12) |
| supabase/migrations/..._portal_otps.sql — portal_otps table + index + RLS | ✅ Done (Sprint 13) |
| src/lib/lessons/createLesson.ts — single lesson creation with full conflict checks | ✅ Done (Sprint 13) |
| src/lib/portal/session.ts — sign/verify portal JWT, set/get httpOnly cookie | ✅ Done (Sprint 13) |
| src/lib/portal/otp.ts — OTP generation, SHA-256 hash, send via WhatsApp, verify | ✅ Done (Sprint 13) |
| /lessons/new — admin single lesson creation page + actions + NewLessonForm | ✅ Done (Sprint 13) |
| /teacher/new-lesson — teacher single lesson creation page + actions | ✅ Done (Sprint 13) |
| /portal/[orgId]/layout.tsx — mobile-first portal shell, top bar, bottom tabs | ✅ Done (Sprint 13) |
| /portal/[orgId]/page.tsx — redirect to login or home based on session cookie | ✅ Done (Sprint 13) |
| /portal/[orgId]/login — phone entry + OTP verify, set portal_session cookie | ✅ Done (Sprint 13) |
| /portal/[orgId]/home — upcoming lessons + outstanding balance (server component) | ✅ Done (Sprint 13) |
| /portal/[orgId]/book — PortalBookingFlow + portal-scoped server actions | ✅ Done (Sprint 13) |
| /portal/[orgId]/payments — charges history + payment links | ✅ Done (Sprint 13) |
| /settings/page.tsx — settings landing page with category cards (owner/admin) | ✅ Done (Sprint 13) |
| Sidebar: grouped sections (Operations / Settings / Teacher) with section headers | ✅ Done (Sprint 13) |
| /lessons page: two CTA buttons "שיעור חד פעמי" + "שיעורים קבועים" | ✅ Done (Sprint 13) |
| WeekNav: "היום" button to jump to current week | ✅ Done (Sprint 13) |
| /lessons/loading.tsx + /dashboard/loading.tsx — skeleton loading screens | ✅ Done (Sprint 13) |
| proxy.ts: add /portal/* to public bypass (no Supabase session check) | ✅ Done (Sprint 13) |
| /settings/whatsapp: add portal URL display + copy button for owner to share | ✅ Done (Sprint 13) |
| PORTAL_JWT_SECRET added to .env.local.example + next.config.ts validation | ✅ Done (Sprint 13) |

|| supabase/migrations/20260414000001_homework.sql — homework_templates + homework_assignments + notification_log constraint | ✅ Done (Sprint 14) |
|| src/lib/homework/ — HomeworkTemplate + HomeworkAssignment types + CRUD + sendHomework | ✅ Done (Sprint 14) |
|| src/app/(dashboard)/homework/templates/ — template CRUD (list, new, edit, delete, TemplateForm) | ✅ Done (Sprint 14) |
|| src/app/(dashboard)/homework/page.tsx + loading.tsx — assignment list with status filter + skeleton | ✅ Done (Sprint 14) |
|| src/app/(dashboard)/homework/assign/ — AssignForm + page + server action | ✅ Done (Sprint 14) |
|| src/lib/whatsapp/index.ts — 5 intent detectors + 7 send helpers | ✅ Done (Sprint 14) |
|| src/app/api/whatsapp/webhook/route.ts — 5 new intent handlers + unknown-intent fallback | ✅ Done (Sprint 14) |
|| supabase/functions/homework-reminders — daily 08:00 UTC cron, overdue marking + reminders | ✅ Done (Sprint 14) |
|| Sidebar: שיעורי בית nav item (owner/admin/teacher) | ✅ Done (Sprint 14) |
|| supabase/config.toml: [functions.homework-reminders] registration | ✅ Done (Sprint 14) |
|| Bug fix: redirect() outside try/catch in lessons/new and teacher/new-lesson actions | ✅ Done (Sprint 14) |

|| supabase/migrations/20260415000001_receipts_and_payment_providers.sql — receipt columns + receipt_config_encrypted + widen payment_provider CHECK | ✅ Done (Sprint 15) |
|| src/lib/receipts/index.ts — ReceiptProvider interface + ReceiptProviderNotConfiguredError | ✅ Done (Sprint 15) |
|| src/lib/receipts/green-invoice.ts — Green Invoice adapter (token auth + document type 320) | ✅ Done (Sprint 15) |
|| src/lib/receipts/factory.ts — decrypt receipt_config_encrypted + return GreenInvoiceProvider | ✅ Done (Sprint 15) |
|| src/lib/receipts/issueReceiptForCharge.ts — idempotent receipt issuance + WhatsApp send | ✅ Done (Sprint 15) |
|| src/lib/whatsapp/index.ts — sendReceiptMessage helper | ✅ Done (Sprint 15) |
|| src/app/(dashboard)/charges/actions.ts — fire-and-forget receipt after markAsPaid | ✅ Done (Sprint 15) |
|| src/app/api/payments/[provider]/route.ts — fire-and-forget receipt after webhook mark-paid | ✅ Done (Sprint 15) |
|| src/app/(dashboard)/settings/receipts/ — page + actions + ReceiptSettingsForm + DisconnectReceiptButton | ✅ Done (Sprint 15) |
|| Sidebar: קבלות nav entry (owner) + settings/page.tsx receipt card | ✅ Done (Sprint 15) |
|| src/app/(dashboard)/charges/page.tsx — receipt_url column display + badge | ✅ Done (Sprint 15) |
|| src/lib/charges/index.ts — receipt_url + receipt_issued_at fields in Charge type + query | ✅ Done (Sprint 15) |
|| src/lib/payments/bit.ts — Bit Business payment adapter | ✅ Done (Sprint 15) |
|| src/lib/payments/paybox.ts — PayBox payment adapter | ✅ Done (Sprint 15) |
|| src/lib/payments/index.ts — SupportedProvider union extended with bit + paybox | ✅ Done (Sprint 15) |
|| src/lib/payments/registry.ts — bitEntry + payboxEntry | ✅ Done (Sprint 15) |
|| src/lib/payments/registry-ui.ts — Bit + PayBox UI metadata | ✅ Done (Sprint 15) |

|| supabase/migrations/20260416000001_message_templates_and_ical.sql — message_templates table + RLS + teachers.ical_token + index | ✅ Done (Sprint 16) |
|| src/lib/whatsapp/templates.ts — MessageTemplateType + DEFAULT_TEMPLATES + resolveTemplate + substituteVars + TEMPLATE_VARIABLES + TEMPLATE_LABELS + TEMPLATE_PREVIEW_VARS | ✅ Done (Sprint 16) |
|| supabase/functions/_shared/templates.ts — Deno resolveTemplate + substituteVars (mirrors Next.js version) | ✅ Done (Sprint 16) |
|| src/app/api/whatsapp/webhook/route.ts — migrated booking_link, cancellation_confirmation, cancellation_admin_alert, balance_reply, schedule_reply, portal_link_reply, unknown_intent_fallback to resolveTemplate | ✅ Done (Sprint 16) |
|| src/app/book/[token]/actions.ts — migrated booking_confirmation to resolveTemplate | ✅ Done (Sprint 16) |
|| src/lib/receipts/issueReceiptForCharge.ts — migrated receipt_notification to resolveTemplate | ✅ Done (Sprint 16) |
|| src/lib/whatsapp/index.ts — @deprecated JSDoc on 10 old send helpers (not deleted) | ✅ Done (Sprint 16) |
|| supabase/functions/lesson-reminders/index.ts — migrated lesson_reminder to resolveTemplate | ✅ Done (Sprint 16) |
|| supabase/functions/payment-reminders/index.ts — migrated payment_reminder to resolveTemplate | ✅ Done (Sprint 16) |
|| supabase/functions/homework-reminders/index.ts — migrated homework_reminder to resolveTemplate | ✅ Done (Sprint 16) |
|| src/app/(dashboard)/settings/message-templates/page.tsx — template list + edit UI (owner only) | ✅ Done (Sprint 16) |
|| src/app/(dashboard)/settings/message-templates/actions.ts — saveTemplateAction + resetTemplateAction | ✅ Done (Sprint 16) |
|| src/components/dashboard/settings/MessageTemplateCard.tsx — client component with live preview | ✅ Done (Sprint 16) |
|| src/lib/ical/index.ts — RFC 5545 iCal generator (no external lib, line folding, CRLF) | ✅ Done (Sprint 16) |
|| src/app/api/calendar/[token]/route.ts — public iCal endpoint (past 4 weeks + next 6 months) | ✅ Done (Sprint 16) |
|| src/proxy.ts — /api/calendar/* added to public bypass list | ✅ Done (Sprint 16) |
|| src/app/(dashboard)/teacher/calendar/page.tsx — iCal subscription URL page (teacher only) | ✅ Done (Sprint 16) |
|| src/app/(dashboard)/teacher/calendar/actions.ts — regenerateCalendarTokenAction | ✅ Done (Sprint 16) |
|| src/components/dashboard/CalendarSubscribeSection.tsx — copy button + regenerate + Google/Apple/Outlook instructions | ✅ Done (Sprint 16) |
|| src/components/dashboard/Sidebar.tsx — added הודעות (owner) + מנוי ליומן (teacher) nav items | ✅ Done (Sprint 16) |
|| src/app/(dashboard)/settings/page.tsx — added "הודעות WhatsApp" settings card | ✅ Done (Sprint 16) |
|| src/app/portal/[orgId]/payments/page.tsx — receipt_url in query + receipt link in paid charges list | ✅ Done (Sprint 16) |

|| src/lib/whatsapp/index.ts — deleted 11 deprecated send helpers (sendBookingLink, etc.) | ✅ Done (Sprint 17) |
|| src/app/api/whatsapp/webhook/webhook.test.ts + actions.test.ts — updated mocks from old helpers to resolveTemplate + sendTextMessage | ✅ Done (Sprint 17) |
|| src/lib/reports/revenue.ts — getRevenueReport: paid charges by calendar month | ✅ Done (Sprint 17) |
|| src/lib/reports/lessons.ts — getLessonsReport: lessons + cancellations by calendar month | ✅ Done (Sprint 17) |
|| src/lib/reports/debt.ts — getDebtReport: parents with pending charges sorted by debt | ✅ Done (Sprint 17) |
|| src/lib/reports/teachers.ts — getTeachersReport: lessons count + revenue per teacher | ✅ Done (Sprint 17) |
|| src/lib/reports/students.ts — getStudentsReport: active students + at-risk detection | ✅ Done (Sprint 17) |
|| src/lib/reports/index.ts — barrel export | ✅ Done (Sprint 17) |
|| src/components/dashboard/Sidebar.tsx — added דוחות section (revenue/lessons/debt/teachers/students) | ✅ Done (Sprint 17) |
|| src/app/(dashboard)/reports/page.tsx — reports landing page | ✅ Done (Sprint 17) |
|| src/app/(dashboard)/reports/revenue/page.tsx + RevenueChart.tsx — bar chart + table (12m default) | ✅ Done (Sprint 17) |
|| src/app/(dashboard)/reports/lessons/page.tsx + LessonsChart.tsx — grouped bar chart + table | ✅ Done (Sprint 17) |
|| src/app/(dashboard)/reports/debt/page.tsx — tabular debt report | ✅ Done (Sprint 17) |
|| src/app/(dashboard)/reports/teachers/page.tsx + TeachersChart.tsx — horizontal bar chart + table | ✅ Done (Sprint 17) |
|| src/app/(dashboard)/reports/students/page.tsx — at-risk block + full table | ✅ Done (Sprint 17) |
|| src/app/api/reports/[report]/route.ts — CSV export for all 5 reports (UTF-8 BOM) | ✅ Done (Sprint 17) |
|| src/components/reports/CsvDownloadButton.tsx — client download trigger | ✅ Done (Sprint 17) |
|| src/components/reports/PeriodSelector.tsx — months selector writing ?months= query param | ✅ Done (Sprint 17) |
|| src/lib/dashboard/stats.ts — added cancellationRateThisMonth + atRiskStudents + newLeadsThisMonth | ✅ Done (Sprint 17) |
|| src/app/(dashboard)/dashboard/page.tsx — second KPI row (3 new cards) | ✅ Done (Sprint 17) |

|| supabase/migrations/20260417000001_superadmin_dashboard.sql — superadmin role + nullable org_id + invariant constraint | ✅ Done (Sprint 18) |
|| src/lib/auth/session.ts — requireDashboardSession / requireSuperAdminSession / requireMutation / support-mode session | ✅ Done (Sprint 18) |
|| src/lib/superadmin/session.ts — thin re-export | ✅ Done (Sprint 18) |
|| src/lib/support-session/index.ts — JWT sign/verify/cookie helpers (TTL 30m) | ✅ Done (Sprint 18) |
|| src/proxy.ts — added /admin + /reports to DASHBOARD_PREFIXES | ✅ Done (Sprint 18) |
|| src/app/(dashboard)/layout.tsx — support mode branch + superadmin redirect | ✅ Done (Sprint 18) |
|| src/lib/env.ts — SUPPORT_SESSION_SECRET added to ALWAYS_REQUIRED | ✅ Done (Sprint 18) |
|| src/app/(admin)/admin/layout.tsx — superadmin-only admin shell | ✅ Done (Sprint 18) |
|| src/components/admin/AdminSidebar.tsx + AdminHeader.tsx — dark sidebar, Platform Admin label | ✅ Done (Sprint 18) |
|| src/lib/superadmin/dashboard.ts — getPlatformDashboard: KPIs + needsSetup + recentOrgs | ✅ Done (Sprint 18) |
|| src/app/(admin)/admin/dashboard/page.tsx — platform KPI dashboard | ✅ Done (Sprint 18) |
|| src/components/admin/PlatformKpiGrid.tsx + NeedsSetupList.tsx + RecentOrgsList.tsx | ✅ Done (Sprint 18) |
|| src/lib/superadmin/organizations.ts — getOrganizationsList (with filters + derived status) + getOrganizationDetail | ✅ Done (Sprint 18) |
|| src/app/(admin)/admin/orgs/page.tsx — organizations list with search/status/missingSetup filters | ✅ Done (Sprint 18) |
|| src/components/admin/OrganizationsTable.tsx + OrganizationStatusBadge.tsx + OrganizationFilters.tsx | ✅ Done (Sprint 18) |
|| src/lib/superadmin/createOrganization.ts — 7-step resilient org creation with compensating rollback | ✅ Done (Sprint 18) |
|| src/app/(admin)/admin/orgs/new/page.tsx + actions.ts — create org flow | ✅ Done (Sprint 18) |
|| src/components/admin/NewOrganizationForm.tsx — client form with useActionState | ✅ Done (Sprint 18) |
|| src/app/(admin)/admin/orgs/[id]/page.tsx + actions.ts — org detail + edit settings | ✅ Done (Sprint 18) |
|| src/components/admin/OrganizationDetailCard.tsx + OrganizationSettingsForm.tsx | ✅ Done (Sprint 18) |
|| src/lib/superadmin/billing.ts — getBillingReadiness: per-org payment/receipt/revenue data | ✅ Done (Sprint 18) |
|| src/app/(admin)/admin/billing/page.tsx — billing readiness page | ✅ Done (Sprint 18) |
|| src/components/admin/BillingReadinessTable.tsx | ✅ Done (Sprint 18) |
|| src/app/(admin)/admin/orgs/[id]/StartSupportModeButton.tsx + actions.ts — start/exit support mode | ✅ Done (Sprint 18) |
|| src/components/dashboard/SupportModeBanner.tsx — amber banner with org name + time remaining + exit | ✅ Done (Sprint 18) |
|| Tests: session.test.ts (6 tests) + createOrganization.test.ts (3) + organizations.test.ts (5) + support-session/index.test.ts (5) | ✅ Done (Sprint 18) |

|| supabase/migrations/20260418000001_ai_assistant.sql — conversation_log table + RLS + organizations.ai_assistant_enabled | ✅ Done (Sprint 19) |
|| supabase/migrations/20260418000002_ai_assistant_hardening.sql — RLS tightened to owner-only + whatsapp_processed_messages table | ✅ Done (Sprint 19) |
|| src/lib/ai-assistant/buildSystemPrompt.ts — context-rich Hebrew system prompt builder | ✅ Done (Sprint 19) |
|| src/lib/ai-assistant/conversationLog.ts — DB read helpers: countAssistantReplies + getRecentHistory | ✅ Done (Sprint 19) |
|| src/lib/ai-assistant/index.ts — aiAssistant(): safety cap + system prompt + OpenAI gpt-4o-mini call + token logging | ✅ Done (Sprint 19) |
|| src/lib/whatsapp/idempotency.ts — claimIncomingMessage + releaseIncomingMessageClaim | ✅ Done (Sprint 19) |
|| src/lib/env.ts — OPENAI_API_KEY added to REQUIRED_IN_PRODUCTION | ✅ Done (Sprint 19) |
|| src/app/api/whatsapp/webhook/route.ts — fallback path calls aiAssistant() when enabled; error → template fallback | ✅ Done (Sprint 19) |
|| src/app/(dashboard)/settings/ai-assistant/page.tsx — enable toggle + conversation log table | ✅ Done (Sprint 19) |
|| src/app/(dashboard)/settings/ai-assistant/actions.ts — saveAiAssistantSettings | ✅ Done (Sprint 19) |
|| src/components/dashboard/settings/ConversationLogTable.tsx — masked phone + expand per row | ✅ Done (Sprint 19) |
|| src/components/dashboard/Sidebar.tsx — "עוזר AI" nav item (owner) | ✅ Done (Sprint 19) |
|| src/app/(dashboard)/settings/page.tsx — AI Assistant settings card | ✅ Done (Sprint 19) |
|| Tests: buildSystemPrompt snapshot + aiAssistant safety cap + webhook error fallback | ✅ Done (Sprint 19) |

|| src/app/api/whatsapp/webhook/route.ts — call claimIncomingMessage at entry; releaseIncomingMessageClaim on retryable failure; 200 on duplicate | ⬜ Sprint 20 |
|| src/lib/ai-assistant/conversationLog.ts — appendTurn() write helper (fire-and-forget, logs on DB error) | ⬜ Sprint 20 |
|| src/app/api/whatsapp/webhook/route.ts — call appendTurn after AI reply; silent dead-ends → unknown_intent template | ⬜ Sprint 20 |
|| src/app/(dashboard)/settings/ai-assistant/actions.ts — reject enable when OPENAI_API_KEY absent | ⬜ Sprint 20 |
|| src/lib/ai-assistant/index.ts — classify OpenAI APIError with HTTP status before rethrowing | ⬜ Sprint 20 |
|| src/app/(dashboard)/settings/ai-assistant/page.tsx — amber warning when key absent + AI enabled | ⬜ Sprint 20 |
|| src/lib/whatsapp/idempotency.test.ts — unit tests for claim/release helpers | ⬜ Sprint 20 |
|| src/lib/ai-assistant/conversationLog.test.ts — unit tests for appendTurn, countAssistantReplies, getRecentHistory | ⬜ Sprint 20 |
|| src/app/api/whatsapp/webhook/webhook.test.ts — duplicate / retry / decrypt-failure regression tests | ⬜ Sprint 20 |
|| src/lib/ai-assistant/aiAssistant.test.ts — key-absent guard + OpenAI error classification tests | ⬜ Sprint 20 |

When starting any task, check this table first.
Do not rebuild what is already marked `✅`.
Update this table after each completed story.

---

## Closed Decisions

**Decision — routing key:**
Webhook routing uses `phone_number_id` (Meta internal ID), not the display phone number.

**Decision — token storage:**
Access tokens are encrypted at the application layer with AES-256-GCM before being stored in Postgres. The encryption key is a server-only env var; plaintext is never persisted.

**Decision — secrets boundary:**
`SUPABASE_SERVICE_ROLE_KEY`, `BOOKING_JWT_SECRET`, `WHATSAPP_TOKEN_ENCRYPTION_KEY`, `META_APP_SECRET`, `PAYMENT_CONFIG_ENCRYPTION_KEY`, `PORTAL_JWT_SECRET` are server-only and must never appear in client bundles.

**Decision — privileged import path:**
Service role usage is isolated to `src/lib/supabase/service-role.ts`.

**Decision — environment validation:**
Required env vars are validated at startup and fail fast with named errors if missing.

**Decision — webhook behavior:**
Requests without valid `X-Hub-Signature-256` must return `401` before processing.

**Decision — release gate:**
Nothing ships to production without staging QA, release checklist completion, and a documented Data Recovery Playbook.

**Decision — portal auth:**
Parents authenticate to the portal via phone number + 6-digit OTP delivered via WhatsApp. Session stored as httpOnly cookie (30-day JWT). No Supabase Auth for parents.

**Decision — single lesson creation:**
Teachers create lessons directly (no admin approval step). Same conflict-check logic as series creation.

See `/docs/decisions.md` for all decisions.

---

## Technical Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router, TypeScript (strict) |
| UI | React 19, Tailwind CSS 4, shadcn/ui (Nova preset) |
| Backend | Next.js Server Actions + Route Handlers |
| Database | PostgreSQL via Supabase |
| Background Jobs | Supabase Edge Functions (Deno, scheduled cron) |
| Auth (dashboard) | Supabase Auth (email/password) |
| Auth (booking WebView) | Signed JWT (jose), not Supabase session |
| Auth (parent portal) | Phone OTP → httpOnly cookie (jose JWT) |
| WhatsApp | Meta WhatsApp Cloud API |
| Payments | Abstraction layer: Cardcom + PayPlus adapters |
| Validation | Zod 4 |
| Dates | Luxon 3 |
| Icons | Lucide React |
| Testing | Vitest 4 |

---

## Repository Structure

```txt
lessio/
├── AGENTS.md                     ← this file (AI operating manual)
├── CLAUDE.md                     ← points to AGENTS.md
├── docs/
│   ├── plan.md                   ← product plan + roadmap
│   ├── schema.md                 ← DB schema (source of truth)
│   ├── decisions.md              ← architectural decisions (all sprints)
│   ├── security.md               ← RLS policies + auth model
│   ├── sprint-roadmap.md         ← full sprint roadmap (sprints 1–22)
│   ├── sprint-1-scope.md  through sprint-12-scope.md ← ✅ completed
│   └── sprint-13-scope.md        ← current sprint (to be written)
├── src/
│   ├── app/
│   │   ├── (dashboard)/          ← owner/admin/teacher pages (Supabase Auth)
│   │   │   ├── dashboard/
│   │   │   ├── students/
│   │   │   ├── parents/
│   │   │   ├── teachers/
│   │   │   ├── lessons/          ← includes new-series/ + new/ (Sprint 13)
│   │   │   ├── charges/
│   │   │   ├── leads/
│   │   │   ├── settings/         ← whatsapp/ payment/ holidays/ reminders/ page.tsx (Sprint 13)
│   │   │   └── teacher/          ← schedule/ availability/ overrides/ new-lesson/ (Sprint 13)
│   │   ├── book/
│   │   │   └── [token]/          ← parent booking WebView (JWT auth)
│   │   ├── portal/               ← Sprint 13: parent portal (cookie auth)
│   │   │   └── [orgId]/
│   │   │       ├── login/
│   │   │       ├── home/
│   │   │       ├── book/
│   │   │       └── payments/
│   │   └── api/
│   │       ├── whatsapp/webhook/ ← POST + GET (Meta verification)
│   │       └── payments/[provider]/
│   ├── lib/
│   │   ├── supabase/             ← client.ts, server.ts, service-role.ts
│   │   ├── booking/              ← getAvailableSlots, createSlotLock, confirmBooking
│   │   ├── billing/              ← calculateCancellationCharge, createCharge, autoSend
│   │   ├── lessons/              ← createSeries, cancelSeries, createLesson (Sprint 13)
│   │   ├── whatsapp/             ← Meta API client, all send functions
│   │   ├── cancellation-flow/    ← WhatsApp cancellation state machine
│   │   ├── payments/             ← registry, cardcom, payplus
│   │   ├── payment-request/      ← autoSend
│   │   ├── portal/               ← Sprint 13: session.ts, otp.ts
│   │   ├── jwt/                  ← signBookingToken, verifyBookingToken
│   │   ├── crypto/               ← AES-256-GCM encrypt/decrypt
│   │   ├── auth/                 ← session, actions
│   │   ├── organizations/        ← getOrgTimezone, holidays
│   │   ├── dashboard/            ← stats.ts (KPI queries)
│   │   └── phone/                ← normalizePhone (E.164)
│   └── components/
│       ├── ui/                   ← shadcn components (button.tsx, extend as needed)
│       ├── booking/              ← BookingFlow, AvailabilityCalendar, TeacherSelect, etc.
│       └── dashboard/            ← Sidebar, KpiCard, lesson/, availability/, etc.
├── supabase/
│   ├── migrations/               ← forward-only SQL migrations
│   ├── functions/                ← Edge Functions (lesson-reminders, payment-reminders)
│   ├── seed.sql
│   └── config.toml
└── .env.local
```

---

## Sprint 16 — What NOT to Build

- Deleting deprecated WhatsApp send helpers (`sendBookingConfirmation`, etc.) — `@deprecated` now; delete in Sprint 17
- Per-template A/B testing
- Multi-language templates (Sprint 20 — i18n)
- iCal for parents / admin overview
- WebSub push for calendar refresh (polling is sufficient)
- WhatsApp Meta-approved template messages (Sprint 22)
- Backfilling receipt_url on historical paid charges (one-time admin script, future)
- AI assistant (Sprint 19)
- Analytics & reporting (Sprint 17)
- Mobile-responsive collapsible sidebar drawer
- Toast notification library (keep inline error/success states consistent with existing forms)

---

## Ground Rules for All Sprints

```text
1. TypeScript strict — no `any`. Use unknown + type guards where needed.
2. SUPABASE_SERVICE_ROLE_KEY, BOOKING_JWT_SECRET, PORTAL_JWT_SECRET, WHATSAPP_TOKEN_ENCRYPTION_KEY,
   PAYMENT_CONFIG_ENCRYPTION_KEY, META_APP_SECRET must never appear in client bundles.
3. Service role is imported only from src/lib/supabase/service-role.ts.
4. All required env vars validated at startup; missing vars fail fast with named errors.
5. WhatsApp webhook requests without valid X-Hub-Signature-256 must return 401 before processing.
6. All critical flows emit structured logs with org_id and relevant entity IDs.
7. WhatsApp API failures and charge-write failures must be caught and logged; must not crash.
8. Nothing ships to production without passing staging QA first.
9. All database writes use service role; never the anon key for mutations.
10. RBAC enforced server-side on every mutation — never trust client-supplied role.
11. Validate all inputs with Zod schemas on the server before any DB write.
12. Do not render unsafe HTML. Markdown (Sprint 14+) rendered with sanitization.
13. Before coding any story: list exact files to change + explicit out-of-scope items.
14. Do not infer missing security or permission rules — stop and document a TODO instead.
15. Never call redirect() inside a try/catch block. Move redirect() after the
    try/catch, or rethrow isRedirectError(err) explicitly. See Sprint 14 Story 0.
16. UI components that invoke server actions must receive the action as a prop
    or be fully reimplemented per context. Never hardcode server action imports
    into shared UI components.
```
