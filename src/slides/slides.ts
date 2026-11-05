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
  /** サーフェスの環境光 (空の光) にフォグを適用する: 空方向の透過率で減衰 + フォグで散乱して届く分を足す
   *  (renderer.skyAttenuation + skyInscatterAmbient)。指定すると 2 つ別々のトグルが出る。省略時は false でトグルなし */
  fogAmbient?: boolean
  /** 太陽光にフォグを適用する: 面に届く太陽光の減衰、太陽光のカメラへの内散乱、サーフェスへの内散乱の 3 つをまとめてオンにする
   *  (renderer.sunAttenuation + sunInscatter + sunInscatterAmbient)。指定すると 3 つ別々のトグルが出る */
  fogSun?: boolean
  /** 太陽光の内散乱で柱の影を見る (renderer.sunInscatterShadow、光芒)。sunInscatter のときだけ効く。指定するとトグルも出る */
  sunShadow?: boolean
  /** トグルを出すものを絞る。省略時は fogAmbient / fogSun / sunShadow のうち指定したもの全部 */
  toggles?: ('fogAmbient' | 'fogSun' | 'sunShadow')[]
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

// 環境光は暗めのグレー、太陽は暖色。環境光が明るいと日の当たる面が白飛びし、フォグと影の差も消える。
// 色は sRGB (params.ts 参照)。強さは sunIntensity。
// スライドの params は前のスライドの値に上書きされるだけなので、基準の plain / rgb は全部のキーを持つこと (抜けると前の値が残る)
const ambient: [number, number, number] = [0.54, 0.54, 0.54]
const lightColor: [number, number, number] = [1, 0.96, 0.88]
const sunIntensity = 1.6

const plain: Partial<FogParams> = {
  density: [0.8, 0.8, 0.8],
  falloff: [0.5, 0.5, 0.5],
  baseHeight: [1, 1, 1],
  uniformDensity: [0, 0, 0],
  ambient,
  albedo: [1, 1, 1],
  emission: [0, 0, 0],
  lightColor,
  sunIntensity,
}

const rgb: Partial<FogParams> = {
  density: [0.25, 0.35, 0.55],
  falloff: [0.35, 0.55, 0.9],
  baseHeight: [0, 1.5, 3],
  uniformDensity: [0, 0, 0],
  ambient,
  albedo: [1, 1, 1],
  emission: [0, 0, 0],
  lightColor,
  sunIntensity,
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

const uniformControls = [controlPresets.ambient, controlPresets.uniform]
// フォグの形のパラメータと、色のパラメータを別のカードに分ける
const heightControls = [
  [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
  [controlPresets.ambient, controlPresets.albedo],
]

// 距離フォグの色は環境光そのもの (無限に広がる一様フォグでは空の色 = フォグの色)
// スライドのコードでは透過率を T と書き、高さフォグの透過率は heightFogTransmittance で呼ぶ (生の exp はここだけ)
const distanceFogCode = code(`vec3 fogColor = ambient;
float T = exp(-density * dist); // 透過率: 距離 dist で残る光の割合
color = mix(fogColor, color, T);`)

const uniformVariation = (
  id: string,
  fog: number,
  body: string,
  ambientOverride: [number, number, number] = ambient,
): Slide => ({
  id,
  layout: 'demo',
  title: '距離フォグ',
  params: { ...uniform, uniformDensity: [fog, fog, fog], ambient: ambientOverride },
  controls: uniformControls,
  side: distanceFogCode,
  body: `<p>${body}</p>`,
})

const heightFogCode = code('float fogDensity = density * exp(-falloff * (pos.y - height)); // 高さ pos.y での濃さ')

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
        <li>ambient: 環境光。フォグの色は空の色と同じになる</li>
      </ul>`,
  },
  uniformVariation('uniform-fog-thick', 0.15, 'density を大きくすると、フォグが濃くなって近くしか見えない'),
  uniformVariation('uniform-fog-thin', 0.01, 'density を小さくすると、フォグが薄くなって遠くまで見える'),
  uniformVariation('uniform-fog-ambient', 0.05, 'ambient を変更すると、フォグだけでなく空や床の色も変わる', [1, 0, 0]),
  {
    id: 'uniform-fog-rgb',
    layout: 'demo',
    title: 'density を RGB にする',
    // Playground の water プリセット: 赤から順に吸われ、環境光は暗めの青
    params: {
      ...uniform,
      uniformDensity: [0.16, 0.08, 0.04],
      ambient: [0.35, 0.54, 0.7],
    },
    controls: [controlPresets.ambient, controlPresets.uniformRGB],
    side: code(`vec3 fogColor = ambient;
vec3 T = exp(-density * dist); // density を vec3 にするだけ
color = mix(fogColor, color, T);`),
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
        <li>albedo: フォグが環境光をどのくらい反射するか。フォグの色 = ambient × albedo</li>
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
    side: code(`float heightFogTransmittance(vec3 camPos, vec3 rayDir, float dist) {
  float fv = falloff * rayDir.y;
  float i = fv == 0.0 ? dist : (1.0 - exp(-fv * dist)) / fv;
  float depth = density * exp(-falloff * (camPos.y - height)) * i; // 視線に沿って濃さを積分したもの
  return exp(-depth);
}

vec3 fogColor = ambient * albedo;
float T = heightFogTransmittance(camPos, rayDir, dist);
color = mix(fogColor, color, T);`),
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
color = mix(fogColor, color, T);`),
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
      albedo: { min: 0.48, max: 1 },
      ambient: { min: 0.25, max: 0.58 },
      emission: { min: 0, max: 0.58 },
    },
    body: '<p>float を vec3 にするだけ</p>',
  },
  {
    id: 'fog-ambient',
    layout: 'demo',
    title: 'サーフェスの環境光にフォグを適用する',
    // 太陽を消して環境光だけにし、環境光にフォグが効くところだけを見せる (太陽のスライドと対になる)。
    // 効果が出るのは albedo < 1 のときだけなので、赤 (G, B が吸収される) で見せる。面の環境光が赤く沈む
    params: { ...plain, albedo: [1, 0, 0], sunIntensity: 0 },
    fogAmbient: true,
    controls: [
      [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
      [controlPresets.ambient, controlPresets.albedo],
    ],
    side: code(`vec3 skyDir = vec3(0.0, 2.0 / 3.0, sqrt(5.0) / 3.0); // 空へ向かう代表方向 (仰角の cos = 2/3)
float T = heightFogTransmittance(pos, skyDir, 1e5);
vec3 ambientHere = ambient * T;                // フォグを通り抜けて届く分
ambientHere += ambient * albedo * (1.0 - T);   // フォグで散乱して届く分
color = surfaceColor * (diffuse * sun + ambientHere);`),
    body: `
      <p>サーフェスに届く環境光 = 通り抜けて届く分 ambient × T + フォグで散乱して届く分 ambient × albedo × (1 − T)。T は空へ向かう代表方向で計算</p>
      <p>albedo が 1 なら足すと ambient に戻る。フォグがあっても変わらず、吸収がある分だけ暗くなる</p>`,
  },
  {
    id: 'fog-sun',
    layout: 'demo',
    title: '太陽光にフォグを適用する',
    // 環境光を消して太陽だけにし、フォグのアルベドを赤、太陽を黄色にする。太陽のトグルは発表者が 1 つずつ入れる:
    // attenuation で日の当たる面が沈み、inscatter でフォグが黄 × 赤で光り、inscatter ambient でサーフェスにも乗る。
    // 環境光が 0 なので空の 2 つは効かず、トグルも出さない
    params: { ...plain, ambient: [0, 0, 0], albedo: [1, 0, 0], lightColor: [1, 0.92, 0.2] },
    fogSun: false,
    controls: [
      [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
      [controlPresets.ambient, controlPresets.albedo, controlPresets.lightColor, controlPresets.sunIntensity],
    ],
    side: code(`vec3 sun = sunColor * heightFogTransmittance(pos, lightDir, 1e5); // サーフェスに届く太陽光が減衰する
vec3 sunFog = sunInscatter(camPos, rayDir, dist);                 // 散乱した太陽光がカメラに届く
ambientHere += sunInscatter(pos, skyDir, 1e5);                    // 散乱した太陽光がサーフェスに届く
color = surfaceColor * (diffuse * sun + ambientHere);
color = mix(fogColor, color, T) + sunFog;`),
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
      albedo: [0.91, 0.91, 0.91],
      ambient: [0.38, 0.38, 0.41],
      lightColor: [1, 0.92, 0.54],
      sunIntensity: 2.4,
    },
    sun: { azimuth: 25, elevation: 22 },
    fogAmbient: true,
    fogSun: true,
    sunShadow: true,
    toggles: ['sunShadow'], // 空と太陽の 5 つは前のスライドで見せているので、ここでは影だけ
    controls: [
      [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
      [controlPresets.ambient, controlPresets.albedo, controlPresets.lightColor, controlPresets.sunIntensity],
    ],
    side: code(`vec3 inscatter = vec3(0.0);
for (int i = 0; i < 32; i++) {
  vec3 p = camPos + rayDir * t;
  float visible = shadow(p, lightDir);     // 柱に隠れていなければ 1
  inscatter += heightFogTransmittance(camPos, rayDir, t) * fogDensity(p) * visible * dt;
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
