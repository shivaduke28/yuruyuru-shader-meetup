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
  /** サーフェスの環境光にフォグを単散乱で適用する (renderer.ambientFog)。指定するとトグルも出る。省略時は false でトグルなし */
  fogAmbient?: boolean
  /** 太陽光にフォグを適用する: 面に届く太陽光の減衰と太陽光の内散乱をまとめてオンにする
   *  (renderer.lightAttenuation + renderer.sunScatter)。指定するとトグルも出る */
  fogSun?: boolean
  /** 太陽光の内散乱で柱の影を見る (renderer.volumetricShadow、光芒)。fogSun のときだけ効く。指定するとトグルも出る */
  sunShadow?: boolean
  /** 太陽の向き (度)。省略時は renderer の既定 (カメラの後ろ上からの順光) */
  sun?: { azimuth: number; elevation: number }
  /** スライダー。配列の配列にすると、内側の配列ごとに別のカード (Pane) になる */
  controls?: ControlSpec[] | ControlSpec[][]
  /** 指定すると intervalMs ごとに各チャンネルの値をランダムに選び直す */
  randomize?: {
    intervalMs: number
    density: RandomRange
    falloff: RandomRange
    baseHeight: RandomRange
    albedo?: RandomRange
    ambient?: RandomRange
    emission?: RandomRange
  }
}

// 環境光は暗めのグレー、太陽は暖色。環境光が明るいと日の当たる面が白飛びし、フォグと影の差も消える
const ambient: [number, number, number] = [0.25, 0.25, 0.25]
const lightColor: [number, number, number] = [1.6, 1.45, 1.2]

const plain: Partial<FogParams> = {
  density: [0.8, 0.8, 0.8],
  falloff: [0.5, 0.5, 0.5],
  baseHeight: [1, 1, 1],
  uniformDensity: [0, 0, 0],
  ambient,
  albedo: [1, 1, 1],
  uniformAlbedo: [1, 1, 1],
  emission: [0, 0, 0],
  lightColor,
}

const rgb: Partial<FogParams> = {
  density: [0.25, 0.35, 0.55],
  falloff: [0.35, 0.55, 0.9],
  baseHeight: [0, 1.5, 3],
  uniformDensity: [0, 0, 0],
  ambient,
  albedo: [1, 1, 1],
  uniformAlbedo: [1, 1, 1],
  emission: [0, 0, 0],
  lightColor,
}

const uniform: Partial<FogParams> = {
  ...plain,
  density: [0, 0, 0],
  uniformDensity: [0.05, 0.05, 0.05],
}

const none: Partial<FogParams> = {
  ...plain,
  density: [0, 0, 0],
  uniformDensity: [0, 0, 0],
}

const code = (s: string) =>
  `<pre><code class="hljs language-glsl">${hljs.highlight(s, { language: 'glsl' }).value}</code></pre>`

const uniformControls = [controlPresets.ambient, controlPresets.uniform, controlPresets.uniformAlbedo]
// フォグの形のパラメータと、色のパラメータを別のカードに分ける
const heightControls = [
  [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
  [controlPresets.ambient, controlPresets.albedo],
]

const distanceFogCode = code(`vec3 fogColor = ambient * albedo;
float t = exp(-density * dist);
color = mix(fogColor, color, t);`)

const uniformVariation = (
  id: string,
  fog: number,
  albedo: [number, number, number],
  body: string,
  ambientOverride: [number, number, number] = ambient,
): Slide => ({
  id,
  layout: 'demo',
  title: '距離フォグ',
  params: { ...uniform, uniformDensity: [fog, fog, fog], uniformAlbedo: albedo, ambient: ambientOverride },
  controls: uniformControls,
  side: distanceFogCode,
  body: `<p>${body}</p>`,
})

const heightFogCode = code('float fog = density * exp(-falloff * (pos.y - height));')

// 高さフォグの基準値 (plain) から 1 つだけパラメータを変えたスライド。変えたものと結果を本文で言う
const heightVariation = (
  id: string,
  change: Partial<{ density: number; falloff: number; height: number }>,
  body: string,
): Slide => {
  const density = change.density ?? plain.density![0]
  const falloff = change.falloff ?? plain.falloff![0]
  const height = change.height ?? plain.baseHeight![0]
  return {
    id,
    layout: 'demo',
    title: '指数関数高さフォグ',
    params: { ...plain, density: [density, density, density], falloff: [falloff, falloff, falloff], baseHeight: [height, height, height] },
    controls: heightControls,
    side: heightFogCode,
    body: `<p>${body}</p>`,
  }
}

const assumptionItems = [
  'フォグの濃さがシーン内で均一',
  'フォグを照らす光が全方向から同じ色で当たる',
  '光が全方向に均一に散乱する',
]

/** 距離フォグの前提。highlight に番号を渡すとその行だけ強調する（次に変える仮定を示す） */
const assumptions = (id: string, highlight?: number): Slide => ({
  id,
  layout: 'text',
  title: '距離フォグの前提',
  body: `
      <p>次の仮定のもとでは物理ベースな計算になっている</p>
      <ul>
        ${assumptionItems.map((t, i) => (i === highlight ? `<li class="highlight">${t} ← これを変える！</li>` : `<li>${t}</li>`)).join('\n        ')}
      </ul>`,
  params: uniform,
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
    title: 'レイマーチングでシーンを作る',
    params: none,
    side: code(`float map(vec3 p) {
  vec2 q = mod(p.xz, 8.0) - 4.0; // repetition
  float ground = p.y;
  float pillar = sdBox(vec3(q.x, p.y - 6.0, q.y), vec3(0.7, 6.0, 0.7));
  return min(ground, pillar);
}`),
    body: `
      <ul>
        <li>床の上に高さの同じ柱を並べたシーンをレイマーチで描く</li>
        <li>Repetition で柱を並べると無限遠がガビガビする</li>
      </ul>`,
  },
  {
    id: 'uniform-fog',
    layout: 'demo',
    title: '距離フォグ',
    params: uniform,
    controls: uniformControls,
    side: distanceFogCode,
    body: `
      <ul>
        <li>density: フォグの濃さ（正確には消散係数。単位は 1/長さ）</li>
        <li>albedo: フォグが環境光をどのくらい反射するか</li>
      </ul>`,
  },
  uniformVariation('uniform-fog-thick', 0.15, [1, 1, 1], 'density を大きくすると、フォグが濃くなって近くしか見えない'),
  uniformVariation('uniform-fog-thin', 0.01, [1, 1, 1], 'density を小さくすると、フォグが薄くなって遠くまで見える'),
  uniformVariation('uniform-fog-color', 0.05, [1, 0, 0], 'albedo を変更すると、フォグの色が変わる'),
  uniformVariation('uniform-fog-ambient', 0.05, [1, 1, 1], 'ambient を変更すると、フォグだけでなく空や床の色も変わる', [1, 0, 0]),
  {
    id: 'uniform-fog-rgb',
    layout: 'demo',
    title: 'density を RGB にする',
    // Playground の water プリセット: 赤から順に吸われ、散乱は青寄り、環境光は暗めの青
    params: {
      ...uniform,
      uniformDensity: [0.16, 0.08, 0.04],
      uniformAlbedo: [0.1, 0.4, 0.7],
      ambient: [0.2, 0.3, 0.45],
    },
    controls: [controlPresets.ambient, controlPresets.uniformRGB, controlPresets.uniformAlbedo],
    side: code(`vec3 fogColor = ambient * albedo;
vec3 t = exp(-density * dist); // density を vec3 にするだけ
color = mix(fogColor, color, t);`),
    body: '<p>density を RGB ごとに変えると、距離によって色が変わる。水の中のように赤から順に吸われる</p>',
  },
  assumptions('assumptions'),
  assumptions('assumptions-highlight', 0),
  {
    id: 'height-fog',
    layout: 'demo',
    title: '指数関数高さフォグ',
    params: plain,
    controls: heightControls,
    side: heightFogCode,
    body: `
      <p>低いところほど濃いフォグ</p>
      <ul>
        <li>density: 基準の高さでの濃さ</li>
        <li>falloff: 上に行くほど薄くなる速さ</li>
        <li>height: 基準の高さ</li>
      </ul>`,
  },
  heightVariation('height-fog-density', { density: 0.3 }, 'density を小さくすると、全体が薄くなる'),
  heightVariation('height-fog-falloff-small', { falloff: 0.25 }, 'falloff を小さくすると、上の方までフォグが残る'),
  heightVariation('height-fog-falloff-large', { falloff: 1.5 }, 'falloff を大きくすると、床の近くだけにフォグが溜まる'),
  // 13 (falloff 1.5) から height だけ変える。falloff を戻すと 2 つ同時に変わって分かりにくい
  heightVariation('height-fog-height', { falloff: 1.5, height: 4 }, 'height を上げると、フォグが上に移動する'),
  {
    id: 'formula',
    layout: 'demo',
    title: 'シェーダーコード',
    params: plain,
    controls: heightControls,
    side: code(`float heightFog(vec3 camPos, vec3 rayDir, float dist) {
  float fv = falloff * rayDir.y;
  float i = fv == 0.0 ? dist : (1.0 - exp(-fv * dist)) / fv;
  return density * exp(-falloff * (camPos.y - height)) * i;
}

vec3 fogColor = ambient * albedo;
float fog = heightFog(camPos, rayDir, dist);
color = mix(fogColor, color, exp(-fog));`),
    body: '<p>この式はボリュームレンダリング方程式から出てくるが、導出はここでは説明しない</p>',
  },
  {
    id: 'emission',
    layout: 'demo',
    title: '発光',
    // 環境光を消して、フォグ自体の発光だけで光っているのを見せる
    params: { ...plain, ambient: [0, 0, 0], emission: [1, 0, 0] },
    controls: [
      [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
      [controlPresets.ambient, controlPresets.albedo, controlPresets.emission],
    ],
    side: code(`vec3 fogColor = ambient * albedo + emission;
color = mix(fogColor, color, exp(-fog));`),
    body: '<p>散乱で入ってくる光とは別に、フォグ自体が発する光を足す</p>',
  },
  {
    id: 'rgb',
    layout: 'demo',
    title: 'パラメータを RGB ごとに変える',
    params: rgb,
    controls: [
      [controlPresets.densityRGB, controlPresets.falloffRGB, controlPresets.baseHeightRGB],
      [controlPresets.ambient, controlPresets.albedo, controlPresets.emission],
    ],
    randomize: {
      intervalMs: 1000,
      density: { min: 0.1, max: 0.8 },
      falloff: { min: 0.2, max: 1.2 },
      baseHeight: { min: 0, max: 4 },
      albedo: { min: 0.2, max: 1 },
      ambient: { min: 0.05, max: 0.3 },
      emission: { min: 0, max: 0.3 },
    },
    body: '<p>float を vec3 にするだけ</p>',
  },
  {
    id: 'fog-ambient',
    layout: 'demo',
    title: 'サーフェスの環境光にフォグを適用する',
    // 効果が出るのは albedo < 1 のときだけなので、赤 (G, B が吸収される) で見せる。面の環境光が赤く沈む
    params: { ...plain, albedo: [1, 0, 0] },
    fogAmbient: true,
    controls: [
      [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
      [controlPresets.ambient, controlPresets.albedo],
    ],
    side: code(`vec3 skyDir = vec3(0.0, 2.0 / 3.0, sqrt(5.0) / 3.0); // 空へ向かう代表方向 (仰角の cos = 2/3)
float T = exp(-heightFog(pos, skyDir, 1e5));
vec3 ambientHere = ambient * (1.0 - (1.0 - albedo) * (1.0 - T));
color = surfaceColor * (diffuse * sun + ambientHere);`),
    body: `
      <p>サーフェスに届く環境光 = 透過する分 + フォグの内散乱 = ambient × (1 − (1 − albedo)(1 − T))。T は空へ向かう代表方向で計算</p>
      <p>albedo が 1 ならフォグがあっても変わらない。吸収がある分だけ暗くなる</p>`,
  },
  {
    id: 'fog-sun',
    layout: 'demo',
    title: '太陽光にフォグを適用する',
    // 太陽を黄色にして、散乱した太陽光がサーフェスとフォグに乗るのが色で分かるようにする
    params: { ...plain, albedo: [0.5, 0.5, 0.5], lightColor: [1.6, 1.4, 0.3] },
    fogAmbient: true,
    fogSun: true,
    controls: [
      [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
      [controlPresets.ambient, controlPresets.albedo, controlPresets.lightColor],
    ],
    side: code(`float fog = heightFog(pos, lightDir, 1e5);
vec3 sun = sunColor * exp(-fog);          // サーフェスに届く太陽光が減衰する
ambientHere += sunInscatter(pos, skyDir); // 散乱した太陽光がサーフェスに届く
color = surfaceColor * (diffuse * sun + ambientHere);`),
    body: `
      <p>太陽光は 3 つの形で効くので、まとめて入れる</p>
      <ul>
        <li>サーフェスに届く太陽光がフォグで減衰する</li>
        <li>太陽光がフォグで散乱してカメラに届く</li>
        <li>太陽光がフォグで散乱してサーフェスに届く（環境光に足す）</li>
      </ul>`,
  },
  {
    id: 'sun-shadow',
    layout: 'demo',
    title: '光芒',
    // 光芒は逆光で太陽が低いときに見える。太陽を斜め前の低い位置に置き、影が手前へ伸びて視線を横切るようにする。
    // 環境光を暗くして太陽を明るくし、散乱した太陽光と影の差を出す。falloff を小さくして柱の高さまでフォグを残す
    params: {
      ...plain,
      density: [0.6, 0.6, 0.6],
      falloff: [0.3, 0.3, 0.3],
      albedo: [0.8, 0.8, 0.8],
      ambient: [0.12, 0.12, 0.14],
      lightColor: [2.4, 2.0, 0.6],
    },
    sun: { azimuth: 25, elevation: 22 },
    fogAmbient: true,
    fogSun: true,
    sunShadow: true,
    controls: [
      [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
      [controlPresets.ambient, controlPresets.albedo, controlPresets.lightColor],
    ],
    side: code(`vec3 inscatter = vec3(0.0);
for (int i = 0; i < 32; i++) {
  vec3 p = camPos + rayDir * t;
  float visible = shadow(p, lightDir);     // 柱に隠れていなければ 1
  inscatter += transmittance(t) * density(p) * visible * dt;
  t += dt;
}`),
    body: `
      <p>太陽光の内散乱に柱の影を入れると、フォグの中に光の筋が見える</p>
      <ul>
        <li>閉じた式では書けないので、視線をレイマーチする</li>
        <li>各点から太陽へ影のレイを飛ばして、隠れていれば散乱させない</li>
        <li>1 ピクセルにつき数十本の影のレイを飛ばすので重い</li>
      </ul>`,
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
