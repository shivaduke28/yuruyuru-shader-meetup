import { fragmentSource, vertexSource } from './shader'
import type { Camera, FogParams } from './params'

const compile = (gl: WebGL2RenderingContext, type: number, src: string) => {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('createShader failed')
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader compile error:\n${log}`)
  }
  return shader
}

// ワールドは xz 方向にこの周期で繰り返す (fog.frag の CELL * PERIOD_CELLS)。
// 進み続ける z をこの範囲に巻き戻し、座標が大きくなって float の精度が落ちるのを防ぐ
const WORLD_PERIOD = 8 * 64

const uniformNames = [
  'u_resolution',
  'u_time',
  'u_cameraPosition',
  'u_cameraBasis',
  'u_density',
  'u_falloff',
  'u_baseHeight',
  'u_uniformDensity',
  'u_ambient',
  'u_albedo',
  'u_uniformAlbedo',
  'u_emission',
  'u_colorful',
  'u_pillarHalfWidth',
  'u_pillarHeight',
  'u_lightColor',
  'u_lightAttenuation',
  'u_sunScatter',
  'u_ambientFog',
] as const
type UniformName = (typeof uniformNames)[number]

export type FogRenderer = {
  canvas: HTMLCanvasElement
  params: FogParams
  camera: Camera
  /** 描画解像度の倍率 (1 = CSS ピクセル × devicePixelRatio) */
  resolutionScale: number
  /** 柱の色をセルごとにランダムな色相にする */
  colorful: boolean
  /** 柱の半分の幅。セル (8) に収まるよう 3.5 以下 */
  pillarHalfWidth: number
  /** 柱の高さ */
  pillarHeight: number
  /** 平行光源を高さフォグで減衰させる */
  lightAttenuation: boolean
  /** 太陽光の単散乱をフォグの内散乱に足す */
  sunScatter: boolean
  /** サーフェスの環境光にフォグを単散乱で適用する */
  ambientFog: boolean
  start(): void
  stop(): void
  dispose(): void
}

export const createFogRenderer = (
  canvas: HTMLCanvasElement,
  params: FogParams,
  camera: Camera,
): FogRenderer => {
  const gl = canvas.getContext('webgl2', { antialias: false })
  if (!gl) throw new Error('WebGL2 is not available')

  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link error:\n${gl.getProgramInfoLog(program)}`)
  }

  const loc = {} as Record<UniformName, WebGLUniformLocation | null>
  for (const name of uniformNames) loc[name] = gl.getUniformLocation(program, name)

  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const vbo = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const basis = new Float32Array(9)
  const camPos = new Float32Array(3)

  const updateCamera = () => {
    camPos.set(camera.position)
    const cp = Math.cos(camera.pitch)
    const sp = Math.sin(camera.pitch)
    const cy = Math.cos(camera.yaw)
    const sy = Math.sin(camera.yaw)
    // forward: yaw=0 で +z
    const fx = cp * sy
    const fy = sp
    const fz = cp * cy
    // right = normalize(cross(forward, worldUp)) = (-fz, 0, fx) / |..|
    const rl = Math.hypot(fz, fx) || 1
    const rx = -fz / rl
    const ry = 0
    const rz = fx / rl
    // up = cross(right, forward)
    const ux = ry * fz - rz * fy
    const uy = rz * fx - rx * fz
    const uz = rx * fy - ry * fx
    const zoom = 1 / Math.tan((camera.fov * Math.PI) / 360)
    basis.set([rx, ry, rz, ux, uy, uz, fx * zoom, fy * zoom, fz * zoom])
  }

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * renderer.resolutionScale
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
  }

  let raf = 0
  let running = false
  let last = performance.now()
  const start = performance.now()

  const frame = (now: number) => {
    if (!running) return
    const dt = (now - last) / 1000
    last = now
    camera.position[2] += camera.speed * dt
    camera.position[2] = ((camera.position[2] % WORLD_PERIOD) + WORLD_PERIOD) % WORLD_PERIOD

    resize()
    updateCamera()
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.uniform2f(loc.u_resolution, canvas.width, canvas.height)
    gl.uniform1f(loc.u_time, (now - start) / 1000)
    gl.uniform3fv(loc.u_cameraPosition, camPos)
    gl.uniformMatrix3fv(loc.u_cameraBasis, false, basis)
    gl.uniform3fv(loc.u_density, params.density)
    gl.uniform3fv(loc.u_falloff, params.falloff)
    gl.uniform3fv(loc.u_baseHeight, params.baseHeight)
    gl.uniform3fv(loc.u_uniformDensity, params.uniformDensity)
    gl.uniform3fv(loc.u_ambient, params.ambient)
    gl.uniform3fv(loc.u_albedo, params.albedo)
    gl.uniform3fv(loc.u_uniformAlbedo, params.uniformAlbedo)
    gl.uniform3fv(loc.u_emission, params.emission)
    gl.uniform1i(loc.u_colorful, renderer.colorful ? 1 : 0)
    gl.uniform1f(loc.u_pillarHalfWidth, renderer.pillarHalfWidth)
    gl.uniform1f(loc.u_pillarHeight, renderer.pillarHeight)
    gl.uniform3fv(loc.u_lightColor, params.lightColor)
    gl.uniform1i(loc.u_lightAttenuation, renderer.lightAttenuation ? 1 : 0)
    gl.uniform1i(loc.u_sunScatter, renderer.sunScatter ? 1 : 0)
    gl.uniform1i(loc.u_ambientFog, renderer.ambientFog ? 1 : 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    raf = requestAnimationFrame(frame)
  }

  // ドラッグで視線回転、ホイールで高さ
  let dragging = false
  let lastX = 0
  let lastY = 0
  const onDown = (e: PointerEvent) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    camera.yaw += dx * 0.004
    camera.pitch = Math.min(1.4, Math.max(-1.4, camera.pitch - dy * 0.004))
  }
  const onUp = () => {
    dragging = false
  }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    camera.position[1] = Math.min(40, Math.max(0.5, camera.position[1] + e.deltaY * 0.01))
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  const renderer: FogRenderer = {
    canvas,
    params,
    camera,
    resolutionScale: 1,
    colorful: false,
    pillarHalfWidth: 0.7,
    pillarHeight: 12,
    lightAttenuation: false,
    sunScatter: false,
    ambientFog: false,
    start() {
      if (running) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    },
    stop() {
      running = false
      cancelAnimationFrame(raf)
    },
    dispose() {
      this.stop()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
      gl.deleteProgram(program)
    },
  }
  return renderer
}
