import { Pane, type FolderApi } from 'tweakpane'
import type { FogParams, Vec3 } from './params'

export type Vec3Key = keyof FogParams

export type ControlSpec =
  | { key: Vec3Key; mode: 'scalar' | 'rgb'; label: string; min: number; max: number; step?: number; help?: string }
  | { key: Vec3Key; mode: 'color'; label: string; help?: string }

// help はツールチップ (title 属性)。Tweakpane にはヘルプの仕組みがないのでブラウザ標準のもので代える
const help = {
  uniform: '距離フォグの消散係数 κ (1/長さ)。距離 d での透過率は exp(-κ d)。色は ambient そのもので、光とは相互作用しない',
  density: '高さフォグの消散係数。height の高さでの値',
  falloff: '高さ方向の減衰。height より上では exp(-falloff × (y - height)) で薄くなる。大きいほど薄い層になる',
  baseHeight: 'density を測る基準の高さ。これより下は濃くなる',
  ambient: '環境光。全方向から同じ色で当たる。サーフェスの環境光と距離フォグの色、高さフォグが散乱する光',
  albedo: '高さフォグが環境光をどのくらい散乱して返すか (0..1)。フォグの色 = ambient × albedo',
  emission: '高さフォグ自体が発する光。フォグの色に足される',
  lightColor: '太陽 (平行光源) の色 × 強さ',
}

export const controlPresets = {
  uniform: { key: 'uniformDensity', mode: 'scalar', label: 'density', min: 0, max: 0.2, step: 0.0005, help: help.uniform },
  density: { key: 'density', mode: 'scalar', label: 'density', min: 0, max: 1.5, step: 0.001, help: help.density },
  falloff: { key: 'falloff', mode: 'scalar', label: 'falloff', min: 0.01, max: 2, step: 0.001, help: help.falloff },
  baseHeight: { key: 'baseHeight', mode: 'scalar', label: 'height', min: -5, max: 15, step: 0.01, help: help.baseHeight },
  densityRGB: { key: 'density', mode: 'rgb', label: 'density', min: 0, max: 1.5, step: 0.001, help: help.density },
  falloffRGB: { key: 'falloff', mode: 'rgb', label: 'falloff', min: 0.01, max: 2, step: 0.001, help: help.falloff },
  baseHeightRGB: { key: 'baseHeight', mode: 'rgb', label: 'height', min: -5, max: 15, step: 0.01, help: help.baseHeight },
  uniformRGB: { key: 'uniformDensity', mode: 'rgb', label: 'density', min: 0, max: 0.2, step: 0.0005, help: help.uniform },
  ambient: { key: 'ambient', mode: 'color', label: 'ambient', help: help.ambient },
  albedo: { key: 'albedo', mode: 'color', label: 'albedo', help: help.albedo },
  emission: { key: 'emission', mode: 'color', label: 'emission', help: help.emission },
  lightColor: { key: 'lightColor', mode: 'color', label: 'sun color', help: help.lightColor },
} satisfies Record<string, ControlSpec>

/** ブレードにツールチップを付ける (title 属性)。チェーンできるように同じ API を返す */
export const withHelp = <T extends { element: HTMLElement }>(api: T, help: string): T => {
  api.element.title = help
  return api
}

/** フォルダのタイトル行にツールチップを付ける。フォルダ全体に付けると中のコントロールにも出てしまうので見出しだけ */
export const folderHelp = (folder: FolderApi, help: string) => {
  folder.controller.view.buttonElement.title = help
}

// refresh() は値が変わっていると change を同期で投げるので、その間はユーザー操作として扱わない
let refreshing = false
const refreshQuietly = (bs: { refresh(): void }[]) => {
  refreshing = true
  try {
    bs.forEach((b) => b.refresh())
  } finally {
    refreshing = false
  }
}

/**
 * Tweakpane は配列を直接バインドできないので、編集用のプレーンオブジェクトを挟む。
 * 表示は display から読み、ユーザーの操作は target に書く (スライドでは display = 補間中の値、target = 目標値)。
 */
const bindVec3 = (
  folder: FolderApi | Pane,
  display: Vec3,
  target: Vec3,
  spec: Extract<ControlSpec, { mode: 'scalar' | 'rgb' }>,
  onUserChange: () => void,
) => {
  const { min, max, step } = spec
  if (spec.mode === 'scalar') {
    const o = { v: display[0] }
    const b = folder.addBinding(o, 'v', { label: spec.label, min, max, step })
    if (spec.help) b.element.title = spec.help
    b.on('change', (ev) => {
      if (refreshing) return
      target[0] = target[1] = target[2] = ev.value
      onUserChange()
    })
    return () => {
      o.v = display[0]
      refreshQuietly([b])
    }
  }
  const o = { R: display[0], G: display[1], B: display[2] }
  const f = folder.addFolder({ title: spec.label, expanded: true })
  if (spec.help) f.element.title = spec.help
  const bs = (['R', 'G', 'B'] as const).map((ch, i) =>
    f.addBinding(o, ch, { min, max, step }).on('change', (ev) => {
      if (refreshing) return
      target[i] = ev.value
      onUserChange()
    }),
  )
  return () => {
    o.R = display[0]
    o.G = display[1]
    o.B = display[2]
    refreshQuietly(bs)
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

const bindColor = (
  folder: FolderApi | Pane,
  display: Vec3,
  target: Vec3,
  label: string,
  onUserChange: () => void,
  help?: string,
) => {
  const o = { c: { r: display[0], g: display[1], b: display[2] } }
  const b = folder.addBinding(o, 'c', { label, color: { type: 'float' } }).on('change', (ev) => {
    if (refreshing) return
    target[0] = ev.value.r
    target[1] = ev.value.g
    target[2] = ev.value.b
    onUserChange()
  })
  if (help) b.element.title = help
  return () => {
    // 値が同じなら書き戻さない。無彩色 (gray / white / black) は RGB に hue の情報がないので、
    // 書き戻すたびにピッカーの hue が 0 に戻ってしまう (S や V を触らずに hue だけ動かすと元に戻るバグ)
    const c = o.c
    if (near(c.r, display[0]) && near(c.g, display[1]) && near(c.b, display[2])) return
    o.c = { r: display[0], g: display[1], b: display[2] }
    refreshQuietly([b])
  }
}

export type BoundPane = {
  pane: Pane
  /** target 側が外から変わったときに UI を同期する */
  refresh(): void
  /** フォルダなどに後からコントロールを足す。refresh の対象にも入る */
  addControls(folder: FolderApi | Pane, specs: ControlSpec[]): void
}

export const createFogPane = (
  container: HTMLElement,
  target: FogParams,
  specs: ControlSpec[],
  title?: string,
  /** 表示に使う値。省略時は target をそのまま表示する */
  display: FogParams = target,
  /** ユーザーが値を変えたときに呼ぶ */
  onUserChange: () => void = () => {},
): BoundPane => {
  const pane = new Pane({ container, title, expanded: true })
  const refreshers: (() => void)[] = []
  const addControls = (folder: FolderApi | Pane, specs: ControlSpec[]) => {
    for (const spec of specs) {
      refreshers.push(
        spec.mode === 'color'
          ? bindColor(folder, display[spec.key], target[spec.key], spec.label, onUserChange, spec.help)
          : bindVec3(folder, display[spec.key], target[spec.key], spec, onUserChange),
      )
    }
  }
  addControls(pane, specs)
  return {
    pane,
    refresh: () => refreshers.forEach((r) => r()),
    addControls,
  }
}
