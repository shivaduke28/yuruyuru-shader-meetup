import '../style.css'
import 'highlight.js/styles/github-dark.css'
import { createFogRenderer } from '../fog/renderer'
import { cloneParams, defaultCamera, defaultFogParams, lerpParams } from '../fog/params'
import { createFogPane, type BoundPane } from '../fog/controls'
import { slides } from './slides'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const slideEl = document.getElementById('slide') as HTMLElement
const paneEl = document.getElementById('pane') as HTMLElement
const footerEl = document.getElementById('footer') as HTMLElement

// live: 実際に描画に使う値。target: スライドや UI が指定する値。毎フレーム live -> target に寄せる
const live = defaultFogParams()
const target = cloneParams(live)
const camera = defaultCamera()
const renderer = createFogRenderer(canvas, live, camera)
renderer.start()

let pane: BoundPane | null = null
let index = -1
let randomTimer = 0

const rand = (r: { min: number; max: number }) => r.min + Math.random() * (r.max - r.min)

const readHash = () => {
  const n = Number.parseInt(location.hash.replace('#', ''), 10)
  return Number.isFinite(n) ? Math.min(slides.length - 1, Math.max(0, n - 1)) : 0
}

const show = (i: number) => {
  if (i === index) return
  index = i
  const slide = slides[i]
  history.replaceState(null, '', `#${i + 1}`)

  slideEl.innerHTML = slide.html
  slideEl.className = `slide layout-${slide.layout ?? 'left'}`
  footerEl.textContent = `${i + 1} / ${slides.length}`

  if (slide.params) {
    Object.assign(target, cloneParams({ ...target, ...slide.params }))
  }

  pane?.pane.dispose()
  pane = null
  paneEl.innerHTML = ''
  if (slide.controls?.length) {
    pane = createFogPane(paneEl, target, slide.controls)
  }

  clearInterval(randomTimer)
  const r = slide.randomize
  if (r) {
    randomTimer = window.setInterval(() => {
      for (let ch = 0; ch < 3; ch++) {
        target.density[ch] = rand(r.density)
        target.falloff[ch] = rand(r.falloff)
        target.baseHeight[ch] = rand(r.baseHeight)
      }
      pane?.refresh()
    }, r.intervalMs)
  }
}

const go = (delta: number) => show(Math.min(slides.length - 1, Math.max(0, index + delta)))

window.addEventListener(
  'keydown',
  (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    let handled = true
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
        go(1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
        go(-1)
        break
      case 'Home':
        show(0)
        break
      case 'End':
        show(slides.length - 1)
        break
      case 'h':
      case 'H':
        slideEl.classList.toggle('hidden')
        break
      case 'f':
      case 'F':
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen()
        break
      default:
        handled = false
    }
    if (handled) {
      // Tweakpane のスライダーにフォーカスがあっても矢印はページ送りに使う
      e.preventDefault()
      e.stopPropagation()
      ;(document.activeElement as HTMLElement | null)?.blur?.()
    }
  },
  { capture: true },
)

window.addEventListener('hashchange', () => show(readHash()))

// パラメータの補間ループ（描画は renderer 側の rAF）
let lastTime = performance.now()
const tick = (now: number) => {
  const dt = Math.min(0.1, (now - lastTime) / 1000)
  lastTime = now
  const t = 1 - Math.exp(-dt * 6)
  lerpParams(live, live, target, t)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

show(readHash())
