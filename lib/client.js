/**
 * dsh-skin-studio — browser half (enhancement edition).
 *
 * A lazy-CJS factory: the client module system loads this file and calls
 * `window.__ModuleLoader__.load({ id, factory })`; the module body lives inside
 * the factory closure so it runs at materialization, not at script load.
 *
 * This is deliberately a TWO-feature enhancement, nothing more:
 *
 *   1. 背景图 — a personal picture shown behind the whole UI;
 *   2. 全局蒙版虚化 — a translucent scrim over that picture, frosted with
 *      `backdrop-filter: blur()`.
 *
 * Colours, text, bubbles, borders, accents — everything else — belong to the
 * original theme. The plugin never touches the theme service; it only makes the
 * app's background surfaces translucent and frosted so the picture reads through.
 *
 * Performance: the picture lives in its own storage key and is written straight
 * onto the layer element (never into a stylesheet); every visual change is
 * coalesced to one requestAnimationFrame and memoised.
 */
window.__ModuleLoader__.load({
  id: '@wsj060618/dsh-skin-studio',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    // `react` comes from the client's platform module seed.
    const { createElement: h, useState, useEffect } = require('react')

    /* ---------------------------------------------------------------- *
     * Constants
     * ---------------------------------------------------------------- */

    const PANEL_ID = 'skin-studio'
    const NS = 'skin-studio'
    const PANEL_ORDER = 30
    const KEY_SETTINGS = 'dsh-skin-studio:v2'
    const KEY_IMAGE = 'dsh-skin-studio:image'
    const WALL_CLASS = 'dss-wall'
    const CSS_MARK = 'dsh-skin-studio'
    const MAX_BLUR = 40

    /** The translucent page-background ladder, base alpha + step. */
    const GROUND = [
      ['--dsw-alias-bg-base', 0.0],
      ['--dsw-specific-sidebar-fill', 0.08],
      ['--dsw-alias-bg-layer-1', 0.2],
      ['--dsw-alias-bg-layer-2', 0.32],
      ['--dsw-alias-bg-layer-3', 0.4],
      ['--dsw-alias-bg-overlay', 0.6],
      ['--dsw-alias-bg-module-platform', 0.42],
      ['--dsw-alias-bg-multi-select', 0.48],
      ['--dsw-alias-markdown-code-block', 0.44],
      ['--dsw-alias-markdown-code-block-banner', 0.44],
      ['--dsw-alias-tooltip-bg', 0.64],
      ['--dsw-alias-toast-bg', 0.6],
      ['--dsw-alias-button-elevated-fill', 0.4],
      ['--dsw-alias-button-floating-fill', 0.42],
      ['--dsw-alias-bg-mask-1', 0.42],
      ['--dsw-alias-bg-mask-2', 0.1],
      ['--dsw-alias-bg-mask-drop', 0.42],
    ]

    /** Layer order and transparency only — never mentions the picture. */
    const WALL_CSS = [
      'body,#root{background-color:transparent!important}',
      '.dss-bg{position:fixed;inset:0;z-index:0;pointer-events:none;background-position:center}',
      `body.${WALL_CLASS}>#root{position:relative;z-index:1}`,
    ].join('')

    const PAGE_CSS = [
      '.dss-page{flex:1 1 auto;min-height:0;',
      'max-height:calc(100vh - var(--dsh-frame-top-clearance,0px));',
      'overflow-y:auto;overflow-x:hidden;box-sizing:border-box;',
      'max-width:1040px;margin:0 auto;padding:22px 26px 48px;font-size:13.5px;line-height:1.6}',
      '.dss-page h1{font-size:18px;font-weight:600;margin:0 0 4px}',
      '.dss-lead{opacity:.7;margin:0 0 12px}',
      '.dss-status{min-height:19px;margin:0 0 6px;opacity:.75;font-size:12.5px}',
      '.dss-section{border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.25));padding-top:13px;margin-top:13px}',
      '.dss-title{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;opacity:.6;margin-bottom:9px}',
      '.dss-row{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:7px 0}',
      '.dss-row>span{flex:1 1 auto}',
      '.dss-row input[type=range]{flex:0 0 240px}',
      '.dss-row select{flex:0 0 200px;padding:3px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.35));background:var(--dsw-alias-bg-layer-2,transparent);color:inherit}',
      '.dss-val{opacity:.6;font-variant-numeric:tabular-nums;margin-left:10px;flex:0 0 48px;text-align:right}',
      '.dss-btns{display:flex;gap:10px;margin-top:9px}',
      '.dss-btn{padding:6px 14px;border-radius:7px;cursor:pointer;font-size:13px;',
      'border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.35));',
      'background:var(--dsw-alias-bg-layer-2,transparent);color:inherit}',
      '.dss-btn:hover{background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.12))}',
      '.dss-note{opacity:.6;font-size:12px;margin:10px 0 0}',
      '.dss-thumb{width:100%;max-width:300px;max-height:150px;object-fit:cover;border-radius:8px;',
      'border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.25));margin-top:10px;display:block}',
      '.dss-page input[type=file]{font-size:12.5px}',
    ].join('')

    /* ---------------------------------------------------------------- *
     * Small helpers
     * ---------------------------------------------------------------- */

    function clamp(value, low, high) {
      return Math.max(low, Math.min(high, value))
    }

    function defaults() {
      return { blur: 20, alpha: 0.5, fit: 'cover' }
    }

    /** Parse a CSS colour to #rrggbb, or null when it is not a colour. */
    function toHex(value) {
      const text = String(value || '').trim()
      if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase()
      if (/^#[0-9a-f]{3}$/i.test(text)) {
        return ('#' + text[1] + text[1] + text[2] + text[2] + text[3] + text[3]).toLowerCase()
      }
      const fn = /^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i.exec(text)
      if (fn !== null) {
        const part = (n) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0')
        return ('#' + part(fn[1]) + part(fn[2]) + part(fn[3])).toLowerCase()
      }
      return null
    }

    /** Parse a CSS colour to [r, g, b] (channels may be fractional). */
    function toRgb(value) {
      const text = String(value || '').trim()
      const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
      if (hex !== null) {
        let body = hex[1]
        if (body.length === 3) body = body.split('').map((c) => c + c).join('')
        return [parseInt(body.slice(0, 2), 16), parseInt(body.slice(2, 4), 16), parseInt(body.slice(4, 6), 16)]
      }
      const fn = /rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/i.exec(text)
      if (fn !== null) return [Number(fn[1]), Number(fn[2]), Number(fn[3])]
      return [13, 17, 23]
    }

    /**
     * The scrim colour = the theme's own background, so the frosted surfaces keep
     * the original theme's tone. Falls back to dark/light by the text brightness.
     */
    function detectScrimRgb() {
      try {
        const computed = window.getComputedStyle(document.body)
        const hex = toHex(computed.getPropertyValue('--dsw-alias-bg-base'))
        if (hex !== null) return toRgb(hex)
      } catch (error) { /* fall through */ }
      try {
        const computed = window.getComputedStyle(document.body)
        const text = toHex(computed.getPropertyValue('--dsw-alias-label-primary'))
        if (text !== null) {
          const [r, g, b] = toRgb(text)
          const brightness = (r * 299 + g * 587 + b * 114) / 1000
          return brightness > 128 ? [13, 17, 23] : [245, 245, 247]
        }
      } catch (error) { /* fall through */ }
      return [13, 17, 23]
    }

    /* ---------------------------------------------------------------- *
     * The browser half
     * ---------------------------------------------------------------- */

    exports.inject = ['slots']
    exports.name = 'skin-studio'

    exports.apply = function apply(ctx) {
      /** Drop the old full-skin editor's storage keys once, keeping the picture. */
      ;(function migrateLegacyKeys() {
        for (const key of ['dsh-skin-studio:v1', 'dsh-skin-studio:schemes', 'dsh-skin-studio:active']) {
          try { window.localStorage.removeItem(key) } catch (error) { /* ignore */ }
        }
      })()

      let doc = readSettings()
      let image = readImage()
      let bgNode = null
      let frame = 0
      let message = ''
      const listeners = new Set()
      const painted = { wall: null, image: undefined, fit: undefined, ground: undefined }

      function readSettings() {
        try {
          const raw = window.localStorage.getItem(KEY_SETTINGS)
          if (raw !== null && raw !== undefined) {
            const parsed = JSON.parse(raw)
            if (parsed !== null && typeof parsed === 'object') return Object.assign(defaults(), parsed)
          }
        } catch (error) { /* ignore */ }
        return defaults()
      }

      function writeSettings(settings) {
        try {
          window.localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings))
          return null
        } catch (error) {
          return '设置保存失败。'
        }
      }

      function readImage() {
        try {
          const raw = window.localStorage.getItem(KEY_IMAGE)
          return typeof raw === 'string' && raw.length > 0 ? raw : null
        } catch (error) {
          return null
        }
      }

      function writeImage(value) {
        try {
          if (value === null) window.localStorage.removeItem(KEY_IMAGE)
          else window.localStorage.setItem(KEY_IMAGE, value)
          return null
        } catch (error) {
          return '图片保存失败（超出浏览器存储配额）。请换一张更小的图。'
        }
      }

      function notify() {
        for (const listener of [...listeners]) {
          try { listener() } catch (error) { /* one bad subscriber must not stop the rest */ }
        }
      }

      function report(text) {
        message = text
        notify()
      }

      function styleSheet(slot, text) {
        if (document.head === null || document.head === undefined) return null
        const selector = `style[data-plugin-css="${CSS_MARK}/${slot}"]`
        const existing = document.querySelector(selector)
        if (existing !== null && existing !== undefined) {
          if (existing.textContent === text) return existing
          existing.textContent = text
          return existing
        }
        const tag = document.createElement('style')
        tag.dataset.plugin = CSS_MARK
        tag.dataset.pluginCss = `${CSS_MARK}/${slot}`
        tag.textContent = text
        document.head.append(tag)
        return tag
      }

      function dropStyleSheet(slot) {
        const node = document.querySelector(`style[data-plugin-css="${CSS_MARK}/${slot}"]`)
        if (node !== null && node !== undefined) node.remove()
      }

      function dropStyleSheets() {
        for (const slot of ['wall', 'ground', 'page']) dropStyleSheet(slot)
      }

      /** Put the document into its wallpaper state, updating only what changed. */
      function paint() {
        try {
          const on = typeof image === 'string' && image.length > 0 && document.getElementById('root') !== null

          if (painted.wall !== on) {
            painted.wall = on
            if (on) {
              document.body.classList.add(WALL_CLASS)
              styleSheet('wall', WALL_CSS)
            } else {
              document.body.classList.remove(WALL_CLASS)
              dropStyleSheet('wall')
              dropStyleSheet('ground')
              painted.ground = undefined
              if (document.documentElement !== null && document.documentElement !== undefined) {
                document.documentElement.style.removeProperty('background-color')
              }
            }
          }

          if (!on) {
            if (bgNode !== null) bgNode.style.backgroundImage = ''
            painted.image = undefined
            return
          }

          if (bgNode === null) {
            bgNode = document.querySelector('.dss-bg')
            if (bgNode === null || bgNode === undefined) {
              bgNode = document.createElement('div')
              bgNode.className = 'dss-bg'
              bgNode.dataset.plugin = CSS_MARK
              document.body.prepend(bgNode)
            }
          }
          if (painted.image !== image) {
            painted.image = image
            bgNode.style.backgroundImage = `url("${image}")`
          }
          if (painted.fit !== doc.fit) {
            painted.fit = doc.fit
            bgNode.style.backgroundSize = doc.fit === 'contain' ? 'contain' : doc.fit === 'tile' ? 'auto' : 'cover'
            bgNode.style.backgroundRepeat = doc.fit === 'tile' ? 'repeat' : 'no-repeat'
          }

          // The scrim: the theme's own background colour at the chosen translucency,
          // frosted with a live backdrop blur. Re-detected every paint so a theme
          // switch (which rewrites the background tokens) is picked up.
          const [sr, sg, sb] = detectScrimRgb()
          const blur = clamp(Number(doc.blur) || 0, 0, MAX_BLUR)
          const scrimAlpha = clamp(Number(doc.alpha) || 0, 0, 0.98)
          const rule = GROUND
            .map(([token, step]) => {
              const alpha = clamp(scrimAlpha + step, 0, 0.98)
              const r = Math.round(sr); const g = Math.round(sg); const b = Math.round(sb)
              return `${token}:rgba(${r},${g},${b},${alpha.toFixed(3)})!important`
            })
            .join(';')
          const frost = blur > 0 ? `blur(${blur}px)` : 'none'
          const text = [
            `body.${WALL_CLASS}>#root{backdrop-filter:${frost}}`,
            `body.${WALL_CLASS}{${rule}}`,
          ].join('')
          if (painted.ground !== text) {
            painted.ground = text
            styleSheet('ground', text)
          }
        } catch (error) {
          /* paint must never throw into the boot path */
        }
      }

      function schedule() {
        if (frame !== 0) return
        if (typeof window.requestAnimationFrame !== 'function') {
          paint()
          return
        }
        frame = window.requestAnimationFrame(() => {
          frame = 0
          paint()
        })
      }

      /* -------------------------------------------------------------- *
       * Panel
       * -------------------------------------------------------------- */

      function PanelGlyph(props) {
        const edge = typeof (props && props.size) === 'number' ? props.size : 16
        const active = props && props.active === true
        return h('svg', {
          width: edge,
          height: edge,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': 'true',
        }, [
          h('path', {
            key: 'frame',
            d: 'M2.5 3.5h11v9h-11z',
            stroke: 'currentColor',
            'stroke-width': active ? 1.6 : 1.3,
            'stroke-linejoin': 'round',
          }),
          h('path', {
            key: 'hill',
            d: 'M3.5 11.5l2.8-3.4 2 2.2 1.6-1.8 2.6 3z',
            fill: 'currentColor',
            opacity: active ? 0.95 : 0.6,
          }),
          h('circle', {
            key: 'sun',
            cx: 10.6, cy: 5.6, r: 1.1,
            fill: 'currentColor',
            opacity: active ? 0.95 : 0.6,
          }),
        ])
      }

      function row(label, control, extra) {
        return h('label', { className: 'dss-row', key: label }, [
          h('span', { key: 'l' }, label),
          extra === undefined ? null : extra,
          control,
        ])
      }

      function section(title, children) {
        return h('div', { className: 'dss-section', key: title }, [
          h('div', { className: 'dss-title', key: 't' }, title),
        ].concat(children))
      }

      function StudioPage(props) {
        const usePanelInfo = props ? props.usePanelInfo : undefined
        const [, force] = useState(0)
        useEffect(() => {
          const listener = () => force((n) => n + 1)
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        }, [])

        const selectActivePanel = (state) => state.activePanelId
        const active = typeof usePanelInfo === 'function' ? usePanelInfo(selectActivePanel) : PANEL_ID
        if (active !== PANEL_ID) return null

        const onPickFile = (event) => {
          const picked = event && event.target && event.target.files ? event.target.files[0] : null
          if (!picked) return
          message = '正在处理图片…'
          const reader = new FileReader()
          reader.onload = () => {
            const out = typeof reader.result === 'string' ? reader.result : null
            if (out === null) {
              report('读取图片失败。')
              return
            }
            const problem = writeImage(out)
            if (problem !== null) {
              report(problem)
              return
            }
            image = out
            painted.image = undefined
            schedule()
            report(`背景已设置（${Math.round(out.length / 1024)} KB）`)
          }
          reader.onerror = () => report('读取图片失败。')
          reader.readAsDataURL(picked)
        }

        const removeImage = () => {
          writeImage(null)
          image = null
          painted.image = undefined
          schedule()
          report('背景已移除')
        }

        return h('div', { className: 'dss-page' }, [
          h('h1', { key: 'h1' }, '皮肤工坊'),
          h('p', { className: 'dss-lead', key: 'lead' },
            '给界面加一张背景图，再用蒙版虚化把它柔化。颜色、文字等一切沿用原主题。'),
          h('div', { className: 'dss-status', key: 'status' }, message),

          section('背景图', [
            h('input', {
              key: 'file',
              type: 'file',
              accept: 'image/*',
              onChange: onPickFile,
            }),
            image === null
              ? h('p', { className: 'dss-note', key: 'empty' }, '还没有背景图。')
              : h('img', { key: 'thumb', className: 'dss-thumb', src: image, alt: '当前背景图' }),
            h('div', { className: 'dss-btns', key: 'btns' }, [
              h('button', { key: 'remove', className: 'dss-btn', onClick: removeImage }, '移除背景图'),
            ]),
            row('适配方式', h('select', {
              key: 'fit',
              value: doc.fit,
              onChange: (event) => {
                doc.fit = event.target.value
                painted.fit = undefined
                schedule()
                writeSettings(doc)
                notify()
              },
            }, [
              h('option', { key: 'cover', value: 'cover' }, '铺满'),
              h('option', { key: 'contain', value: 'contain' }, '完整显示'),
              h('option', { key: 'tile', value: 'tile' }, '平铺'),
            ])),
          ]),

          section('全局蒙版虚化', [
            row('蒙版浓度', h('input', {
              key: 'alpha',
              type: 'range',
              min: '0',
              max: '100',
              step: '1',
              value: String(Math.round(Number(doc.alpha) * 100)),
              onChange: (event) => {
                doc.alpha = Number(event.target.value) / 100
                schedule()
                notify()
              },
              onPointerUp: () => writeSettings(doc),
              onKeyUp: () => writeSettings(doc),
            }), h('span', { key: 'v', className: 'dss-val' }, String(Math.round(Number(doc.alpha) * 100)) + '%')),
            row('虚化程度', h('input', {
              key: 'blur',
              type: 'range',
              min: '0',
              max: String(MAX_BLUR),
              step: '1',
              value: String(doc.blur),
              onChange: (event) => {
                doc.blur = Number(event.target.value)
                schedule()
                notify()
              },
              onPointerUp: () => writeSettings(doc),
              onKeyUp: () => writeSettings(doc),
            }), h('span', { key: 'v', className: 'dss-val' }, String(doc.blur) + 'px')),
            h('p', { className: 'dss-note', key: 'note' },
              '蒙版浓度 = 背景透出的多少：0% 完全透明（原图直出），100% 完全不透明。'
              + '虚化程度 = 透出部分的模糊程度：0 不模糊，值越大越柔和。'),
          ]),
        ])
      }

      /* -------------------------------------------------------------- *
       * Lifecycle
       * -------------------------------------------------------------- */

      ctx.effect(() => {
        let disposeSidebar
        let disposePage
        let disposeThemeChange
        try {
          styleSheet('page', PAGE_CSS)
          disposeSidebar = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: PANEL_ORDER,
            locale: NS,
            label: () => '皮肤工坊',
          }, PanelGlyph))
          disposePage = ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: () => ({ refresh: () => notify() }),
          }, StudioPage))
          // The ground sheet shadows the theme's background tokens with a fixed
          // rgba, so a theme switch would otherwise leave them stuck. On every
          // `theme/change` drop the sheet (un-shadowing the tokens) and re-derive
          // the scrim from the NEW theme colour on the next frame.
          try {
            disposeThemeChange = ctx.on('theme/change', () => {
              painted.ground = undefined
              dropStyleSheet('ground')
              schedule()
            })
          } catch (error) {
            /* no event bus: the page still works */
          }
          paint()
        } catch (error) {
          /* never let mounting throw into the boot path */
        }
        return () => {
          try {
            if (typeof disposeSidebar === 'function') disposeSidebar()
            if (typeof disposePage === 'function') disposePage()
            if (typeof disposeThemeChange === 'function') disposeThemeChange()
            if (frame !== 0) window.cancelAnimationFrame(frame)
            frame = 0
            listeners.clear()
            document.body.classList.remove(WALL_CLASS)
            if (bgNode !== null) bgNode.remove()
            bgNode = null
            dropStyleSheets()
          } catch (error) {
            /* teardown is best effort */
          }
        }
      }, 'dsh-skin-studio')
    }

    return module.exports
  },
})
