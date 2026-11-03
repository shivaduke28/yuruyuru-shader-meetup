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

const uniformControls = [controlPresets.uniform, controlPresets.fogColor]
const heightControls = [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight]

const uniformVariation = (id: string, fog: number, color: [number, number, number]): Slide => ({
  id,
  layout: 'demo',
  title: 'いつものフォグ',
  params: { ...uniform, uniformDensity: [fog, fog, fog], fogColor: color },
  controls: uniformControls,
  side: code(`float fog = ${fog};
vec3 fogColor = vec3(${color.join(', ')});`),
})

const heightVariation = (id: string, a: number, f: number, h: number): Slide => ({
  id,
  layout: 'demo',
  title: '指数関数高さフォグ',
  params: { ...plain, density: [a, a, a], falloff: [f, f, f], baseHeight: [h, h, h] },
  controls: heightControls,
  side: code(`float a = ${a};
float f = ${f};
float h = ${h};`),
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
    title: 'いつものフォグ',
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
    title: 'いつものフォグの前提',
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
        <li>a: 濃さ</li>
        <li>f: 上に行くとどれくらい薄くなるか</li>
        <li>h: 基準の高さ</li>
      </ul>`,
  },
  heightVariation('height-fog-a', 1.0, 0.5, 0),
  heightVariation('height-fog-f-small', 0.35, 0.2, 0),
  heightVariation('height-fog-f-large', 0.35, 1.5, 0),
  {
    id: 'formula',
    layout: 'demo',
    title: 'こうなる',
    params: plain,
    controls: heightControls,
    side: code(`float fv = f * rayDir.y;
float fog = a * exp(-f * (camPos.y - h))
    * (1.0 - exp(-fv * dist)) / fv;
color = mix(fogColor, color, exp(-fog));`),
    body: '<p>fv が 0 に近いときは a * exp(-f * (camPos.y - h)) * dist</p>',
  },
  {
    id: 'rgb',
    layout: 'demo',
    title: 'a, f, h を RGB ごとに変える',
    params: rgb,
    // 右カラムの予算 (3 フォルダまで) に収めるため fog color は出さない
    controls: [controlPresets.densityRGB, controlPresets.falloffRGB, controlPresets.baseHeightRGB],
    randomize: {
      intervalMs: 1000,
      density: { min: 0.1, max: 0.8 },
      falloff: { min: 0.2, max: 1.2 },
      baseHeight: { min: 0, max: 4 },
    },
    body: '<p>float を vec3 にするだけ</p>',
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
