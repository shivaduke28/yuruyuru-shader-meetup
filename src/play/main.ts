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

const presets: Record<string, Partial<FogParams>> = {
  plain: defaultFogParams(),
  rgb: {
    density: [0.25, 0.35, 0.55],
    falloff: [0.35, 0.55, 0.9],
    baseHeight: [0, 1.5, 3],
  },
  uniform: { density: [0, 0, 0], uniformDensity: [0.02, 0.02, 0.02] },
}

const bound = createFogPane(
  paneEl,
  params,
  [
    controlPresets.densityRGB,
    controlPresets.falloffRGB,
    controlPresets.baseHeightRGB,
    controlPresets.uniformRGB,
    controlPresets.fogColor,
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
    assignParams(params, { ...defaultFogParams(), ...presets[ev.value] })
    bound.refresh()
  })

const cam = pane.addFolder({ title: 'Camera', expanded: false })
// position は配列なので、編集用オブジェクトを挟んで書き戻す。z は進み続けるので表示を定期的に追従させる
const pos = { x: camera.position[0], y: camera.position[1], z: camera.position[2] }
const posBindings = [
  cam.addBinding(pos, 'x', { min: -20, max: 20, step: 0.1 }).on('change', (ev) => {
    camera.position[0] = ev.value
  }),
  cam.addBinding(pos, 'y', { min: 0.5, max: 40, step: 0.1 }).on('change', (ev) => {
    camera.position[1] = ev.value
  }),
  cam.addBinding(pos, 'z', { step: 0.1 }).on('change', (ev) => {
    camera.position[2] = ev.value
  }),
]
window.setInterval(() => {
  pos.x = camera.position[0]
  pos.y = camera.position[1]
  pos.z = camera.position[2]
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
  pane.refresh()
  bound.refresh()
})

infoEl.innerHTML = `
  <h1>Height Fog Playground</h1>
  <p><a href="./">スライドに戻る</a></p>
`
