import '../style.css'
import 'highlight.js/styles/github-dark.css'
import { createFogRenderer } from '../fog/renderer'
import {
  assignParams,
  cloneParams,
  defaultCamera,
  defaultFogParams,
  lerpParams,
  paramsEqual,
} from '../fog/params'
import { createFogPane, type BoundPane } from '../fog/controls'
import { slides } from './slides'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const stageEl = document.getElementById('stage') as HTMLElement
const titleEl = document.getElementById('title') as HTMLElement
const sideEl = document.getElementById('side-content') as HTMLElement
const sideInnerEl = document.getElementById('side-inner') as HTMLElement
const bodyEl = document.getElementById('body-inner') as HTMLElement
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
let draggingPane = false
paneEl.addEventListener('pointerdown', () => (draggingPane = true))
window.addEventListener('pointerup', () => (draggingPane = false))
window.addEventListener('pointercancel', () => (draggingPane = false))

// ステージは 1920 × 1080 で設計し、ウィンドウに収まるよう全体を一様に拡大縮小する
const fitStage = () => {
  stageEl.style.zoom = String(Math.min(window.innerWidth / 1920, window.innerHeight / 1080))
}
window.addEventListener('resize', fitStage)
fitStage()

// 中身を枠に合わせる: 基準サイズで測り、はみ出すなら入るまで一様に縮小する
const fitToBox = (inner: HTMLElement, axis: 'both' | 'width' | 'height' = 'both') => {
  const box = inner.parentElement!
  inner.style.zoom = '1'
  const w = axis === 'height' ? 1 : box.clientWidth / inner.scrollWidth
  const h = axis === 'width' ? 1 : box.clientHeight / inner.scrollHeight
  const z = Math.min(1, w, h)
  inner.style.zoom = String(Number.isFinite(z) && z > 0 ? z : 1)
}
const fitAll = () => {
  // コードは自分の幅だけで収める (スライダーを道連れにしない)。カラム全体は高さが溢れたときだけ縮める
  fitToBox(sideEl, 'width')
  fitToBox(sideInnerEl, 'height')
  fitToBox(bodyEl)
}
// フォントの読み込みで文字幅が変わるので、読み込み後にもう一度合わせる
void document.fonts.ready.then(fitAll)

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

  stageEl.className = `stage layout-${slide.layout}`
  titleEl.textContent = slide.title
  sideEl.innerHTML = slide.side ?? ''
  bodyEl.innerHTML = slide.body ?? ''
  footerEl.textContent = `${i + 1} / ${slides.length}`

  if (slide.params) assignParams(target, slide.params)

  pane?.pane.dispose()
  pane = null
  paneEl.innerHTML = ''
  if (slide.controls?.length) {
    // 表示は補間中の値 (live)、操作は目標値 (target) へ。手で動かしたときはトゥイーンせず即反映
    pane = createFogPane(paneEl, target, slide.controls, undefined, live, () => assignParams(live, target))
  }

  fitAll()

  clearInterval(randomTimer)
  const r = slide.randomize
  if (r) {
    randomTimer = window.setInterval(() => {
      for (let ch = 0; ch < 3; ch++) {
        target.density[ch] = rand(r.density)
        target.falloff[ch] = rand(r.falloff)
        target.baseHeight[ch] = rand(r.baseHeight)
        if (r.fogColor) target.fogColor[ch] = rand(r.fogColor)
      }
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
      case 'f':
      case 'F':
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen()
        break
      case 'Escape':
        if (document.fullscreenElement) void document.exitFullscreen()
        else handled = false
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

// パラメータのトゥイーン（描画は renderer 側の rAF）
// 目標値が変わった時点の値を起点に、一定時間で ease-in-out して止める。
// 途中で目標値が変わったら、そのときの値から新しく始める
const TWEEN_SECONDS = 0.6
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
let tweenFrom = cloneParams(live)
let tweenTarget = cloneParams(target)
let tweenStart = performance.now()
const tick = (now: number) => {
  if (!paramsEqual(target, tweenTarget)) {
    tweenFrom = cloneParams(live)
    tweenTarget = cloneParams(target)
    tweenStart = now
  }
  const t = Math.min(1, (now - tweenStart) / 1000 / TWEEN_SECONDS)
  lerpParams(live, tweenFrom, tweenTarget, easeInOutCubic(t))
  // スライダーの表示も補間中の値に追従させる。ドラッグ中は手を離すまで触らない
  if (!draggingPane) pane?.refresh()
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

show(readHash())
