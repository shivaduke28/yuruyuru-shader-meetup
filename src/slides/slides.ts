import hljs from 'highlight.js/lib/core'
import glsl from 'highlight.js/lib/languages/glsl'
import type { FogParams } from '../fog/params'
import { controlPresets, type ControlSpec } from '../fog/controls'

hljs.registerLanguage('glsl', glsl)

export type RandomRange = { min: number; max: number }

export type Slide = {
  id: string
  layout?: 'left' | 'center' | 'bottom'
  html: string
  params?: Partial<FogParams>
  controls?: ControlSpec[]
  /** 指定すると intervalMs ごとに各チャンネルの値をランダムに選び直す */
  randomize?: {
    intervalMs: number
    density: RandomRange
    falloff: RandomRange
    baseHeight: RandomRange
  }
}

const plain: Partial<FogParams> = {
  density: [0.35, 0.35, 0.35],
  falloff: [0.5, 0.5, 0.5],
  baseHeight: [0, 0, 0],
  uniformDensity: [0, 0, 0],
  fogColor: [0.4, 0.4, 0.4],
}

const rgb: Partial<FogParams> = {
  density: [0.25, 0.35, 0.55],
  falloff: [0.35, 0.55, 0.9],
  baseHeight: [0, 1.5, 3],
  uniformDensity: [0, 0, 0],
  fogColor: [0.4, 0.4, 0.4],
}

const uniform: Partial<FogParams> = {
  ...plain,
  density: [0, 0, 0],
  uniformDensity: [0.02, 0.02, 0.02],
}

const none: Partial<FogParams> = {
  ...plain,
  density: [0, 0, 0],
  uniformDensity: [0, 0, 0],
}

const code = (s: string) =>
  `<pre><code class="hljs language-glsl">${hljs.highlight(s, { language: 'glsl' }).value}</code></pre>`

export const slides: Slide[] = [
  {
    id: 'title',
    layout: 'center',
    params: rgb,
    html: `
      <div class="panel">
        <h1>指数関数高さフォグ</h1>
        <p class="sub">shivaduke / ゆるゆるシェーダー交流会 #2</p>
      </div>`,
  },
  {
    id: 'no-fog',
    layout: 'bottom',
    params: none,
    html: `
      <div class="panel">
        <h2>フォグなし</h2>
      </div>`,
  },
  {
    id: 'uniform-fog',
    layout: 'bottom',
    params: uniform,
    controls: [controlPresets.uniform, controlPresets.fogColor],
    html: `
      <div class="panel">
        <h2>いつものフォグ</h2>
        ${code('color = mix(fogColor, color, exp(-fog * distance));')}
      </div>`,
  },
  {
    id: 'uniform-fog-thin',
    layout: 'bottom',
    params: { ...uniform, uniformDensity: [0.005, 0.005, 0.005] },
    controls: [controlPresets.uniform, controlPresets.fogColor],
    html: `
      <div class="panel">
        <h2>いつものフォグ</h2>
        ${code(`float fog = 0.005;
vec3 fogColor = vec3(0.4, 0.4, 0.4);`)}
      </div>`,
  },
  {
    id: 'uniform-fog-thick',
    layout: 'bottom',
    params: { ...uniform, uniformDensity: [0.05, 0.05, 0.05] },
    controls: [controlPresets.uniform, controlPresets.fogColor],
    html: `
      <div class="panel">
        <h2>いつものフォグ</h2>
        ${code(`float fog = 0.05;
vec3 fogColor = vec3(0.4, 0.4, 0.4);`)}
      </div>`,
  },
  {
    id: 'uniform-fog-color',
    layout: 'bottom',
    params: { ...uniform, uniformDensity: [0.02, 0.02, 0.02], fogColor: [0.1, 0.1, 0.15] },
    controls: [controlPresets.uniform, controlPresets.fogColor],
    html: `
      <div class="panel">
        <h2>いつものフォグ</h2>
        ${code(`float fog = 0.02;
vec3 fogColor = vec3(0.1, 0.1, 0.15);`)}
      </div>`,
  },
  {
    id: 'assumptions',
    layout: 'bottom',
    params: uniform,
    controls: [controlPresets.uniform],
    html: `
      <div class="panel">
        <h2>いつものフォグの前提</h2>
        <p>いつものフォグは、次の仮定のもとでは物理ベースな計算になっている</p>
        <ul>
          <li>フォグの濃さがどこでも同じ</li>
          <li>フォグを照らす光がどこでも同じ</li>
          <li>光がどの方向にも同じように散る</li>
        </ul>
      </div>`,
  },
  {
    id: 'height-fog',
    layout: 'bottom',
    params: plain,
    controls: [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
    html: `
      <div class="panel">
        <h2>指数関数高さフォグ</h2>
        <p>フォグの濃さを高さで変える</p>
        ${code('float fog = a * exp(-f * (pos.y - h));')}
        <ul>
          <li>a: 濃さ</li>
          <li>f: 上に行くとどれくらい薄くなるか</li>
          <li>h: 基準の高さ</li>
        </ul>
      </div>`,
  },
  {
    id: 'height-fog-a',
    layout: 'bottom',
    params: { ...plain, density: [1.0, 1.0, 1.0], falloff: [0.5, 0.5, 0.5], baseHeight: [0.0, 0.0, 0.0] },
    controls: [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
    html: `
      <div class="panel">
        <h2>指数関数高さフォグ</h2>
        ${code(`float a = 1.0;
float f = 0.5;
float h = 0.0;`)}
      </div>`,
  },
  {
    id: 'height-fog-f-small',
    layout: 'bottom',
    params: { ...plain, density: [0.35, 0.35, 0.35], falloff: [0.2, 0.2, 0.2], baseHeight: [0.0, 0.0, 0.0] },
    controls: [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
    html: `
      <div class="panel">
        <h2>指数関数高さフォグ</h2>
        ${code(`float a = 0.35;
float f = 0.2;
float h = 0.0;`)}
      </div>`,
  },
  {
    id: 'height-fog-f-large',
    layout: 'bottom',
    params: { ...plain, density: [0.35, 0.35, 0.35], falloff: [1.5, 1.5, 1.5], baseHeight: [0.0, 0.0, 0.0] },
    controls: [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
    html: `
      <div class="panel">
        <h2>指数関数高さフォグ</h2>
        ${code(`float a = 0.35;
float f = 1.5;
float h = 0.0;`)}
      </div>`,
  },
  {
    id: 'formula',
    layout: 'bottom',
    params: plain,
    controls: [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
    html: `
      <div class="panel">
        <h2>こうなる</h2>
        ${code(`float fv = f * rayDir.y;
float fog = a * exp(-f * (cameraPos.y - h)) * (1.0 - exp(-fv * distance)) / fv;
color = mix(fogColor, color, exp(-fog));`)}
        <p class="note">fv が 0 に近いときは a * exp(-f * (cameraPos.y - h)) * distance</p>
      </div>`,
  },
  {
    id: 'rgb',
    layout: 'bottom',
    params: rgb,
    randomize: {
      intervalMs: 1000,
      density: { min: 0.1, max: 0.8 },
      falloff: { min: 0.2, max: 1.2 },
      baseHeight: { min: 0, max: 4 },
    },
    controls: [
      controlPresets.densityRGB,
      controlPresets.falloffRGB,
      controlPresets.baseHeightRGB,
      controlPresets.fogColor,
    ],
    html: `
      <div class="panel">
        <h2>a, f, h を RGB ごとに変える</h2>
        <p>float を vec3 にするだけ</p>
      </div>`,
  },
  {
    id: 'extras',
    layout: 'bottom',
    params: rgb,
    html: `
      <div class="panel">
        <h2>その先</h2>
        <ul>
          <li>ノイズを乗せる</li>
          <li>点光源の散乱</li>
          <li>位相関数</li>
        </ul>
      </div>`,
  },
  {
    id: 'end',
    layout: 'center',
    params: rgb,
    html: `
      <div class="panel">
        <h2>おわり</h2>
        <p class="sub">
          <a href="./play.html">Playground</a><br />
          <a href="https://blog.shivaduke28.net/entries/2026-08-08-pickles-height-fog/" target="_blank" rel="noreferrer">ブログ</a> ·
          <a href="https://gist.github.com/shivaduke28/27e873db5cbc0cd4ba3e0c4c7fc455d8" target="_blank" rel="noreferrer">Pickles Note</a> ·
          <a href="https://github.com/shivaduke28/yuruyuru-shader-meetup" target="_blank" rel="noreferrer">ソース</a>
        </p>
      </div>`,
  },
]
