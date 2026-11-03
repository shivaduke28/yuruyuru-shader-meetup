import '../style.css'
import { createFogRenderer } from '../fog/renderer'
import { assignParams, defaultCamera, defaultFogParams, type FogParams } from '../fog/params'
import { controlPresets, createFogPane } from '../fog/controls'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const paneEl = document.getElementById('pane') as HTMLElement
const infoEl = document.getElementById('info') as HTMLElement

const params = defaultFogParams()
const camera = defaultCamera()
const renderer = createFogRenderer(canvas, params, camera)
renderer.start()

type Preset = { params: Partial<FogParams>; lightAttenuation?: boolean }

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
      uniformDensity: [0.08, 0.04, 0.02],
      albedo: [0.1, 0.4, 0.7],
      ambient: [0.2, 0.3, 0.45],
    },
  },
  // 地面に溜まるガス: 薄い層に濃く、黄緑に散乱、太陽は層の中で減衰、層の奥がうっすら光る
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
    lightAttenuation: true,
  },
}

const bound = createFogPane(
  paneEl,
  params,
  [
    controlPresets.densityRGB,
    controlPresets.falloffRGB,
    controlPresets.baseHeightRGB,
    controlPresets.uniformRGB,
    controlPresets.albedo,
    controlPresets.emission,
  ],
  'Height Fog',
)
const pane = bound.pane

const presetState = { preset: 'plain' }
pane
  .addBinding(presetState, 'preset', {
    label: 'preset',
    options: Object.fromEntries(Object.keys(presets).map((k) => [k, k])),
    index: 0,
  })
  .on('change', (ev) => {
    const preset = presets[ev.value]
    assignParams(params, { ...defaultFogParams(), ...preset.params })
    renderer.lightAttenuation = preset.lightAttenuation ?? false
    bound.refresh()
    pane.refresh()
  })

pane.addBinding(renderer, 'colorful', { label: 'colorful cubes' })

const light = pane.addFolder({ title: 'Light', expanded: true })
bound.addControls(light, [controlPresets.ambient, controlPresets.lightColor])
light.addBinding(renderer, 'lightAttenuation', { label: 'height fog attenuation' })

const cam = pane.addFolder({ title: 'Camera', expanded: false })
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

pane.addButton({ title: 'Reset' }).on('click', () => {
  assignParams(params, defaultFogParams())
  presetState.preset = 'plain'
  renderer.lightAttenuation = false
  pane.refresh()
  bound.refresh()
})

infoEl.innerHTML = `
  <h1>Height Fog Playground</h1>
  <p><a href="./">トップ</a></p>
`
