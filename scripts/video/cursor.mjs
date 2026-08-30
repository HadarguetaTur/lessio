/**
 * Synthetic mouse cursor.
 *
 * Playwright drives a virtual pointer over CDP; Chromium's screencast renders
 * no cursor at all. Without this the footage reads as a robot operating the
 * app. Injected via addInitScript so it survives navigations.
 */

export function CURSOR_INIT() {
  const NS = '__lessioCursor'
  if (window[NS]) return

  const ARROW =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">' +
        '<path d="M2 1.6 L2 27.4 L8.7 21.2 L12.9 30.9 L17.6 28.9 L13.4 19.4 L22.4 19.0 Z" ' +
        'fill="#ffffff" stroke="#141414" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    )

  const style = document.createElement('style')
  style.setAttribute('data-lessio-cursor', '')
  style.textContent = `
    #__lessio-cursor{
      position:fixed; top:0; left:0; width:26px; height:34px;
      background:url("${ARROW}") no-repeat 0 0/26px 34px;
      /* Hotspot is the arrow tip at (2,1.6) — keeps the tip on the target. */
      margin:-1.6px 0 0 -2px;
      z-index:2147483647; pointer-events:none; will-change:transform;
      transform:translate3d(-200px,-200px,0);
      /* 30ms smooths the discrete CDP steps without perceptible lag, and is
         identical in both locales so it cannot desync the two runs. */
      transition:transform 30ms linear, opacity 120ms linear;
      filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));
    }
    .__lessio-ripple{
      position:fixed; z-index:2147483646; pointer-events:none;
      width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%;
      background:rgba(13,148,136,.30);
      box-shadow:0 0 0 2px rgba(13,148,136,.55) inset;
      animation:__lessio-ripple 460ms cubic-bezier(.16,.84,.44,1) forwards;
    }
    @keyframes __lessio-ripple{
      0%{ transform:scale(.35); opacity:.95 } 100%{ transform:scale(3.6); opacity:0 }
    }
  `

  const state = { x: -200, y: -200, el: null, visible: true, scale: 1 }
  window[NS] = state

  function mount() {
    // documentElement, NOT body: src/app/layout.tsx renders <body> and React 19
    // reconciles its children on hydration, removing anything appended early.
    const root = document.documentElement
    if (!root) return
    if (!style.isConnected) root.appendChild(style)
    if (!state.el || !state.el.isConnected) {
      const el = document.createElement('div')
      el.id = '__lessio-cursor'
      root.appendChild(el)
      state.el = el
    }
  }

  function paint() {
    if (!state.el) return
    state.el.style.transform =
      `translate3d(${state.x}px,${state.y}px,0) scale(${state.scale})`
    state.el.style.opacity = state.visible ? '1' : '0'
  }

  addEventListener('mousemove', (e) => {
    state.x = e.clientX
    state.y = e.clientY
    paint()
  }, true)

  addEventListener('mousedown', (e) => {
    state.scale = 0.82
    paint()
    const r = document.createElement('div')
    r.className = '__lessio-ripple'
    r.style.left = e.clientX + 'px'
    r.style.top = e.clientY + 'px'
    document.documentElement.appendChild(r)
    r.addEventListener('animationend', () => r.remove())
  }, true)

  addEventListener('mouseup', () => {
    state.scale = 1
    paint()
  }, true)

  // App-router soft navigations do not re-run init scripts but do re-render the
  // tree. A per-frame re-mount check is one getElementById and always survives.
  const tick = () => { mount(); paint(); requestAnimationFrame(tick) }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(tick))
  } else {
    requestAnimationFrame(tick)
  }

  state.hide = () => { state.visible = false; paint() }
  state.show = () => { state.visible = true; paint() }
}
