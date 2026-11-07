import hljs from 'highlight.js/lib/core'
import glsl from 'highlight.js/lib/languages/glsl'
import type { FogParams } from '../fog/params'
import type { DEFAULT_NOISE } from '../fog/renderer'
import { controlPresets, type ControlSpec } from '../fog/controls'

hljs.registerLanguage('glsl', glsl)

export type RandomRange = { min: number; max: number }

export type Slide = {
  id: string
  /** demo: 左にデモ、右にコードとスライダー。text: 見出しと本文だけ */
  /** demo: 見出し + デモ + 右カラム + 本文、text: 見出し + 本文、cover: デモをステージ全体の背景にして見出しと本文を重ねる (表紙) */
  layout: 'demo' | 'text' | 'cover'
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
  /** 濃さに 3D ノイズをかける (renderer.noise)。指定するとトグルとノイズのスライダーも出る。省略したキーは renderer の既定 */
  noise?: Partial<typeof DEFAULT_NOISE>
  /** 太陽光の散乱の Henyey-Greenstein の g (renderer.phaseG)。指定するとスライダーも出る。省略時は 0 (等方) */
  phaseG?: number
  /** 高さフォグと距離フォグの合成 (renderer.fogMixMode)。0: 散乱量の比、1: 高さ→距離の順、2: 距離→高さの順。指定すると選択式が出る。省略時は 0 */
  fogMixMode?: 0 | 1 | 2
  /** トグルを出すものを絞る。省略時は fogAmbient / fogSun / sunShadow / noise のうち指定したもの全部 */
  toggles?: ('fogAmbient' | 'fogSun' | 'sunShadow' | 'noise')[]
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
  uniformAlbedo: [1, 1, 1],
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
  uniformAlbedo: [1, 1, 1],
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

// 距離フォグの色は環境光そのもの (アルベドは albedo のスライドで 1 にすると決めて、以降の式では省く)
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

const heightFogCode = code(`float fogDensity(vec3 pos) {
  return density * exp(-falloff * (pos.y - height));
}`)

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
    layout: 'cover',
    title: '指数関数高さフォグ',
    body: '<p>shivaduke / ゆるゆるシェーダー交流会 #2</p>',
    // 表紙: 光芒のスライドと同じ逆光の構図に、位相関数とノイズも入れて全部盛りにする。トグルは出さない。
    // density / falloff / height を RGB で少しずつ変えて、高さによって色が変わるようにする
    // (赤は薄くて高くまで、青は濃くて低く、緑はその間。height もずらして境目が同じ高さに揃わないようにする)
    params: {
      ...plain,
      density: [0.45, 0.6, 0.8],
      falloff: [0.25, 0.35, 0.5],
      baseHeight: [1.5, 1, 0.5],
      albedo: [0.91, 0.91, 0.91],
      ambient: [0.38, 0.38, 0.41],
      lightColor: [1, 0.92, 0.54],
      sunIntensity: 2.4,
    },
    sun: { azimuth: 25, elevation: 22 },
    fogAmbient: true,
    fogSun: true,
    sunShadow: true,
    phaseG: 0.5,
    noise: { min: 0.3, max: 1.7 },
    toggles: [],
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
    id: 'uniform-fog-albedo',
    layout: 'demo',
    title: '距離フォグ',
    // アルベドを下げると遠くのフォグ (= 空) だけが暗くなり、サーフェスに届く環境光と合わなくなるのを見せる
    params: { ...uniform, uniformAlbedo: [1, 0, 0] },
    controls: [controlPresets.ambient, controlPresets.uniformAlbedo, controlPresets.uniform],
    side: code(`vec3 fogColor = ambient * albedo;
float T = exp(-density * dist); // 透過率: 距離 dist で残る光の割合
color = mix(fogColor, color, T);`),
    body: `
      <ul>
        <li>albedo: フォグが環境光をどのくらい散乱して返すか</li>
        <li>環境光とフォグの色を変えることができる</li>
        <li>※距離フォグは無限に広がるので、本当は空と同じ色の方が自然</li>
      </ul>`,
  },
  {
    id: 'uniform-fog-rgb',
    layout: 'demo',
    title: 'density を RGB にする',
    // Playground の water プリセット: 赤が早く吸われて遠くが青緑になる。環境光は暗めの青緑、太陽は真上から青白く弱め
    params: {
      ...uniform,
      uniformDensity: [0.2, 0.09, 0.035],
      ambient: [0.16, 0.42, 0.55],
      lightColor: [0.75, 0.9, 1],
      sunIntensity: 1.2,
    },
    sun: { azimuth: 160, elevation: 70 }, // 方位 0 はカメラの正面 (逆光) なので後ろ寄りにする
    controls: [controlPresets.ambient, controlPresets.uniformRGB],
    side: code(`vec3 fogColor = ambient;
vec3 T = exp(-density * dist); // density を vec3 にするだけ
color = mix(fogColor, color, T);`),
    body: '<p>水などを再現する場合は RGB ごとに density を変える</p>',
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
        <li>density: フォグ全体の濃さ</li>
        <li>falloff: 減衰の速さ</li>
        <li>height: 減衰が始まる高さ</li>
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
  float depth = density * exp(-falloff * (camPos.y - height)) * i; // 視線上の濃さの合計
  return exp(-depth);
}

vec3 fogColor = ambient * albedo;
float T = heightFogTransmittance(camPos, rayDir, dist);
color = mix(fogColor, color, T);`),
    body: `
      <p>カメラの位置、レイの方向、レイの長さから計算できる</p>
      <p>ボリュームレンダリング方程式から導出されるが、説明は省略する</p>`,
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
      density: { min: 0.05, max: 1.5 },
      falloff: { min: 0.1, max: 1.5 },
      baseHeight: { min: -2, max: 8 },
      albedo: { min: 0.2, max: 1 },
      ambient: { min: 0.15, max: 0.75 },
      emission: { min: 0, max: 0.7 },
    },
    body: '<p>float を vec3 にすると、ピーキーだがいろんな絵が出る</p>',
  },
  {
    id: 'advanced',
    layout: 'text',
    title: '',
    // 区切りのページ。見出しなしで中央に 1 文だけ
    body: '<p class="banner">以下、発展的な内容。</p>',
    params: plain,
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
vec3 skyDir = vec3(0.0, 2.0 / 3.0, sqrt(5.0) / 3.0);              // 空へ向かう代表方向 (仰角の cos = 2/3)
vec3 ambientHere = ambient + sunInscatter(pos, skyDir, 1e5);      // 散乱した太陽光がサーフェスに届く
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
    id: 'fog-ambient',
    layout: 'demo',
    title: 'サーフェスの環境光にフォグを適用する',
    // 太陽を消して環境光だけにし、環境光にフォグが効くところだけを見せる (前の太陽のスライドと対になる)。
    // 効果が出るのは albedo < 1 のときだけなので、赤 (G, B が吸収される) で見せる。面の環境光が赤く沈む
    params: { ...plain, albedo: [1, 0, 0], sunIntensity: 0 },
    fogAmbient: false,
    controls: [
      [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
      [controlPresets.ambient, controlPresets.albedo],
    ],
    side: code(`float T = heightFogTransmittance(pos, skyDir, 1e5);   // 空へ向かう透過率
vec3 ambientHere = ambient * T;                        // フォグを通り抜けて届く分
ambientHere += ambient * albedo * (1.0 - T);           // フォグで散乱して届く分
color = surfaceColor * (diffuse * sun + ambientHere);`),
    body: `
      <ul>
        <li>環境光を高さフォグで減衰させる</li>
        <li>フォグで散乱した分を環境光に足す</li>
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
    id: 'phase',
    layout: 'demo',
    title: '位相関数',
    // 光芒と同じ逆光の構図。g = 0.5 で太陽の周りのフォグが明るくなり、光芒が太陽の周りに集まる。スライダーで 0 に戻して比べる
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
    toggles: [],
    phaseG: 0.5,
    controls: [[controlPresets.density, controlPresets.falloff, controlPresets.baseHeight]],
    side: code(`// Henyey-Greenstein。g = 0 で等方、g > 0 で前方散乱
float phase(float cosTheta, float g) {
  return (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5));
}

// 太陽の向きは一定なので、視線上で定数。内散乱に係数としてかけるだけ
sunFog *= phase(dot(rayDir, lightDir), g) * 4.0 * PI;`),
    body: `
      <ul>
        <li>空気より重いガスなどは、前方に散乱しやすい（ミー散乱）</li>
        <li>平行光源は向きが一定なので計算できる</li>
      </ul>`,
  },
  {
    id: 'noise',
    layout: 'demo',
    title: 'ノイズ',
    // 高さフォグだけ、環境光で見る。カメラの高さまでフォグを残し (falloff 小)、ノイズの倍率を 0〜2 にしてムラをはっきり出す。
    // 環境光を明るめにしてフォグを暖色にし、グレーのサーフェスと空に対して色でムラが見えるようにする
    params: {
      ...plain,
      density: [0.5, 0.5, 0.5],
      falloff: [0.3, 0.3, 0.3],
      ambient: [0.7, 0.7, 0.7],
      albedo: [1, 0.75, 0.45],
    },
    noise: { min: 0, max: 2 },
    controls: [
      [controlPresets.density, controlPresets.falloff, controlPresets.baseHeight],
      [controlPresets.ambient, controlPresets.albedo],
    ],
    side: code(`float R = 0.0, w = 0.0;
for (int i = 0; i < 10; i++) {       // レイの上の数点で
  vec3 p = camPos + rayDir * d[i];
  R += fogDensity(p) * noise(p);     // ノイズを読んで、濃いところを重くして
  w += fogDensity(p);
}
T = pow(T, R / w);                   // 平均で透過率を変える`),
    body: `
      <p>3D ノイズでフォグにムラをつける</p>
      <ul>
        <li>レイの上の数点で 3D ノイズを読んで平均する。フォグが濃いところを重くする</li>
        <li>その平均 R で、透過率を T の R 乗にする</li>
      </ul>`,
  },
  {
    id: 'fog-mix',
    layout: 'demo',
    title: '距離フォグと高さフォグを両方使う',
    // 2 つのフォグの色を違えて (高さフォグは橙、距離フォグは青白)、順番に合成したときとの差を見せる
    params: {
      ...plain,
      density: [0.6, 0.6, 0.6],
      falloff: [0.6, 0.6, 0.6],
      uniformDensity: [0.03, 0.03, 0.03],
      albedo: [1, 0.6, 0.3],
      uniformAlbedo: [0.7, 0.85, 1],
    },
    fogMixMode: 1,
    controls: [
      [controlPresets.uniform, controlPresets.uniformAlbedo],
      [controlPresets.density, controlPresets.falloff, controlPresets.albedo],
    ],
    side: code(`// 透過率は掛ければよい
float T = Th * Tu;

// 順番に合成すると、先に合成したフォグが全部もう一方の奥にあることになる
color = mix(fogColorH, color, Th);
color = mix(fogColorU, color, Tu); // 逆の順でも同じ種類の間違い

// 2 つのフォグが散乱した量 A, B の比で色を混ぜる
vec3 fogColor = (fogColorH * A + fogColorU * B) / (A + B);
color = mix(fogColor, color, T);`),
    body: `
      <ul>
        <li>透過率は光学的深さを足すだけでよい</li>
        <li>フォグの色が違うときは足せない。順番に合成すると、先に合成したフォグがもう一方の色に染まる</li>
        <li>それぞれが散乱した量の比で色を混ぜる。この量は閉じた式にならないので近似で見積もる</li>
      </ul>`,
  },
  {
    id: 'end',
    layout: 'text',
    title: 'おわり',
    body: '<p><a href="./">トップへ戻る</a></p>',
    params: rgb,
  },
]
