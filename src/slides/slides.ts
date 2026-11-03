import hljs from 'highlight.js/lib/core'
import glsl from 'highlight.js/lib/languages/glsl'
import type { FogParams } from '../fog/params'
import { controlPresets, type ControlSpec } from '../fog/controls'

hljs.registerLanguage('glsl', glsl)

export type RandomRange = { min: number; max: number }

export type Slide = {
  id: string
  /** demo: 左にデモ、右にコードとスライダー。text: 見出しと本文だけ */
  layout: 'demo' | 'text'
  title: string
  /** 右カラム（コードなど） */
  side?: string
  /** 下の本文 */
  body?: string
  params?: Partial<FogParams>
  controls?: ControlSpec[]
  /** 指定すると intervalMs ごとに各チャンネルの値をランダムに選び直す */
  randomize?: {
    intervalMs: number
    density: RandomRange
    falloff: RandomRange
    baseHeight: RandomRange
    albedo?: RandomRange
  }
}

const plain: Partial<FogParams> = {
  density: [0.35, 0.35, 0.35],
  falloff: [0.5, 0.5, 0.5],
  baseHeight: [0, 0, 0],
  uniformDensity: [0, 0, 0],
  ambient: [0.4, 0.4, 0.4],
  albedo: [1, 1, 1],
  emission: [0, 0, 0],
}

const rgb: Partial<FogParams> = {
  density: [0.25, 0.35, 0.55],
  falloff: [0.35, 0.55, 0.9],
  baseHeight: [0, 1.5, 3],
  uniformDensity: [0, 0, 0],
  ambient: [0.4, 0.4, 0.4],
  albedo: [1, 1, 1],
  emission: [0, 0, 0],
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

const uniformControls = [controlPresets.uniform, controlPresets.ambient, controlPresets.albedo]
const heightControls = [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight]

const uniformVariation = (id: string, fog: number, color: [number, number, number]): Slide => ({
  id,
  layout: 'demo',
  title: '距離フォグ',
  params: { ...uniform, uniformDensity: [fog, fog, fog], ambient: color },
  controls: uniformControls,
  side: code(`float fog = ${fog};
vec3 fogColor = vec3(${color.join(', ')});`),
})

const heightVariation = (id: string, a: number, f: number, h: number, body: string): Slide => ({
  id,
  layout: 'demo',
  title: '指数関数高さフォグ',
  params: { ...plain, density: [a, a, a], falloff: [f, f, f], baseHeight: [h, h, h] },
  controls: heightControls,
  side: code(`float a = ${a};
float f = ${f};
float h = ${h};`),
  body: `<p>${body}</p>`,
})

export const slides: Slide[] = [
  {
    id: 'title',
    layout: 'text',
    title: '指数関数高さフォグ',
    body: '<p>shivaduke / ゆるゆるシェーダー交流会 #2</p>',
    params: rgb,
  },
  {
    id: 'no-fog',
    layout: 'demo',
    title: 'フォグなし',
    params: none,
  },
  {
    id: 'uniform-fog',
    layout: 'demo',
    title: '距離フォグ',
    params: uniform,
    controls: uniformControls,
    side: code(`float t = exp(-fog * dist);
color = mix(fogColor, color, t);`),
  },
  uniformVariation('uniform-fog-thin', 0.005, [0.4, 0.4, 0.4]),
  uniformVariation('uniform-fog-thick', 0.05, [0.4, 0.4, 0.4]),
  uniformVariation('uniform-fog-color', 0.02, [0.1, 0.1, 0.15]),
  {
    id: 'assumptions',
    layout: 'text',
    title: '距離フォグの前提',
    body: `
      <p>次の仮定のもとでは物理ベースな計算になっている</p>
      <ul>
        <li>フォグの濃さがどこでも同じ</li>
        <li>フォグを照らす光がどこでも同じ</li>
        <li>光がどの方向にも同じように散る</li>
      </ul>`,
    params: uniform,
  },
  {
    id: 'height-fog',
    layout: 'demo',
    title: '指数関数高さフォグ',
    params: plain,
    controls: heightControls,
    side: code('float fog = a * exp(-f * (pos.y - h));'),
    body: `
      <ul>
        <li>a: h での濃さ</li>
        <li>f: 減衰</li>
        <li>h: 基準の高さ</li>
      </ul>`,
  },
  heightVariation('height-fog-a', 1.0, 0.5, 0, 'a を大きくすると全体が濃くなる'),
  heightVariation('height-fog-f-small', 0.35, 0.25, 0, 'f を小さくすると減衰がゆっくりになり、上の方まで霧が残る'),
  heightVariation('height-fog-f-large', 0.35, 1.5, 0, 'f を大きくすると減衰が速くなり、床の近くだけに霧が溜まる'),
  {
    id: 'formula',
    layout: 'demo',
    title: 'シェーダーコード',
    params: plain,
    controls: heightControls,
    side: code(`float fv = f * rayDir.y;
float i = fv == 0.0 ? dist : (1.0 - exp(-fv * dist)) / fv;
float fog = a * exp(-f * (camPos.y - h)) * i;
color = mix(fogColor, color, exp(-fog));`),
  },
  {
    id: 'rgb',
    layout: 'demo',
    title: 'a, f, h を RGB ごとに変える',
    params: rgb,
    controls: [
      controlPresets.densityRGB,
      controlPresets.falloffRGB,
      controlPresets.baseHeightRGB,
      controlPresets.albedo,
    ],
    randomize: {
      intervalMs: 1000,
      density: { min: 0.1, max: 0.8 },
      falloff: { min: 0.2, max: 1.2 },
      baseHeight: { min: 0, max: 4 },
      albedo: { min: 0.2, max: 1 },
    },
    body: '<p>float を vec3 にするだけ</p>',
  },
  {
    id: 'emission',
    layout: 'demo',
    title: '発光',
    params: { ...rgb, emission: [0.3, 0.15, 0.06] },
    controls: [controlPresets.ambient, controlPresets.albedo, controlPresets.emission],
    side: code('color = mix(fogColor + emission, color, exp(-fog));'),
    body: '<p>散乱で入ってくる光とは別に、フォグ自体が発する光を足す</p>',
  },
  {
    id: 'extras',
    layout: 'text',
    title: 'その先',
    body: `
      <ul>
        <li>ノイズを乗せる</li>
        <li>点光源の散乱</li>
        <li>位相関数</li>
      </ul>`,
    params: rgb,
  },
  {
    id: 'end',
    layout: 'text',
    title: 'おわり',
    body: `
      <p><a href="./play.html">Playground</a></p>
      <p>
        <a href="https://blog.shivaduke28.net/entries/2026-08-08-pickles-height-fog/" target="_blank" rel="noreferrer">ブログ</a> ·
        <a href="https://gist.github.com/shivaduke28/27e873db5cbc0cd4ba3e0c4c7fc455d8" target="_blank" rel="noreferrer">Pickles Note</a> ·
        <a href="https://github.com/shivaduke28/yuruyuru-shader-meetup" target="_blank" rel="noreferrer">ソース</a>
      </p>`,
    params: rgb,
  },
]
