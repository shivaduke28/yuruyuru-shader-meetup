import { Pane, type FolderApi } from 'tweakpane'
import type { FogParams, Vec3 } from './params'

export type Vec3Key = keyof FogParams

export type ControlSpec =
  | { key: Vec3Key; mode: 'scalar' | 'rgb'; label: string; min: number; max: number; step?: number }
  | { key: Vec3Key; mode: 'color'; label: string }

export const controlPresets = {
  uniform: { key: 'uniformDensity', mode: 'scalar', label: 'fog', min: 0, max: 0.1, step: 0.0005 },
  density: { key: 'density', mode: 'scalar', label: 'a (density)', min: 0, max: 1.5, step: 0.001 },
  falloff: { key: 'falloff', mode: 'scalar', label: 'f (falloff)', min: 0.01, max: 2, step: 0.001 },
  baseHeight: { key: 'baseHeight', mode: 'scalar', label: 'h (height)', min: -5, max: 15, step: 0.01 },
  densityRGB: { key: 'density', mode: 'rgb', label: 'a (density)', min: 0, max: 1.5, step: 0.001 },
  falloffRGB: { key: 'falloff', mode: 'rgb', label: 'f (falloff)', min: 0.01, max: 2, step: 0.001 },
  baseHeightRGB: { key: 'baseHeight', mode: 'rgb', label: 'h (height)', min: -5, max: 15, step: 0.01 },
  uniformRGB: { key: 'uniformDensity', mode: 'rgb', label: 'uniform', min: 0, max: 0.1, step: 0.0005 },
  fogColor: { key: 'fogColor', mode: 'color', label: 'fog color' },
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
  const refreshers = specs.map((spec) =>
    spec.mode === 'color'
      ? bindColor(pane, display[spec.key], target[spec.key], spec.label, onUserChange)
      : bindVec3(pane, display[spec.key], target[spec.key], spec, onUserChange),
  )
  return {
    pane,
    refresh: () => refreshers.forEach((r) => r()),
  }
}
