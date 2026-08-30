/**
 * Human-looking pointer motion.
 *
 * page.mouse.move(x, y, { steps }) interpolates with NO delay between steps —
 * it finishes in a few milliseconds and reads as a teleport with extra events.
 * The easing has to be driven here, one frame at a time.
 */

const FRAME = 1000 / 60
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function motion(page) {
  const state = { x: 60, y: 60 }

  const m = {
    pos: () => ({ ...state }),

    async moveTo(x, y, ms = 620) {
      const { x: x0, y: y0 } = state
      const dist = Math.hypot(x - x0, y - y0)
      if (dist < 1) return
      const frames = Math.max(2, Math.round(ms / FRAME))
      // A slight perpendicular bow — hands do not travel in straight lines.
      const bow = Math.min(dist * 0.1, 44)
      const nx = -(y - y0) / dist
      const ny = (x - x0) / dist
      for (let i = 1; i <= frames; i++) {
        const p = easeInOutCubic(i / frames)
        const arc = Math.sin(p * Math.PI) * bow
        await page.mouse.move(x0 + (x - x0) * p + nx * arc, y0 + (y - y0) * p + ny * arc)
        await page.waitForTimeout(FRAME)
      }
      // Overshoot-and-settle on long moves reads as intent rather than script.
      if (dist > 500) {
        const ox = x + (x - x0) / dist * 8
        const oy = y + (y - y0) / dist * 8
        await page.mouse.move(ox, oy)
        await page.waitForTimeout(70)
        await page.mouse.move(x, y)
        await page.waitForTimeout(50)
      }
      state.x = x
      state.y = y
    },

    async to(locator, opts = {}) {
      await locator.scrollIntoViewIfNeeded().catch(() => {})
      await page.waitForTimeout(220)
      const b = await locator.boundingBox()
      if (!b) throw new Error('motion.to: target has no bounding box')
      await m.moveTo(b.x + b.width / 2, b.y + b.height / 2, opts.ms ?? 620)
      return b
    },

    async click(locator, opts = {}) {
      await m.to(locator, opts)
      await page.waitForTimeout(opts.dwellMs ?? 260)
      await page.mouse.down()
      await page.waitForTimeout(90)
      await page.mouse.up()
      await page.waitForTimeout(opts.afterMs ?? 420)
    },

    async type(locator, text, { cps = 13 } = {}) {
      await m.click(locator, { afterMs: 180 })
      await page.keyboard.type(text, { delay: 1000 / cps })
    },

    async hold(ms) {
      await page.waitForTimeout(ms)
    },

    /** Anchored scrolling — never pixel-based, so RTL/LTR and text length are free. */
    async scrollTo(locator, { extra = -80, ms = 700 } = {}) {
      const box = await locator.boundingBox()
      if (!box) return
      const target = await page.evaluate(() => window.scrollY) + box.y + extra
      await smoothScroll(page, Math.max(0, target), ms)
    },

    async scrollBy(dy, ms = 700) {
      const from = await page.evaluate(() => window.scrollY)
      await smoothScroll(page, Math.max(0, from + dy), ms)
    },

    async hideCursor() {
      await page.evaluate(() => window.__lessioCursor?.hide()).catch(() => {})
    },
    async showCursor() {
      await page.evaluate(() => window.__lessioCursor?.show()).catch(() => {})
    },
  }

  return m
}

async function smoothScroll(page, target, ms) {
  await page.evaluate(
    ([to, dur]) =>
      new Promise((resolve) => {
        const from = window.scrollY
        const delta = to - from
        if (Math.abs(delta) < 2) return resolve()
        const t0 = performance.now()
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
        const step = (now) => {
          const p = Math.min(1, (now - t0) / dur)
          window.scrollTo(0, from + delta * ease(p))
          if (p < 1) requestAnimationFrame(step)
          else resolve()
        }
        requestAnimationFrame(step)
      }),
    [target, ms]
  )
  await page.waitForTimeout(120)
}
