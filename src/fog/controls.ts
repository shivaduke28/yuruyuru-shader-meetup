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

/**
 * Tweakpane は配列を直接バインドできないので、
 * 編集用のプレーンオブジェクトを挟んで target の Vec3 に書き戻す。
 */
const bindVec3 = (folder: FolderApi | Pane, target: Vec3, spec: Extract<ControlSpec, { mode: 'scalar' | 'rgb' }>) => {
  const { min, max, step } = spec
  if (spec.mode === 'scalar') {
    const o = { v: target[0] }
    const b = folder.addBinding(o, 'v', { label: spec.label, min, max, step })
    b.on('change', (ev) => {
      target[0] = target[1] = target[2] = ev.value
    })
    return () => {
      o.v = target[0]
      b.refresh()
    }
  }
  const o = { R: target[0], G: target[1], B: target[2] }
  const f = folder.addFolder({ title: spec.label, expanded: true })
  const bs = (['R', 'G', 'B'] as const).map((ch, i) =>
    f.addBinding(o, ch, { min, max, step }).on('change', (ev) => {
      target[i] = ev.value
    }),
  )
  return () => {
    o.R = target[0]
    o.G = target[1]
    o.B = target[2]
    bs.forEach((b) => b.refresh())
  }
}

const bindColor = (folder: FolderApi | Pane, target: Vec3, label: string) => {
  const o = { c: { r: target[0], g: target[1], b: target[2] } }
  const b = folder.addBinding(o, 'c', { label, color: { type: 'float' } }).on('change', (ev) => {
    target[0] = ev.value.r
    target[1] = ev.value.g
    target[2] = ev.value.b
  })
  return () => {
    o.c = { r: target[0], g: target[1], b: target[2] }
    b.refresh()
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
): BoundPane => {
  const pane = new Pane({ container, title, expanded: true })
  const refreshers = specs.map((spec) =>
    spec.mode === 'color'
      ? bindColor(pane, target[spec.key], spec.label)
      : bindVec3(pane, target[spec.key], spec),
  )
  return {
    pane,
    refresh: () => refreshers.forEach((r) => r()),
  }
}
