import { Pane, type FolderApi } from 'tweakpane'
import type { FogParams, Vec3 } from './params'

export type Vec3Key = keyof FogParams

export type ControlSpec =
  | { key: Vec3Key; mode: 'scalar' | 'rgb'; label: string; min: number; max: number; step?: number }
  | { key: Vec3Key; mode: 'color'; label: string }

export const controlPresets = {
  uniform: { key: 'uniformDensity', mode: 'scalar', label: 'density', min: 0, max: 0.2, step: 0.0005 },
  density: { key: 'density', mode: 'scalar', label: 'density', min: 0, max: 1.5, step: 0.001 },
  falloff: { key: 'falloff', mode: 'scalar', label: 'falloff', min: 0.01, max: 2, step: 0.001 },
  baseHeight: { key: 'baseHeight', mode: 'scalar', label: 'height', min: -5, max: 15, step: 0.01 },
  densityRGB: { key: 'density', mode: 'rgb', label: 'density', min: 0, max: 1.5, step: 0.001 },
  falloffRGB: { key: 'falloff', mode: 'rgb', label: 'falloff', min: 0.01, max: 2, step: 0.001 },
  baseHeightRGB: { key: 'baseHeight', mode: 'rgb', label: 'height', min: -5, max: 15, step: 0.01 },
  uniformRGB: { key: 'uniformDensity', mode: 'rgb', label: 'density', min: 0, max: 0.2, step: 0.0005 },
  ambient: { key: 'ambient', mode: 'color', label: 'ambient' },
  albedo: { key: 'albedo', mode: 'color', label: 'albedo' },
  uniformAlbedo: { key: 'uniformAlbedo', mode: 'color', label: 'albedo' },
  emission: { key: 'emission', mode: 'color', label: 'emission' },
  uniformEmission: { key: 'uniformEmission', mode: 'color', label: 'emission' },
  lightColor: { key: 'lightColor', mode: 'color', label: 'sun color' },
} satisfies Record<string, ControlSpec>

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

const bindColor = (
  folder: FolderApi | Pane,
  display: Vec3,
  target: Vec3,
  label: string,
  onUserChange: () => void,
) => {
  const o = { c: { r: display[0], g: display[1], b: display[2] } }
  const b = folder.addBinding(o, 'c', { label, color: { type: 'float' } }).on('change', (ev) => {
    if (refreshing) return
    target[0] = ev.value.r
    target[1] = ev.value.g
    target[2] = ev.value.b
    onUserChange()
  })
  return () => {
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
          ? bindColor(folder, display[spec.key], target[spec.key], spec.label, onUserChange)
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
