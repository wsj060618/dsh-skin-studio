/**
 * Smoke test for dsh-skin-studio's browser half (enhancement edition).
 *
 * Stands up a minimal DOM, loads the lazy-CJS factory, drives `apply(ctx)`, and
 * pins the two features:
 *
 *   PANEL    — a `sidebar.panellist` row whose id equals the `main` page key.
 *   WALLPAPER — the picture behind `#root`, app surfaces made translucent.
 *   FROST    — a `backdrop-filter: blur()` scrim whose strength follows the slider.
 *   REMOVE   — removing the picture restores the original opaque theme.
 *
 * Colours are never touched — this plugin must not call the theme service.
 */
process.noAsar = true
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(ROOT, 'smoke-out.txt')

const lines = []
const realLog = console.log.bind(console)
console.log = (...args) => { lines.push(args.map(String).join(' ')) }

const failures = []
let checks = 0
const dump = (why, error) => {
  lines.push(`${why}: ${error && error.stack ? error.stack : String(error)}`)
  try { fs.writeFileSync(OUT, lines.join('\n'), 'utf8') } catch (ignored) { /* nothing left */ }
  process.exit(1)
}
process.on('uncaughtException', (error) => dump('CRASH', error))
process.on('unhandledRejection', (error) => dump('REJECTION', error))

const check = (label, ok, extra) => {
  checks += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra === undefined ? '' : '  -> ' + extra}`)
  if (!ok) failures.push(label)
}

/* ----------------------------------------------------------------- react stub */

const createElement = (type, config, ...children) => {
  const props = Object.assign({}, config)
  if (children.length === 1) props.children = children[0]
  else if (children.length > 1) props.children = children
  return { type, props }
}

const reactStub = {
  createElement,
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
}

function walk(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const child of node) walk(child, visit); return }
  visit(node)
  if (node.props && node.props.children !== undefined) walk(node.props.children, visit)
}

function byKey(tree, key) {
  let found = null
  walk(tree, (node) => { if (found === null && node.props && node.props.key === key) found = node })
  return found
}

function texts(node, out = []) {
  if (typeof node === 'string') { out.push(node); return out }
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const child of node) texts(child, out); return out }
  if (node.props && node.props.children !== undefined) texts(node.props.children, out)
  return out
}

/* ----------------------------------------------------------------- mini DOM */

function makeStyle() {
  const props = {}
  return {
    setProperty(name, value) { props[name] = value },
    removeProperty(name) { delete props[name] },
    getPropertyValue(name) { return props[name] || '' },
  }
}

function classes(el) {
  if (el._classes === undefined) el._classes = new Set()
  return el._classes
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase()
    this.children = []
    this.attrs = {}
    this.style = makeStyle()
    this.dataset = {}
    this.textContent = ''
    this.parentNode = null
    this.files = null
    this.value = ''
    this._handlers = {}
    const self = this
    this.classList = {
      add: (...names) => names.forEach((n) => classes(self).add(n)),
      remove: (...names) => names.forEach((n) => classes(self).delete(n)),
      contains: (n) => classes(self).has(n),
    }
  }
  get className() { return [...classes(this)].join(' ') }
  set className(value) {
    classes(this).clear()
    String(value).split(/\s+/).filter(Boolean).forEach((n) => classes(this).add(n))
    this.attrs.class = String(value)
  }
  setAttribute(key, value) {
    this.attrs[key] = String(value)
    if (key === 'class') this.className = String(value)
    if (key === 'value') this.value = String(value)
  }
  getAttribute(key) { return this.attrs[key] }
  append(...nodes) { for (const n of nodes) { this.children.push(n); n.parentNode = this } }
  prepend(node) { this.children.unshift(node); node.parentNode = this }
  remove() {
    if (this.parentNode !== null) {
      const at = this.parentNode.children.indexOf(this)
      if (at >= 0) this.parentNode.children.splice(at, 1)
      this.parentNode = null
    }
  }
  addEventListener(type, handler) {
    if (this._handlers[type] === undefined) this._handlers[type] = []
    this._handlers[type].push(handler)
  }
  fire(type, event) { for (const handler of this._handlers[type] || []) handler(event || {}) }
}

function matches(el, selector) {
  const attr = /^([a-z]+)?\[([a-zA-Z-]+)(?:=(?:"([^"]*)"|([^\]]*)))?\]$/.exec(selector)
  if (attr !== null) {
    if (attr[1] !== undefined && el.tagName !== attr[1].toUpperCase()) return false
    let actual
    if (attr[2].startsWith('data-')) {
      const key = attr[2].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      actual = el.dataset[key] !== undefined ? el.dataset[key] : el.attrs[attr[2]]
    } else actual = el.attrs[attr[2]]
    const expected = attr[3] !== undefined ? attr[3] : attr[4]
    if (expected === undefined) return actual !== undefined
    return String(actual) === expected
  }
  if (selector.startsWith('.')) return classes(el).has(selector.slice(1))
  if (selector.startsWith('#')) return el.attrs.id === selector.slice(1)
  return el.tagName === selector.toUpperCase()
}

function find(roots, selector) {
  const queue = roots.filter((node) => node !== null && node !== undefined)
  while (queue.length > 0) {
    const node = queue.shift()
    for (const child of node.children || []) {
      if (matches(child, selector)) return child
      queue.push(child)
    }
  }
  return null
}

class FakeFileReader {
  constructor() { this.onload = null; this.onerror = null; this.result = null }
  readAsDataURL() {
    this.result = 'data:image/jpeg;base64,' + 'B'.repeat(2000)
    if (typeof this.onload === 'function') this.onload()
  }
}

const appRoot = new El('div')
appRoot.attrs.id = 'root'
const head = new El('head')
const body = new El('body')
const documentElement = new El('html')

globalThis.document = {
  head,
  body,
  documentElement,
  createElement: (tag) => new El(tag),
  querySelector: (selector) => find([head, body], selector),
  getElementById: (id) => (id === 'root' ? appRoot : null),
  addEventListener: () => {},
}
globalThis.FileReader = FakeFileReader

const store = new Map()
const rafQueue = []
let computedColor = 'rgb(20, 30, 40)'
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  getComputedStyle: () => ({ getPropertyValue: () => computedColor }),
  requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length },
  cancelAnimationFrame: () => {},
  setTimeout: (...args) => setTimeout(...args),
  clearTimeout: (...args) => clearTimeout(...args),
}
const flushFrame = () => { for (const cb of rafQueue.splice(0)) cb(0) }

/* ----------------------------------------------------------------- load bundle */

const captured = []
globalThis.window.__ModuleLoader__ = { load: (definition) => captured.push(definition) }

const source = fs.readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8')
const loadBundle = () => { captured.length = 0; (0, eval)(source); return captured[0] }

const definition = loadBundle()
check('bundle called __ModuleLoader__.load exactly once', captured.length === 1, `got ${captured.length}`)
check('module id is dsh-skin-studio', definition && definition.id === 'dsh-skin-studio', String(definition && definition.id))
check('factory is a function', typeof (definition && definition.factory) === 'function')

/* ----------------------------------------------------------------- exercise apply */

const PICTURE = 'data:image/jpeg;base64,' + 'A'.repeat(4000)
store.set('dsh-skin-studio:v2', JSON.stringify({ blur: 20, fit: 'cover' }))
store.set('dsh-skin-studio:image', PICTURE)
// Legacy keys from the old full-skin editor, which the migration must drop.
store.set('dsh-skin-studio:v1', '{"colors":{}}')
store.set('dsh-skin-studio:schemes', '{"x":{}}')
store.set('dsh-skin-studio:active', 'x')

const registrations = []
let effectDisposer
const themeListeners = []

const ctx = {
  on: (event, handler) => {
    if (event !== 'theme/change') return () => {}
    themeListeners.push(handler)
    return () => { const at = themeListeners.indexOf(handler); if (at >= 0) themeListeners.splice(at, 1) }
  },
  slots: {
    inject: (key, callback) => {
      const disposer = callback()
      return () => { if (typeof disposer === 'function') disposer() }
    },
    register: (slotDefinition, component) => {
      registrations.push({ definition: slotDefinition, component })
      return () => { registrations.push({ disposed: slotDefinition.name }) }
    },
  },
  effect: (body_) => { effectDisposer = body_(); return effectDisposer },
}

const exports_ = definition.factory((name) => {
  if (name === 'react') return reactStub
  throw new Error(`unexpected require(${name})`)
})

check("exports.inject is ['slots'] (no theme service)", JSON.stringify(exports_.inject) === '["slots"]', JSON.stringify(exports_.inject))
check('exports.apply is a function', typeof exports_.apply === 'function')

let threw
try {
  exports_.apply(ctx)
} catch (error) {
  threw = error
}
check('apply() does not throw', threw === undefined, threw && threw.message)

/* -------------------------------------------------------------- migration */

check('migration drops the old settings key', window.localStorage.getItem('dsh-skin-studio:v1') === null)
check('migration drops the old schemes key', window.localStorage.getItem('dsh-skin-studio:schemes') === null)
check('migration drops the old active pointer', window.localStorage.getItem('dsh-skin-studio:active') === null)
check('migration keeps the picture', window.localStorage.getItem('dsh-skin-studio:image') === PICTURE)

/* ------------------------------------------------------------- panel placement */

const sidebar = registrations.find((entry) => entry.definition && entry.definition.name === 'sidebar.panellist')
const main = registrations.find((entry) => entry.definition && entry.definition.name === 'main')
check('registered a sidebar.panellist row', sidebar !== undefined)
check('registered a main page', main !== undefined)
check(
  'sidebar row id equals the main page key',
  sidebar !== undefined && main !== undefined && sidebar.definition.id === main.definition.key && sidebar.definition.id === 'skin-studio',
)
check('sidebar row declares a label', sidebar !== undefined && typeof sidebar.definition.label === 'function' && sidebar.definition.label() === '皮肤工坊')

const pageProps = () => ({ usePanelInfo: (selector) => selector({ activePanelId: 'skin-studio' }) })
const page = main.component(pageProps())
check('page renders when this panel is active', page !== null && page.type === 'div')
const pageText = texts(page).join(' | ')
for (const label of ['皮肤工坊', '背景图', '全局蒙版虚化', '虚化程度', '适配方式', '移除背景图']) {
  check(`page shows 「${label}」`, pageText.includes(label))
}
// The colour editor must be GONE.
check('page no longer offers colour controls', byKey(page, 'base') === null && byKey(page, '主要文字') === null)

/* ----------------------------------------------------------------- wallpaper */

check('body carries the wallpaper class', classes(body).has('dss-wall'))
const bgLayer = find([body], '.dss-bg')
check('wallpaper layer element was created', bgLayer !== null)
check('picture was written straight onto the layer', String(bgLayer && bgLayer.style.backgroundImage).startsWith('url("data:image/jpeg;base64,'))

const wallSheet = find([head], 'style[data-plugin-css="dsh-skin-studio/wall"]')
check('wall stylesheet was injected', wallSheet !== null)
const wallCss = wallSheet === null ? '' : wallSheet.textContent
check('stylesheet raises #root above the picture', wallCss.includes('body.dss-wall>#root{position:relative;z-index:1}'))
check('stylesheet makes app surfaces transparent', wallCss.includes('body,#root{background-color:transparent!important}'))

const groundSheet = find([head], 'style[data-plugin-css="dsh-skin-studio/ground"]')
check('ground stylesheet was injected', groundSheet !== null)
const groundCss = groundSheet === null ? '' : groundSheet.textContent
check('the scrim uses the theme background colour', groundCss.includes('--dsw-alias-bg-base:rgba(20,30,40,0.500)!important'), groundCss.slice(0, 90))
check('the scrim is translucent', groundCss.includes('--dsw-alias-bg-layer-1:rgba(20,30,40,0.700)!important'))
check('the scrim is frosted with a backdrop blur', groundCss.includes('backdrop-filter:blur(20px)'), 'default 20px')

/* ----------------------------------------------------------------- frost slider */

const blurSlider = byKey(page, 'blur')
check('虚化程度 slider is on the page', blurSlider !== null)
let groundWrites = 0
let groundText = groundCss
Object.defineProperty(groundSheet, 'textContent', {
  get: () => groundText,
  set: (value) => { groundWrites += 1; groundText = value },
  configurable: true,
})
for (const value of ['24', '28', '32', '36', '40']) {
  blurSlider.props.onChange({ target: { value } })
}
check('five blur changes queued at most one frame', rafQueue.length <= 1, `queued=${rafQueue.length}`)
flushFrame()
check('five blur changes produced exactly ONE ground rewrite', groundWrites === 1, `writes=${groundWrites}`)
check('ground sheet reflects the final blur', groundText.includes('backdrop-filter:blur(40px)'))
check('blur 0 disables the frost', (() => {
  blurSlider.props.onChange({ target: { value: '0' } })
  flushFrame()
  return groundText.includes('backdrop-filter:none')
})(), groundText.slice(0, 60))

/* ------------------------------------------------------------ scrim opacity */

const alphaSlider = byKey(page, 'alpha')
check('蒙版浓度 slider is on the page', alphaSlider !== null)
alphaSlider.props.onChange({ target: { value: '0' } })
flushFrame()
check('蒙版浓度 0 makes the scrim fully transparent', groundText.includes('--dsw-alias-bg-base:rgba(20,30,40,0.000)!important'), groundText.slice(0, 90))
alphaSlider.props.onChange({ target: { value: '100' } })
flushFrame()
check('蒙版浓度 100 makes the scrim opaque', groundText.includes('--dsw-alias-bg-base:rgba(20,30,40,0.980)!important'), groundText.slice(0, 90))

/* ------------------------------------------------------------ theme switch */

// The theme service rewrites the background tokens on a theme switch. The scrim
// must follow, not stay stuck on the old theme's colour.
computedColor = 'rgb(250, 250, 250)'
themeListeners.slice().forEach((handler) => handler({ active: { tokens: {} } }))
flushFrame()
const switchedGround = find([head], 'style[data-plugin-css="dsh-skin-studio/ground"]')
check(
  'a theme switch re-derives the scrim from the new theme colour',
  switchedGround !== null && switchedGround.textContent.includes('--dsw-alias-bg-base:rgba(250,250,250,0.980)!important'),
  switchedGround ? switchedGround.textContent.slice(0, 90) : 'no sheet',
)

/* ------------------------------------------------------------------ remove */

const removeButton = byKey(page, 'remove')
check('移除背景图 button is on the page', removeButton !== null)
removeButton.props.onClick()
flushFrame()
check('removing clears the stored picture', window.localStorage.getItem('dsh-skin-studio:image') === null)
check('removing drops the wallpaper class', !classes(body).has('dss-wall'))

/* ------------------------------------------------------------- image upload */

const fileInput = byKey(page, 'file')
check('file input is on the page', fileInput !== null)
fileInput.props.onChange({ target: { files: [{}] } })
flushFrame()
check('uploading writes the picture', String(window.localStorage.getItem('dsh-skin-studio:image')).startsWith('data:image/jpeg;base64,'))
check('uploading restores the wallpaper class', classes(body).has('dss-wall'))

/* ----------------------------------------------------------------- teardown */

let teardownThrew
try {
  effectDisposer()
} catch (error) {
  teardownThrew = error
}
check('disposer does not throw', teardownThrew === undefined, teardownThrew && teardownThrew.message)
check('disposer removed the wallpaper class', !classes(body).has('dss-wall'))
check('disposer removed the wallpaper layer', find([body], '.dss-bg') === null)
check('disposer removed the stylesheets', find([head], 'style[data-plugin-css="dsh-skin-studio/wall"]') === null)

console.log('')
console.log(failures.length === 0 ? `ALL PASS (${checks} checks)` : `FAILURES: ${failures.length} -> ${failures.join(' | ')}`)

fs.writeFileSync(OUT, lines.join('\n'), 'utf8')
realLog(lines.join('\n'))
process.exit(failures.length === 0 ? 0 : 1)
