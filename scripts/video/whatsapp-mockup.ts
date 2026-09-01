/**
 * Bilingual WhatsApp conversation mockups for the marketing video.
 *
 *   npx tsx scripts/video/whatsapp-mockup.ts
 *
 * No real WhatsApp UI can be filmed: the demo org has no connected number, and
 * filming a real client would put a real phone number on screen. So the chat is
 * generated — but from the REAL product strings, so what the video shows is
 * exactly what a parent receives.
 *
 *   bodies  → DEFAULT_TEMPLATES[locale][type] + substituteVars
 *   menu    → menuActionsFor('parent') + botString('menu_*')
 *   buttons → botString('cancel_confirm_yes' | 'cta_pay_now' | ...)
 *
 * Hardcoding any of these is how the mockup ends up showing a bot that does not
 * exist. Everything below reads from src/lib/whatsapp/.
 *
 * Output: video-assets/whatsapp/<scene>-<locale>.html — gitignored, regenerated.
 * The runner drives playback through window.__wa so cadence is controlled by
 * the shot list, not by the page.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_TEMPLATES, substituteVars } from '../../src/lib/whatsapp/templates'
import { botString } from '../../src/lib/whatsapp/strings'
import { menuActionsFor } from '../../src/lib/whatsapp/menu'
import { FIXTURES } from './fixtures'

type Locale = 'he' | 'en'

/** A single rendered chat entry. */
type Msg =
  | { kind: 'in' | 'out'; text: string; time: string }
  | { kind: 'typing' }
  | { kind: 'list'; text: string; time: string; button: string }
  | { kind: 'sheet'; title: string; rows: { title: string; desc?: string }[] }
  | { kind: 'buttons'; text: string; time: string; buttons: string[] }
  | { kind: 'cta'; text: string; time: string; button: string }

const OUT_DIR = 'video-assets/whatsapp'

// ── Fonts ────────────────────────────────────────────────────────────────────
// Embedded so the mockup renders identically on any machine. Hebrew otherwise
// falls back to whatever the OS happens to have.

function fontFace(): string {
  const faces: string[] = []
  for (const [file, weight] of [
    ['public/fonts/Heebo-Regular.ttf', 400],
    ['public/fonts/Heebo-Bold.ttf', 700],
  ] as const) {
    const p = resolve(process.cwd(), file)
    if (!existsSync(p)) continue
    const b64 = readFileSync(p).toString('base64')
    faces.push(
      `@font-face{font-family:'HeeboEmbedded';font-weight:${weight};font-style:normal;` +
        `src:url(data:font/ttf;base64,${b64}) format('truetype');font-display:block}`
    )
  }
  return faces.join('\n')
}

// ── Scenes ───────────────────────────────────────────────────────────────────

function T(loc: Locale, type: keyof (typeof DEFAULT_TEMPLATES)['he'], vars: Record<string, string>) {
  return substituteVars(DEFAULT_TEMPLATES[loc][type], vars)
}

const F = FIXTURES

/** The greeting + interactive list a parent sees first. */
function menuScene(loc: Locale): Msg[] {
  const rows = menuActionsFor('parent').map((a) => ({
    title: botString(`menu_${a}` as never, loc),
    desc: botString(`menu_${a}_desc` as never, loc),
  }))
  return [
    { kind: 'out', text: loc === 'he' ? 'היי' : 'Hi', time: F.time1 },
    { kind: 'typing' },
    {
      kind: 'list',
      text: botString('menu_greeting', loc, { first_name: F.parentFirstName[loc] }),
      time: F.time1,
      button: botString('menu_button', loc),
    },
    { kind: 'sheet', title: botString('menu_button', loc), rows },
  ]
}

/**
 * Scene 1 — the cancellation. The spine of the whole video: one message that
 * would have vanished in a thread becomes a policy-priced charge, hands-free.
 */
function cancelFlow(loc: Locale): Msg[] {
  const chargeLine =
    loc === 'he'
      ? `\n\nחיוב ביטול חלקי: ₪${F.cancelCharge}`
      : `\n\nPartial cancellation charge: ₪${F.cancelCharge}`
  return [
    ...menuScene(loc),
    { kind: 'out', text: botString('menu_cancel', loc), time: F.time2 },
    { kind: 'typing' },
    {
      kind: 'list',
      text: botString('cancellation_list_header', loc),
      time: F.time2,
      button: botString('cancel_list_button', loc),
    },
    {
      kind: 'sheet',
      title: botString('cancel_list_button', loc),
      rows: [
        {
          title: `${F.studentName[loc]} — ${F.lessonDate[loc]}`,
          desc: `${F.lessonTime} · ${F.teacherName[loc]}`,
        },
      ],
    },
    {
      kind: 'buttons',
      text: botString('cancel_confirm_body', loc, {
        student_name: F.studentName[loc],
        teacher_name: F.teacherName[loc],
        date: F.lessonDate[loc],
        time: F.lessonTime,
      }),
      time: F.time3,
      buttons: [botString('cancel_confirm_yes', loc), botString('cancel_confirm_no', loc)],
    },
    { kind: 'typing' },
    {
      kind: 'in',
      text: T(loc, 'cancellation_confirmation', {
        student_name: F.studentName[loc],
        teacher_name: F.teacherName[loc],
        date: F.lessonDate[loc],
        time: F.lessonTime,
        charge_line: chargeLine,
      }),
      time: F.time3,
    },
  ]
}

/** Scene 2 — the month closes: payment request, one tap, receipt. */
function paymentRequest(loc: Locale): Msg[] {
  return [
    {
      kind: 'cta',
      text: T(loc, 'payment_request', {
        parent_name: F.parentFirstName[loc],
        student_name: F.studentName[loc],
        amount: F.monthAmount,
        month: F.monthName[loc],
        due_line: '',
        charge_lines: F.chargeLines[loc],
      }),
      time: F.time4,
      button: botString('cta_pay_now', loc),
    },
    { kind: 'typing' },
    {
      kind: 'in',
      text: T(loc, 'receipt_notification', {
        parent_name: F.parentFirstName[loc],
        amount: F.monthAmount,
        receipt_number: F.receiptNumber,
        student_name: F.studentName[loc],
      }),
      time: F.time5,
    },
  ]
}

/**
 * Scene 3 — the Owner Copilot. The owner asks in plain language; the AI
 * classifies and drafts, but the write only happens on a tap. That gate is the
 * point, so the buttons stay on screen before the confirmation.
 */
function copilot(loc: Locale): Msg[] {
  const ask =
    loc === 'he' ? 'שלח תזכורת לכל מי שחייב לי' : 'Send a reminder to everyone who owes me'
  return [
    { kind: 'out', text: ask, time: F.time6 },
    { kind: 'typing' },
    {
      kind: 'buttons',
      text: botString('copilot_confirm_all', loc, { count: String(F.debtorCount) }),
      time: F.time6,
      buttons: [
        botString('cancel_confirm_yes', loc),
        botString('cancel_confirm_no', loc),
      ],
    },
    { kind: 'typing' },
    {
      kind: 'in',
      text: botString('copilot_reminder_sent', loc, { count: String(F.debtorCount) }),
      time: F.time7,
    },
  ]
}

/** Scene 4 — booking: a signed link, a slot, a confirmation. */
function booking(loc: Locale): Msg[] {
  return [
    { kind: 'out', text: botString('menu_book', loc), time: F.time8 },
    { kind: 'typing' },
    {
      kind: 'cta',
      text: T(loc, 'booking_link', {
        parent_name: F.parentFirstName[loc],
        student_name: F.studentName[loc],
        booking_url: 'https://getlessio.com/book',
      }),
      time: F.time8,
      button: botString('cta_book_lesson', loc),
    },
    { kind: 'typing' },
    {
      kind: 'in',
      text: T(loc, 'booking_confirmation', {
        student_name: F.studentName[loc],
        teacher_name: F.teacherName[loc],
        date: F.nextLessonDate[loc],
        time: F.lessonTime,
      }),
      time: F.time9,
    },
  ]
}

// ── Rendering ────────────────────────────────────────────────────────────────

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

function render(scene: string, loc: Locale, msgs: Msg[]): string {
  const dir = loc === 'he' ? 'rtl' : 'ltr'
  const header = loc === 'he' ? 'סטודיו מיכל למוזיקה' : 'Harmony Music Studio'

  const items = msgs
    .map((m, i) => {
      const hidden = 'data-i="' + i + '" hidden'
      switch (m.kind) {
        case 'in':
        case 'out':
          return `<div class="row ${m.kind}" ${hidden}><div class="bub">${esc(m.text)}<span class="t">${m.time}${m.kind === 'out' ? ' <i class="tick">✓✓</i>' : ''}</span></div></div>`
        case 'typing':
          return `<div class="row in typing" ${hidden}><div class="bub"><span class="d"></span><span class="d"></span><span class="d"></span></div></div>`
        case 'list':
          return `<div class="row in" ${hidden}><div class="bub">${esc(m.text)}<span class="t">${m.time}</span><div class="listbtn">☰ ${esc(m.button)}</div></div></div>`
        case 'sheet':
          return `<div class="sheet" ${hidden}><div class="sheetin"><div class="sheethead">${esc(m.title)}</div>${m.rows
            .map(
              (r) =>
                `<div class="sheetrow"><div class="srt">${esc(r.title)}</div>${r.desc ? `<div class="srd">${esc(r.desc)}</div>` : ''}</div>`
            )
            .join('')}</div></div>`
        case 'buttons':
          return `<div class="row in" ${hidden}><div class="bub">${esc(m.text)}<span class="t">${m.time}</span>${m.buttons
            .map((b) => `<div class="qbtn">${esc(b)}</div>`)
            .join('')}</div></div>`
        case 'cta':
          return `<div class="row in" ${hidden}><div class="bub">${esc(m.text)}<span class="t">${m.time}</span><div class="qbtn">↗ ${esc(m.button)}</div></div></div>`
      }
    })
    .join('\n')

  return `<!doctype html>
<html lang="${loc}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${scene} · ${loc}</title>
<style>
${fontFace()}
*{box-sizing:border-box;margin:0;padding:0}
/* .row and .sheet set display, which outranks the [hidden] attribute's own
   display:none — without this every message renders from the first frame. */
[hidden]{display:none !important}
html,body{height:100%}
body{
  font-family:'HeeboEmbedded',-apple-system,'Segoe UI',Roboto,sans-serif;
  background:#0b141a;display:flex;align-items:center;justify-content:center;
}
.phone{width:780px;height:1688px;background:#e5ddd5;display:flex;flex-direction:column;position:relative;overflow:hidden}
/* WhatsApp's own doodle ground, approximated so the bubbles sit on texture. */
.phone::before{content:'';position:absolute;inset:0;opacity:.06;
  background-image:radial-gradient(circle at 20% 30%,#000 1.5px,transparent 1.6px),radial-gradient(circle at 70% 60%,#000 1.5px,transparent 1.6px);
  background-size:120px 120px,160px 160px}
.hdr{background:#008069;color:#fff;padding:26px 28px;display:flex;align-items:center;gap:18px;z-index:2}
.av{width:56px;height:56px;border-radius:50%;background:#25d366;display:grid;place-items:center;font-size:24px;font-weight:700;color:#fff}
.hdr .nm{font-size:28px;font-weight:700}
.hdr .st{font-size:19px;opacity:.85;margin-top:2px}
.log{flex:1;overflow:hidden;padding:26px 22px;display:flex;flex-direction:column;gap:16px;justify-content:flex-end;z-index:1}
.row{display:flex}
.row.in{justify-content:flex-start}
.row.out{justify-content:flex-end}
.bub{max-width:76%;background:#fff;border-radius:16px;padding:16px 18px 26px;position:relative;
  font-size:26px;line-height:1.45;color:#111b21;box-shadow:0 1px 1px rgba(0,0,0,.13);white-space:normal}
.row.out .bub{background:#d9fdd3}
.t{position:absolute;bottom:6px;inset-inline-end:14px;font-size:17px;color:#667781;white-space:nowrap}
.tick{color:#53bdeb;font-style:normal}
.listbtn,.qbtn{margin:14px -18px -12px;padding:14px;border-top:1px solid #e9edef;color:#00a5f4;
  text-align:center;font-size:25px;font-weight:500}
.qbtn+.qbtn{margin-top:0}
.typing .bub{padding:22px 22px;display:flex;gap:8px}
.d{width:11px;height:11px;border-radius:50%;background:#9aa6ac;animation:b 1.2s infinite}
.d:nth-child(2){animation-delay:.2s}.d:nth-child(3){animation-delay:.4s}
@keyframes b{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-5px)}}
.sheet{position:absolute;inset:0;background:rgba(0,0,0,.42);display:flex;align-items:flex-end;z-index:3}
.sheetin{width:100%;background:#fff;border-radius:20px 20px 0 0;padding:12px 0 26px;max-height:62%}
.sheethead{font-size:27px;font-weight:700;padding:20px 26px;border-bottom:1px solid #e9edef;color:#111b21}
.sheetrow{padding:22px 26px;border-bottom:1px solid #f2f4f5}
.srt{font-size:26px;color:#111b21}
.srd{font-size:21px;color:#667781;margin-top:5px}
</style>
</head>
<body>
<div class="phone">
  <div class="hdr"><div class="av">L</div><div><div class="nm">${esc(header)}</div><div class="st">${loc === 'he' ? 'מקוון' : 'online'}</div></div></div>
  <div class="log" id="log">
${items}
  </div>
</div>
<script>
// The runner controls cadence through this driver, so the same shot timings
// apply to both locales.
(function () {
  var log = document.getElementById('log')
  var nodes = Array.prototype.slice.call(log.querySelectorAll('[data-i]'))
  var sheets = Array.prototype.slice.call(document.querySelectorAll('.sheet'))
  var shown = 0
  function reveal(n) {
    if (!n) return
    n.hidden = false
    if (!n.classList.contains('sheet')) {
      n.animate(
        [{ transform: 'scale(.96)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 130, easing: 'ease-out' }
      )
    }
  }
  window.__wa = {
    count: nodes.length,
    next: function () {
      // A typing bubble is transient: the next reveal removes it.
      var prev = nodes[shown - 1]
      if (prev && prev.classList.contains('typing')) prev.hidden = true
      // Only one bottom sheet is ever open in WhatsApp; a new reveal replaces
      // whatever was open, otherwise they stack and dim each other.
      sheets.forEach(function (s) { s.hidden = true })
      reveal(nodes[shown]); shown++
    },
    goto: function (k) {
      shown = 0
      nodes.forEach(function (n) { n.hidden = true })
      for (var i = 0; i < k; i++) window.__wa.next()
    },
    closeSheet: function () { sheets.forEach(function (s) { s.hidden = true }) },
  }
})()
</script>
</body>
</html>`
}

// ── Main ─────────────────────────────────────────────────────────────────────

const SCENES: Record<string, (loc: Locale) => Msg[]> = {
  '01-cancel-flow': cancelFlow,
  '02-payment-request': paymentRequest,
  '03-copilot': copilot,
  '04-booking': booking,
}

mkdirSync(OUT_DIR, { recursive: true })
let n = 0
for (const [name, build] of Object.entries(SCENES)) {
  for (const loc of ['he', 'en'] as Locale[]) {
    const html = render(name, loc, build(loc))
    const path = `${OUT_DIR}/${name}-${loc}.html`
    writeFileSync(path, html)
    console.log(`  ✓ ${path}`)
    n++
  }
}
console.log(`${n} mockup file(s) written to ${OUT_DIR}/`)
