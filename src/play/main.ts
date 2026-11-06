import { Pane } from 'tweakpane'
import { createFogRenderer, DEFAULT_NOISE, DEFAULT_SUN_AZIMUTH, DEFAULT_SUN_ELEVATION, FOG_MIX_OPTIONS, MIN_SUN_ELEVATION } from '../fog/renderer'
import { assignParams, defaultCamera, defaultFogParams, type FogParams } from '../fog/params'
import { controlPresets, createFogPane, folderHelp, withHelp } from '../fog/controls'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const paneTopEl = document.getElementById('pane-top') as HTMLElement
const paneScrollEl = document.getElementById('pane-scroll') as HTMLElement
const infoEl = document.getElementById('info') as HTMLElement

const params = defaultFogParams()
const camera = defaultCamera()
const renderer = createFogRenderer(canvas, params, camera)
renderer.start()

// トグルは renderer のフラグと 1 対 1。光源 (sky / sun) × {attenuation = サーフェスに届く光の減衰, inscatter = カメラへの内散乱,
// inscatter ambient = サーフェスの環境光に足す内散乱} と、光芒、発光
type Toggles = {
  skyAttenuation: boolean
  skyInscatterAmbient: boolean
  sunAttenuation: boolean
  sunInscatter: boolean
  sunInscatterAmbient: boolean
  sunInscatterShadow: boolean
  emissionAmbient: boolean
}
const defaultToggles = (): Toggles => ({
  skyAttenuation: false,
  skyInscatterAmbient: false,
  sunAttenuation: false,
  sunInscatter: false,
  sunInscatterAmbient: false,
  sunInscatterShadow: false,
  emissionAmbient: false,
})

// プリセット = フォグのパラメータとトグルの組み合わせ (再現できる見た目)。Scene / Noise / Camera は触らない
type Preset = { params: Partial<FogParams>; toggles?: Partial<Toggles> }

const presets: Record<string, Preset> = {
  plain: { params: defaultFogParams() },
  rgb: {
    params: {
      density: [0.25, 0.35, 0.55],
      falloff: [0.35, 0.55, 0.9],
      baseHeight: [0, 1.5, 3],
    },
  },
  uniform: { params: { density: [0, 0, 0], uniformDensity: [0.02, 0.02, 0.02] } },
  // 水: 赤が早く吸われて遠くが青緑になる。環境光は暗めの青緑、太陽は青白く弱め (向きは Lights で真上寄りにすると水っぽい)
  water: {
    params: {
      density: [0, 0, 0],
      uniformDensity: [0.2, 0.09, 0.035],
      ambient: [0.16, 0.42, 0.55],
      lightColor: [0.75, 0.9, 1],
      sunIntensity: 1.2,
    },
  },
  // 地面に溜まるガス: 薄い層に濃く、黄緑に散乱、太陽はフォグの中で減衰して散乱、奥がうっすら光る
  gas: {
    params: {
      density: [1.5, 1.5, 1.5],
      falloff: [0.7, 0.7, 0.7],
      baseHeight: [0, 0, 0],
      uniformDensity: [0, 0, 0],
      albedo: [0.77, 0.91, 0.58],
      ambient: [0.58, 0.61, 0.58],
      lightColor: [1, 0.95, 0.88],
      sunIntensity: 1,
      emission: [0, 0.22, 0],
    },
    toggles: { sunAttenuation: true, sunInscatter: true, sunInscatterAmbient: true },
  },
}

const toggles = defaultToggles()
const applyToggles = () => {
  renderer.skyAttenuation = toggles.skyAttenuation
  renderer.skyInscatterAmbient = toggles.skyInscatterAmbient
  renderer.sunAttenuation = toggles.sunAttenuation
  renderer.sunInscatter = toggles.sunInscatter
  renderer.sunInscatterAmbient = toggles.sunInscatterAmbient
  renderer.sunInscatterShadow = toggles.sunInscatterShadow
  renderer.emissionAmbient = toggles.emissionAmbient
}

const applyPreset = (preset: Preset) => {
  assignParams(params, { ...defaultFogParams(), ...preset.params })
  Object.assign(toggles, defaultToggles(), preset.toggles)
  applyToggles()
}

// 上のカードは固定 (preset と Reset)、下のカードはスクロールする
const topPane = new Pane({ container: paneTopEl })
const bound = createFogPane(paneScrollEl, params, [])
const pane = bound.pane
const refreshAll = () => {
  topPane.refresh()
  pane.refresh()
  bound.refresh()
}

const presetState = { preset: 'plain' }
withHelp(
  topPane.addBinding(presetState, 'preset', {
    label: 'preset',
    options: Object.fromEntries(Object.keys(presets).map((k) => [k, k])),
  }),
  'フォグのパラメータとトグルの組み合わせ。Noise / Scene / Camera は変えない',
).on('change', (ev) => {
  applyPreset(presets[ev.value])
  refreshAll()
})
// 描画解像度はウィンドウの物理ピクセルに対する倍率。絵ではなく機械の都合なので Reset では触らない
withHelp(
  topPane.addBinding(renderer, 'resolutionScale', {
    label: 'resolution',
    options: { 'x1': 1, 'x1/2': 0.5, 'x1/4': 0.25 },
  }),
  '描画解像度。ウィンドウの物理ピクセルに対する倍率。重いときに下げる',
)

// フォルダはスライドの流れに揃える: 距離フォグ → 高さフォグ → 光源 → 追加要素 → 舞台
// 距離フォグは density だけで光と相互作用しない。光との相互作用のトグルは全部高さフォグのものなので Height Fog に置く
const distanceFog = pane.addFolder({ title: 'Distance Fog', expanded: true })
folderHelp(distanceFog, '高さに依らない一様なフォグ。無限に広がるので空の色 = フォグの色 = ambient × albedo。光とは相互作用しない')
bound.addControls(distanceFog, [controlPresets.uniformRGB, controlPresets.uniformAlbedo])
withHelp(
  distanceFog.addBinding(renderer, 'fogMixMode', { label: 'mix', options: FOG_MIX_OPTIONS }),
  '高さフォグとの合成。correct は散乱した量の比で色を混ぜる。他の 2 つは順番に合成する比較用の間違った合成で、先に合成したフォグがもう一方の色に染まる',
)

const heightFog = pane.addFolder({ title: 'Height Fog', expanded: true })
folderHelp(heightFog, '高さとともに指数関数で薄くなるフォグ。フォグの色 = ambient × albedo + emission。光との相互作用のトグルもここ')
bound.addControls(heightFog, [
  controlPresets.densityRGB,
  controlPresets.falloffRGB,
  controlPresets.baseHeightRGB,
  controlPresets.albedo,
  controlPresets.emission,
])
// 空の光 (= 環境光) にフォグを効かせる 2 つ。両方入れると ambient × T + ambient × albedo × (1 − T) で、albedo = 1 なら ambient に戻る
withHelp(
  heightFog.addBinding(toggles, 'skyAttenuation', { label: 'sky attenuation' }),
  'サーフェスの環境光 (空の光) に空方向の透過率 T をかける: ambient × T',
).on('change', applyToggles)
withHelp(
  heightFog.addBinding(toggles, 'skyInscatterAmbient', { label: 'sky inscatter ambient' }),
  '空の光が高さフォグで散乱してサーフェスに届く分を環境光に足す: ambient × albedo × (1 − T)',
).on('change', applyToggles)
// 太陽光にフォグを効かせる 3 つ。エネルギーの帳尻を合わせるなら 3 つとも入れる
withHelp(
  heightFog.addBinding(toggles, 'sunAttenuation', { label: 'sun attenuation' }),
  'サーフェスに届く太陽光に太陽方向の透過率をかける',
).on('change', applyToggles)
withHelp(
  heightFog.addBinding(toggles, 'sunInscatter', { label: 'sun inscatter' }),
  '太陽光の内散乱を視線 (カメラ) に足す。sun attenuation が入っていればフォグの中で深さに応じて減衰する',
).on('change', applyToggles)
withHelp(
  heightFog.addBinding(toggles, 'sunInscatterAmbient', { label: 'sun inscatter ambient' }),
  '太陽光の内散乱をサーフェスの環境光に足す (空へ向かう代表方向で積分)',
).on('change', applyToggles)
withHelp(
  heightFog.addBinding(toggles, 'sunInscatterShadow', { label: 'sun inscatter shadow' }),
  'sun inscatter をレイマーチして柱の影を入れる (光芒)。sun inscatter のときだけ効く。1 ピクセルあたり最大 32 本の影のレイを飛ばすので重い',
).on('change', applyToggles)
// 太陽光の散乱の向きの偏り。sun inscatter の 3 つ全部に同じ係数で効く
withHelp(
  heightFog.addBinding(renderer, 'phaseG', { label: 'phase g', min: -0.9, max: 0.9, step: 0.01 }),
  '太陽光の散乱の Henyey-Greenstein の g。0 で等方、正で前方散乱 (太陽の周りのフォグが明るく、反対側が暗い)、負で後方散乱',
)
withHelp(
  heightFog.addBinding(toggles, 'emissionAmbient', { label: 'emission ambient' }),
  '高さフォグの発光をサーフェスの環境光に足す: emission × (1 − T)',
).on('change', applyToggles)

// 光源は色と向きだけ
const lights = pane.addFolder({ title: 'Lights', expanded: true })
folderHelp(lights, '光源。環境光は全方向から同じ色、太陽は平行光源')
bound.addControls(lights, [controlPresets.ambient, controlPresets.lightColor, controlPresets.sunIntensity])
withHelp(
  lights.addBinding(renderer, 'sunAzimuth', { label: 'sun azimuth', min: -180, max: 180, step: 1 }),
  '太陽の方位 (度)。0 でカメラの正面 (+z)。既定はカメラの後ろ',
)
withHelp(
  lights.addBinding(renderer, 'sunElevation', { label: 'sun elevation', min: MIN_SUN_ELEVATION, max: 90, step: 1 }),
  '太陽の仰角 (度)。下限 5 度 (0 だと太陽の透過率が発散する)',
)

// 消散係数に 3D ノイズをかける (Pickles Note の Noise)。視線の透過率にだけ効く
const noise = pane.addFolder({ title: 'Noise', expanded: true })
folderHelp(noise, 'フォグ (距離 + 高さ) の消散係数に 3D ノイズをかける。視線の透過率にだけ効き、太陽や環境光の計算は閉じた式のまま')
noise.addBinding(renderer, 'noise', { label: 'enabled' })
withHelp(noise.addBinding(renderer, 'noiseScale', { label: 'scale', min: 0.02, max: 3, step: 0.01 }), 'ノイズの空間周波数。大きいほど細かい')
withHelp(noise.addBinding(renderer, 'noiseMin', { label: 'min', min: 0, max: 2, step: 0.01 }), '消散係数にかける倍率の下限。倍率 = mix(min, max, ノイズ)')
withHelp(noise.addBinding(renderer, 'noiseMax', { label: 'max', min: 0, max: 2, step: 0.01 }), '消散係数にかける倍率の上限。倍率 = mix(min, max, ノイズ)')
withHelp(noise.addBinding(renderer, 'noiseSpeed', { label: 'speed', min: 0, max: 5, step: 0.1 }), 'ノイズが上向きに流れる速さ')

const scene = pane.addFolder({ title: 'Scene', expanded: true })
scene.addBinding(renderer, 'colorful', { label: 'colorful cubes' })
scene.addBinding(renderer, 'pillarHalfWidth', { label: 'cube half width', min: 0.1, max: 3.5, step: 0.05 })
scene.addBinding(renderer, 'pillarHeight', { label: 'cube height', min: 0.5, max: 40, step: 0.5 })

const cam = pane.addFolder({ title: 'Camera', expanded: true })
// position は配列なので、編集用オブジェクトを挟んで書き戻す。z は進み続けるだけなので出さない
const pos = { x: camera.position[0], y: camera.position[1] }
const posBindings = [
  cam.addBinding(pos, 'x', { min: -20, max: 20, step: 0.1 }).on('change', (ev) => {
    camera.position[0] = ev.value
  }),
  cam.addBinding(pos, 'y', { min: 0.5, max: 40, step: 0.1 }).on('change', (ev) => {
    camera.position[1] = ev.value
  }),
]
// y はホイールでも変わるので表示を追従させる
window.setInterval(() => {
  pos.x = camera.position[0]
  pos.y = camera.position[1]
  posBindings.forEach((b) => b.refresh())
}, 250)
cam.addBinding(camera, 'speed', { min: 0, max: 20, step: 0.1 })
cam.addBinding(camera, 'yaw', { min: -3.14, max: 3.14, step: 0.01 })
cam.addBinding(camera, 'fov', { min: 20, max: 110, step: 1 })
cam.addBinding(camera, 'pitch', { min: -1.4, max: 1.4, step: 0.01 })

// Reset は Camera も含めて全部を既定に戻す (resolution は除く)
withHelp(topPane.addButton({ title: 'Reset' }), 'Camera も含めて全部を既定に戻す (resolution は除く)').on('click', () => {
  presetState.preset = 'plain'
  applyPreset(presets.plain)
  renderer.colorful = false
  renderer.pillarHalfWidth = 0.7
  renderer.pillarHeight = 12
  renderer.sunAzimuth = DEFAULT_SUN_AZIMUTH
  renderer.sunElevation = DEFAULT_SUN_ELEVATION
  renderer.phaseG = 0
  renderer.fogMixMode = 0
  renderer.noise = false
  renderer.noiseScale = DEFAULT_NOISE.scale
  renderer.noiseMin = DEFAULT_NOISE.min
  renderer.noiseMax = DEFAULT_NOISE.max
  renderer.noiseSpeed = DEFAULT_NOISE.speed
  const c = defaultCamera()
  camera.position[0] = c.position[0]
  camera.position[1] = c.position[1]
  camera.yaw = c.yaw
  camera.pitch = c.pitch
  camera.speed = c.speed
  camera.fov = c.fov
  pos.x = c.position[0]
  pos.y = c.position[1]
  refreshAll()
})

infoEl.innerHTML = `
  <h1>Height Fog Playground</h1>
  <p><a href="./">トップ</a></p>
`
