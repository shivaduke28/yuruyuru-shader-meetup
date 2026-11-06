import 'highlight.js/styles/github-dark.css'
import { createFogRenderer, DEFAULT_NOISE, DEFAULT_SUN_AZIMUTH, DEFAULT_SUN_ELEVATION, FOG_MIX_OPTIONS } from '../fog/renderer'
import {
  assignParams,
  cloneParams,
  defaultCamera,
  defaultFogParams,
  lerpParams,
  paramsEqual,
} from '../fog/params'
import { Pane } from 'tweakpane'
import { createFogPane, type BoundPane, type ControlSpec } from '../fog/controls'
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

let panes: BoundPane[] = []
// FogParams 以外のトグル (太陽光の減衰など) 用のカード
let extraPane: Pane | null = null
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
  // 前のページの縮小が残っていると、枠 (親) の幅や高さを大きく測ってしまう。先に全部 1 に戻してから測る
  for (const el of [sideEl, sideInnerEl, bodyEl]) el.style.zoom = '1'
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
  // スライドの定義は現象ごと: fogAmbient = 空の光の 2 つ、fogSun = 太陽光の 3 つをまとめて入れる。トグルは renderer のフラグごとに出す
  renderer.skyAttenuation = renderer.skyInscatterAmbient = slide.fogAmbient ?? false
  renderer.sunAttenuation = renderer.sunInscatter = renderer.sunInscatterAmbient = slide.fogSun ?? false
  renderer.sunInscatterShadow = slide.sunShadow ?? false
  // ノイズはスライドごとに既定値に戻す (前のスライドでスライダーを動かしても持ち越さない)
  renderer.phaseG = slide.phaseG ?? 0
  renderer.fogMixMode = slide.fogMixMode ?? 0
  const noise = { ...DEFAULT_NOISE, ...slide.noise }
  renderer.noise = slide.noise !== undefined
  renderer.noiseScale = noise.scale
  renderer.noiseMin = noise.min
  renderer.noiseMax = noise.max
  renderer.noiseSpeed = noise.speed
  renderer.sunAzimuth = slide.sun?.azimuth ?? DEFAULT_SUN_AZIMUTH
  renderer.sunElevation = slide.sun?.elevation ?? DEFAULT_SUN_ELEVATION

  panes.forEach((p) => p.pane.dispose())
  panes = []
  extraPane?.dispose()
  extraPane = null
  paneEl.innerHTML = ''
  if (slide.controls?.length) {
    // 配列の配列ならカードごとに Pane を分ける
    const groups = (Array.isArray(slide.controls[0]) ? slide.controls : [slide.controls]) as ControlSpec[][]
    // 表示は補間中の値 (live)、操作は目標値 (target) へ。手で動かしたときはトゥイーンせず即反映
    panes = groups.map((specs) => createFogPane(paneEl, target, specs, undefined, live, () => assignParams(live, target)))
  }
  // フォグを面に適用するスライドでは、オンオフのトグルを別のカードに出す
  const showToggle = (k: 'fogAmbient' | 'fogSun' | 'sunShadow' | 'noise') =>
    slide[k] !== undefined && (slide.toggles === undefined || slide.toggles.includes(k))
  if (
    showToggle('fogAmbient') ||
    showToggle('fogSun') ||
    showToggle('sunShadow') ||
    showToggle('noise') ||
    slide.phaseG !== undefined ||
    slide.fogMixMode !== undefined
  ) {
    extraPane = new Pane({ container: paneEl })
    const toggles = {
      skyAttenuation: renderer.skyAttenuation,
      skyInscatterAmbient: renderer.skyInscatterAmbient,
      sunAttenuation: renderer.sunAttenuation,
      sunInscatter: renderer.sunInscatter,
      sunInscatterAmbient: renderer.sunInscatterAmbient,
      sunInscatterShadow: renderer.sunInscatterShadow,
    }
    if (showToggle('fogAmbient')) {
      extraPane.addBinding(toggles, 'skyAttenuation', { label: 'sky attenuation' }).on('change', (ev) => {
        renderer.skyAttenuation = ev.value
      })
      extraPane.addBinding(toggles, 'skyInscatterAmbient', { label: 'sky inscatter ambient' }).on('change', (ev) => {
        renderer.skyInscatterAmbient = ev.value
      })
    }
    if (showToggle('fogSun')) {
      extraPane.addBinding(toggles, 'sunAttenuation', { label: 'sun attenuation' }).on('change', (ev) => {
        renderer.sunAttenuation = ev.value
      })
      extraPane.addBinding(toggles, 'sunInscatter', { label: 'sun inscatter' }).on('change', (ev) => {
        renderer.sunInscatter = ev.value
      })
      extraPane.addBinding(toggles, 'sunInscatterAmbient', { label: 'sun inscatter ambient' }).on('change', (ev) => {
        renderer.sunInscatterAmbient = ev.value
      })
    }
    if (showToggle('sunShadow')) {
      extraPane.addBinding(toggles, 'sunInscatterShadow', { label: 'sun inscatter shadow' }).on('change', (ev) => {
        renderer.sunInscatterShadow = ev.value
      })
    }
    if (slide.phaseG !== undefined) {
      extraPane.addBinding(renderer, 'phaseG', { label: 'phase g', min: -0.9, max: 0.9, step: 0.01 })
    }
    if (slide.fogMixMode !== undefined) {
      extraPane.addBinding(renderer, 'fogMixMode', { label: 'mix', options: FOG_MIX_OPTIONS })
    }
    if (showToggle('noise')) {
      extraPane.addBinding(renderer, 'noise', { label: 'noise' })
      extraPane.addBinding(renderer, 'noiseScale', { label: 'scale', min: 0.02, max: 3, step: 0.01 })
      extraPane.addBinding(renderer, 'noiseMin', { label: 'min', min: 0, max: 2, step: 0.01 })
      extraPane.addBinding(renderer, 'noiseMax', { label: 'max', min: 0, max: 2, step: 0.01 })
      extraPane.addBinding(renderer, 'noiseSpeed', { label: 'speed', min: 0, max: 5, step: 0.1 })
    }
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
        if (r.albedo) target.albedo[ch] = rand(r.albedo)
        if (r.ambient) target.ambient[ch] = rand(r.ambient)
        if (r.emission) target.emission[ch] = rand(r.emission)
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

// タッチ端末ではタップでページ送り。右 3/4 で次へ、左 1/4 で前へ。
// ペインの上のタップとドラッグ (カメラ操作) は除く。指で動かした距離と時間でタップを判定する
let tap: { x: number; y: number; time: number } | null = null
window.addEventListener('pointerdown', (e) => {
  tap = e.pointerType === 'touch' && !paneEl.contains(e.target as Node) ? { x: e.clientX, y: e.clientY, time: e.timeStamp } : null
})
window.addEventListener('pointerup', (e) => {
  if (!tap) return
  const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y)
  const held = e.timeStamp - tap.time
  tap = null
  if (moved > 10 || held > 300) return
  go(e.clientX < window.innerWidth / 4 ? -1 : 1)
})

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
  if (!draggingPane) panes.forEach((p) => p.refresh())
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

show(readHash())
