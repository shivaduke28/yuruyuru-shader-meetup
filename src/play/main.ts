import '../style.css'
import { Pane } from 'tweakpane'
import { createFogRenderer, DEFAULT_SUN_AZIMUTH, DEFAULT_SUN_ELEVATION, MIN_SUN_ELEVATION } from '../fog/renderer'
import { assignParams, defaultCamera, defaultFogParams, type FogParams } from '../fog/params'
import { controlPresets, createFogPane } from '../fog/controls'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const paneTopEl = document.getElementById('pane-top') as HTMLElement
const paneScrollEl = document.getElementById('pane-scroll') as HTMLElement
const infoEl = document.getElementById('info') as HTMLElement

const params = defaultFogParams()
const camera = defaultCamera()
const renderer = createFogRenderer(canvas, params, camera)
renderer.start()

// トグルはスライドと同じ現象ごと: 環境光にフォグ (単散乱)、太陽光にフォグ (減衰 + 内散乱をまとめて)、
// サーフェスに発光、太陽の内散乱に柱の影
type Toggles = { fogAmbient: boolean; fogSun: boolean; emissionAmbient: boolean; sunShadow: boolean }
const defaultToggles = (): Toggles => ({ fogAmbient: false, fogSun: false, emissionAmbient: false, sunShadow: false })

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
  // 水: 赤から順に吸われ、散乱は青寄り、環境光は暗めの青
  water: {
    params: {
      density: [0, 0, 0],
      uniformDensity: [0.16, 0.08, 0.04],
      uniformAlbedo: [0.1, 0.4, 0.7],
      ambient: [0.2, 0.3, 0.45],
    },
  },
  // 地面に溜まるガス: 薄い層に濃く、黄緑に散乱、太陽はフォグの中で減衰して散乱、奥がうっすら光る
  gas: {
    params: {
      density: [1.5, 1.5, 1.5],
      falloff: [0.7, 0.7, 0.7],
      baseHeight: [0, 0, 0],
      uniformDensity: [0, 0, 0],
      albedo: [0.55, 0.8, 0.3],
      ambient: [0.3, 0.33, 0.3],
      lightColor: [1.0, 0.9, 0.75],
      emission: [0.0, 0.04, 0.0],
    },
    toggles: { fogSun: true },
  },
}

const toggles = defaultToggles()
const applyToggles = () => {
  renderer.ambientFog = toggles.fogAmbient
  renderer.lightAttenuation = renderer.sunScatter = toggles.fogSun
  renderer.emissionAmbient = toggles.emissionAmbient
  renderer.volumetricShadow = toggles.sunShadow
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
topPane
  .addBinding(presetState, 'preset', {
    label: 'preset',
    options: Object.fromEntries(Object.keys(presets).map((k) => [k, k])),
  })
  .on('change', (ev) => {
    applyPreset(presets[ev.value])
    refreshAll()
  })

// フォルダはスライドの流れに揃える: 距離フォグ → 高さフォグ → 光 → 追加要素 → 舞台
const distanceFog = pane.addFolder({ title: 'Distance Fog', expanded: true })
bound.addControls(distanceFog, [controlPresets.uniformRGB, controlPresets.uniformAlbedo, controlPresets.uniformEmission])

const heightFog = pane.addFolder({ title: 'Height Fog', expanded: true })
bound.addControls(heightFog, [
  controlPresets.densityRGB,
  controlPresets.falloffRGB,
  controlPresets.baseHeightRGB,
  controlPresets.albedo,
  controlPresets.emission,
])

// 環境光と太陽はどちらのフォグにも共通
const ambientLight = pane.addFolder({ title: 'Ambient Light', expanded: true })
bound.addControls(ambientLight, [{ ...controlPresets.ambient, label: 'color' }])
ambientLight.addBinding(toggles, 'fogAmbient', { label: 'fog on ambient' }).on('change', applyToggles)
ambientLight.addBinding(toggles, 'emissionAmbient', { label: 'emission on surface' }).on('change', applyToggles)

const sunLight = pane.addFolder({ title: 'Sun Light', expanded: true })
bound.addControls(sunLight, [{ ...controlPresets.lightColor, label: 'color' }])
sunLight.addBinding(renderer, 'sunAzimuth', { label: 'azimuth', min: -180, max: 180, step: 1 })
sunLight.addBinding(renderer, 'sunElevation', { label: 'elevation', min: MIN_SUN_ELEVATION, max: 90, step: 1 })
sunLight.addBinding(toggles, 'fogSun', { label: 'fog on sun' }).on('change', applyToggles)
// fog on sun がオンのときだけ効く。1 ピクセルあたり最大 32 本の影のレイを飛ばすので重い
sunLight.addBinding(toggles, 'sunShadow', { label: 'sun shadow in fog' }).on('change', applyToggles)

// 消散係数に 3D ノイズをかける (Pickles Note の Noise)。視線の透過率にだけ効く
const noise = pane.addFolder({ title: 'Noise', expanded: true })
noise.addBinding(renderer, 'noise', { label: 'enabled' })
noise.addBinding(renderer, 'noiseScale', { label: 'scale', min: 0.02, max: 3, step: 0.01 })
noise.addBinding(renderer, 'noiseMin', { label: 'min', min: 0, max: 2, step: 0.01 })
noise.addBinding(renderer, 'noiseMax', { label: 'max', min: 0, max: 2, step: 0.01 })
noise.addBinding(renderer, 'noiseSpeed', { label: 'speed', min: 0, max: 5, step: 0.1 })

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
cam.addBinding(renderer, 'resolutionScale', { min: 0.25, max: 1, step: 0.05, label: 'resolution' })

// Reset は Camera も含めて全部を既定に戻す
topPane.addButton({ title: 'Reset' }).on('click', () => {
  presetState.preset = 'plain'
  applyPreset(presets.plain)
  renderer.colorful = false
  renderer.pillarHalfWidth = 0.7
  renderer.pillarHeight = 12
  renderer.sunAzimuth = DEFAULT_SUN_AZIMUTH
  renderer.sunElevation = DEFAULT_SUN_ELEVATION
  renderer.noise = false
  renderer.noiseScale = 0.15
  renderer.noiseMin = 0
  renderer.noiseMax = 1
  renderer.noiseSpeed = 0.5
  renderer.resolutionScale = 1
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
