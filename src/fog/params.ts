export type Vec3 = [number, number, number]

/** フォグのパラメータ。a/f/h は RGB ごとに持つ */
export type FogParams = {
  /** density a (>0) */
  density: Vec3
  /** falloff f (>0) */
  falloff: Vec3
  /** base height h */
  baseHeight: Vec3
  /** 高さに依存しない一様フォグの密度 */
  uniformDensity: Vec3
  /** 内散乱に使う定数光（フォグ色） */
  fogColor: Vec3
  /** フォグ自体が発する光 */
  emission: Vec3
}

export const defaultFogParams = (): FogParams => ({
  density: [0.35, 0.35, 0.35],
  falloff: [0.5, 0.5, 0.5],
  baseHeight: [0.0, 0.0, 0.0],
  uniformDensity: [0, 0, 0],
  fogColor: [0.4, 0.4, 0.4],
  emission: [0, 0, 0],
})

export const noFog = (): FogParams => ({
  ...defaultFogParams(),
  density: [0, 0, 0],
  uniformDensity: [0, 0, 0],
})

export const cloneParams = (p: FogParams): FogParams => ({
  density: [...p.density],
  falloff: [...p.falloff],
  baseHeight: [...p.baseHeight],
  uniformDensity: [...p.uniformDensity],
  fogColor: [...p.fogColor],
  emission: [...p.emission],
})

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpVec = (out: Vec3, a: Vec3, b: Vec3, t: number) => {
  out[0] = lerp(a[0], b[0], t)
  out[1] = lerp(a[1], b[1], t)
  out[2] = lerp(a[2], b[2], t)
}

/** out を from から to へ t だけ近づける（スライド遷移用） */
export const lerpParams = (out: FogParams, from: FogParams, to: FogParams, t: number) => {
  lerpVec(out.density, from.density, to.density, t)
  lerpVec(out.falloff, from.falloff, to.falloff, t)
  lerpVec(out.baseHeight, from.baseHeight, to.baseHeight, t)
  lerpVec(out.uniformDensity, from.uniformDensity, to.uniformDensity, t)
  lerpVec(out.fogColor, from.fogColor, to.fogColor, t)
  lerpVec(out.emission, from.emission, to.emission, t)
}

/** dst の配列を差し替えずに、src の値を書き込む (配列を参照している UI を壊さない) */
export const assignParams = (dst: FogParams, src: Partial<FogParams>) => {
  for (const k of Object.keys(src) as (keyof FogParams)[]) {
    const v = src[k]
    if (!v) continue
    dst[k][0] = v[0]
    dst[k][1] = v[1]
    dst[k][2] = v[2]
  }
}

export const paramsEqual = (a: FogParams, b: FogParams) =>
  (Object.keys(a) as (keyof FogParams)[]).every((k) => a[k].every((v, i) => v === b[k][i]))

export type Camera = {
  /** 現在位置。z は毎フレーム speed * dt だけ進む */
  position: Vec3
  /** 水平角 (rad)。0 で +z を向く */
  yaw: number
  /** 仰角 (rad)。負で見下ろす */
  pitch: number
  /** 前進速度 (units/s) */
  speed: number
  fov: number
}

export const defaultCamera = (): Camera => ({
  position: [3.5, 8, 0], // 柱の列は x = 7k にあるので、その間を進む
  yaw: 0,
  pitch: -0.15,
  speed: 3,
  fov: 60,
})
