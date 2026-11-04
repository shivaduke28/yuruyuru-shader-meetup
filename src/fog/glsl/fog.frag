#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_cameraPosition;
uniform mat3 u_cameraBasis; // columns: right, up, forward

uniform vec3 u_density;        // a
uniform vec3 u_falloff;        // f
uniform vec3 u_baseHeight;     // h
uniform vec3 u_uniformDensity; // 高さに依存しない成分
uniform vec3 u_ambient;        // 環境光。面のアンビエントとフォグの内散乱に使う
uniform vec3 u_albedo;         // フォグの散乱アルベド
uniform vec3 u_emission;       // フォグ自体が発する光
uniform bool u_colorful;       // 柱の色をセルごとにランダムな色相にする
uniform vec3 u_lightColor;     // 平行光源の色 × 強さ
uniform bool u_lightAttenuation; // 平行光源を高さフォグで減衰させる
uniform bool u_twoStream;      // 面の環境光とフォグの内散乱を 2 ストリーム近似の放射場から計算する
uniform bool u_sunScatter;     // 太陽光の単散乱 (等方) をフォグの内散乱に足す。u_lightAttenuation なら深さで減衰
uniform bool u_ambientFog;     // 面の環境光にフォグを単散乱で適用する: ambient * (1 - (1 - albedo) (1 - T))。u_twoStream が優先

// ---------------------------------------------------------------------------
// 指数関数高さフォグ
//
// 消散係数   kappa(p) = a * exp(-f * (p.y - h))
// レイ上の点 x_t = c + t * rd  (0 <= t <= d)
// 光学的深さ tau = ∫_0^d kappa(x_t) dt
//              = a * exp(-f * (c.y - h)) * (1 - exp(-f * rd.y * d)) / (f * rd.y)
// rd.y -> 0 の極限は a * exp(-f * (c.y - h)) * d
// ---------------------------------------------------------------------------
vec3 heightFogOpticalDepth(vec3 c, vec3 rd, float d, vec3 a, vec3 f, vec3 h) {
  vec3 k0 = a * exp(-f * (c.y - h)); // カメラ位置での消散係数
  vec3 fv = f * rd.y;
  bvec3 flat_ = lessThan(abs(fv), vec3(1e-4));
  vec3 fvSafe = mix(fv, vec3(1.0), vec3(flat_));
  vec3 slanted = k0 * (1.0 - exp(-fvSafe * d)) / fvSafe;
  vec3 horizontal = k0 * d;
  return mix(slanted, horizontal, vec3(flat_));
}

vec3 fogTransmittance(vec3 c, vec3 rd, float d) {
  vec3 tau = heightFogOpticalDepth(c, rd, d, u_density, u_falloff, u_baseHeight)
           + u_uniformDensity * d;
  return exp(-min(tau, vec3(60.0)));
}

// ---------------------------------------------------------------------------
// シーン: y = 0 の床 + xz に CELL 間隔で並ぶ高さ固定の柱 (mod で繰り返す。柱はセル中央 CELL/2 + CELL*k)
// ---------------------------------------------------------------------------
const float CELL = 8.0;
// 柱の色は PERIOD_CELLS セルで繰り返す。カメラ座標を CELL * PERIOD_CELLS で巻き戻しても絵が続くようにして、
// 座標が大きくなって float の精度が落ちるのを防ぐ (renderer.ts の WORLD_PERIOD と一致させる)
const float PERIOD_CELLS = 64.0;
const float PILLAR_HALF_WIDTH = 0.7;
const float SURFACE_ALBEDO = 0.6; // 床と柱の反射率 (2 ストリーム近似の床の境界条件にも使う)
const float PILLAR_HEIGHT = 12.0;
const float FAR = 600.0;

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 cellId(vec2 xz) {
  return mod(floor(xz / CELL), PERIOD_CELLS);
}

// 柱はセルの中央にあって対称なので、mod で繰り返しても正しい SDF になる
float pillarSdf(vec3 p) {
  vec2 q = mod(p.xz, CELL) - 0.5 * CELL;
  return sdBox(vec3(q.x, p.y - 0.5 * PILLAR_HEIGHT, q.y), vec3(PILLAR_HALF_WIDTH, 0.5 * PILLAR_HEIGHT, PILLAR_HALF_WIDTH));
}

// 当たった点が床か柱か。当たり判定は距離に比例して甘いので p.y では決めず、SDF のどちらが近いかで決める
bool isFloor(vec3 p) {
  return p.y <= pillarSdf(p);
}

float mapScene(vec3 p) {
  return min(p.y, pillarSdf(p));
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(1e-3, 0.0);
  return normalize(vec3(
    mapScene(p + e.xyy) - mapScene(p - e.xyy),
    mapScene(p + e.yxy) - mapScene(p - e.yxy),
    mapScene(p + e.yyx) - mapScene(p - e.yyx)));
}

// 当たらなければ -1
float raymarch(vec3 ro, vec3 rd, float maxDist, float minStep) {
  float t = 0.0;
  for (int i = 0; i < 128; i++) {
    float h = mapScene(ro + rd * t);
    if (h < 1e-3 * max(1.0, t)) return t;
    t += max(h, minStep);
    if (t > maxDist) break;
  }
  return -1.0;
}

// ライトの向き（カメラは +z を向くので、後ろ上から当てて順光にする）
const vec3 LIGHT_DIR = normalize(vec3(0.3, 0.7, -0.6));

float shadow(vec3 ro, vec3 rd) {
  // 表面すれすれで歩幅が消えないように最小歩幅を入れる
  return raymarch(ro, rd, 40.0, 0.02) > 0.0 ? 0.0 : 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec3 k = fract(c.x + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0;
  return c.z * mix(vec3(1.0), clamp(abs(k) - 1.0, 0.0, 1.0), c.y);
}

vec3 surfaceAlbedo(vec3 p) {
  // 床は常にグレー。柱は u_colorful のときセルごとの色相
  if (!u_colorful || isFloor(p)) return vec3(SURFACE_ALBEDO);
  float hue = hash21(cellId(p.xz) + 3.0);
  return hsv2rgb(vec3(hue, 0.6, 0.6));
}

// 点 p から太陽方向への高さフォグの透過率。太陽は無限遠なので d = ∞ の閉じた式になる
// (LIGHT_DIR.y > 0 なら光学的深さは有限)。一様フォグ成分は無限遠まで積もるので無視する
vec3 sunTransmittance(vec3 p) {
  if (!u_lightAttenuation) return vec3(1.0);
  vec3 tau = heightFogOpticalDepth(p, LIGHT_DIR, 1e5, u_density, u_falloff, u_baseHeight);
  return exp(-min(tau, vec3(60.0)));
}

// ---------------------------------------------------------------------------
// 2 ストリーム近似 (hemispheric mean、等方散乱)
// 高さフォグを平行平板とみなし、上端から環境光 u_ambient が入り、床 (y = 0、反射率 SURFACE_ALBEDO) で反射するとして、
// 上向き I+ と下向き I- の放射束 (放射輝度の単位。一様な放射場 L なら I+ = I- = L) を閉じた形で解く。
// tau は上端から測った光学的深さ = kappa(y) / f。
//   dI+/dtau = (2 - w) I+ - w I- - 2 w q e^{-k tau}
//   dI-/dtau = w I+ - (2 - w) I- + 2 w q e^{-k tau}
// 同次解は e^{±lam tau} (lam = 2 sqrt(1 - w)、gam = w / (2 - w + lam))、
// 太陽 (源 q = lightColor / 4、k = 1 / L.y) の特解は pA e^{-k tau}, pB e^{-k tau}。
//   I+ = c1a e^{lam (tau - 2 tauB)} + c1b e^{lam (tau - tauB) - k tauB} + gam c2 e^{-lam tau} + pA e^{-k tau}
//   I- = gam (c1a e^{...} + c1b e^{...}) + c2 e^{-lam tau} + pB e^{-k tau}
// 係数の e^{-2 lam tauB} などは指数にまとめる (tau <= tauB なので常に 0 以下でオーバーフローしない)。
// w = 1 だと lam = 0 で退化するので w <= 0.99 に丸める。lam = k で特解が共鳴するので行列式を 0 から離す。
// 太陽は u_sunScatter のときだけ入れる。2 ストリームの中では太陽は常に深さで減衰する (面の直接光は u_lightAttenuation に従う)。
// 一様フォグ成分は含まない
// ---------------------------------------------------------------------------
struct TwoStream {
  vec3 w, lam, gam, tauB;
  vec3 c2;     // e^{-lam tau} の係数
  vec3 c1a;    // e^{lam (tau - 2 tauB)} の係数
  vec3 c1b;    // e^{lam (tau - tauB) - k tauB} の係数 (太陽が床で反射した分)
  vec3 pA, pB; // 太陽の特解
  vec3 q;      // 太陽の源
  float k;
};

vec3 tauFromTop(float y) {
  return u_density * exp(-u_falloff * (y - u_baseHeight)) / u_falloff;
}

TwoStream twoStreamSetup() {
  TwoStream ts;
  ts.w = min(u_albedo, vec3(0.99));
  ts.lam = 2.0 * sqrt(1.0 - ts.w);
  ts.gam = ts.w / (2.0 - ts.w + ts.lam);
  ts.tauB = tauFromTop(0.0);
  ts.k = 1.0 / LIGHT_DIR.y;
  ts.q = u_sunScatter ? u_lightColor * 0.25 : vec3(0.0);
  vec3 det = ts.lam * ts.lam - ts.k * ts.k;
  det = mix(det, vec3(-1e-2), vec3(lessThan(abs(det), vec3(1e-2))));
  ts.pA = 2.0 * ts.w * ts.q * (2.0 - ts.k) / det;
  ts.pB = 2.0 * ts.w * ts.q * (2.0 + ts.k) / det;
  // 境界条件: 上端で I- = ambient、床で I+ = rho (I- + 太陽の直達 lightColor L.y e^{-k tauB})
  vec3 direct = u_sunScatter ? u_lightColor * LIGHT_DIR.y : vec3(0.0);
  vec3 beta0 = (SURFACE_ALBEDO - ts.gam) / (1.0 - SURFACE_ALBEDO * ts.gam);
  vec3 r = (SURFACE_ALBEDO * (ts.pB + direct) - ts.pA) / (1.0 - SURFACE_ALBEDO * ts.gam);
  // c1 = beta0 e^{-2 lam tauB} c2 + r e^{-(k + lam) tauB} を上端の条件に入れて c2 を決める
  vec3 d1 = beta0 * exp(-2.0 * ts.lam * ts.tauB);
  vec3 d0 = r * exp(-(ts.k + ts.lam) * ts.tauB);
  ts.c2 = (u_ambient - ts.pB - ts.gam * d0) / (1.0 + ts.gam * d1);
  ts.c1a = ts.c2 * beta0;
  ts.c1b = r;
  return ts;
}

// 高さ y での上向き・下向きの放射束
void twoStreamFlux(TwoStream ts, float y, out vec3 up, out vec3 down) {
  vec3 tau = tauFromTop(y);
  vec3 ePlus = ts.c1a * exp(ts.lam * (tau - 2.0 * ts.tauB)) + ts.c1b * exp(ts.lam * (tau - ts.tauB) - ts.k * ts.tauB);
  vec3 eMinus = ts.c2 * exp(-ts.lam * tau);
  vec3 eSun = exp(-ts.k * tau);
  up = ePlus + ts.gam * eMinus + ts.pA * eSun;
  down = ts.gam * ePlus + eMinus + ts.pB * eSun;
}

// 法線 n の面が受ける環境光。上を向く面は下向きの光を、下を向く面は上向きの光を受ける
vec3 twoStreamAmbient(vec3 p, vec3 n) {
  vec3 up, down;
  twoStreamFlux(twoStreamSetup(), p.y, up, down);
  return max(0.5 * ((1.0 + n.y) * down + (1.0 - n.y) * up), vec3(0.0));
}

// 視線に沿った積分 ∫_0^d T(t) kappa(t) e^{s tau(t) + off} dt の閉じた形 (tau は上端からの光学的深さ)。
// 被積分関数の指数が e^{-fv t} の一次式なので、(e^{s tauCam + off} - T_d e^{s tauEnd + off}) / (1 + s rd.y) になる (s = 0 なら 1 - T_d)。
// 1 + s rd.y = 0 の方向では被積分関数が一定で、極限は e^{s tauCam + off} tauView。off は指数のオーバーフロー回避用
vec3 modeIntegral(vec3 s, vec3 off, vec3 tauCam, vec3 tauEnd, vec3 tauView, float rdy) {
  vec3 atCam = exp(s * tauCam + off);
  vec3 atEnd = exp(-tauView + s * tauEnd + off);
  vec3 den = 1.0 + s * rdy;
  bvec3 sing = lessThan(abs(den), vec3(1e-2));
  return mix((atCam - atEnd) / mix(den, vec3(1.0), vec3(sing)), atCam * tauView, vec3(sing));
}

// 視線に沿った光学的深さの道具立て。終点は床より下に置かない
// (FAR を超えて床に届かなかったレイは d = 1e5 で来るので、そのままだと tau が inf になる)
void rayTaus(vec3 c, vec3 rd, float d, out vec3 tauCam, out vec3 tauEnd, out vec3 tauView) {
  tauCam = tauFromTop(c.y);
  tauEnd = tauFromTop(max(c.y + rd.y * d, 0.0));
  tauView = min(heightFogOpticalDepth(c, rd, d, u_density, u_falloff, u_baseHeight), vec3(1e4));
}

// 内散乱 ∫ T(t) kappa(t) w (J(tau(t)) + q e^{-k tau(t)}) dt。J = (I+ + I-) / 2 は e^{±lam tau}, e^{-k tau} の和なので
// modeIntegral の和になる。q e^{-k tau} は太陽の単散乱 (u_sunScatter のとき)
vec3 twoStreamInscatter(vec3 c, vec3 rd, float d) {
  TwoStream ts = twoStreamSetup();
  vec3 tauCam, tauEnd, tauView;
  rayTaus(c, rd, d, tauCam, tauEnd, tauView);
  vec3 iPlusA = modeIntegral(ts.lam, -2.0 * ts.lam * ts.tauB, tauCam, tauEnd, tauView, rd.y);
  vec3 iPlusB = modeIntegral(ts.lam, -(ts.lam + ts.k) * ts.tauB, tauCam, tauEnd, tauView, rd.y);
  vec3 iMinus = modeIntegral(-ts.lam, vec3(0.0), tauCam, tauEnd, tauView, rd.y);
  vec3 iSun = modeIntegral(vec3(-ts.k), vec3(0.0), tauCam, tauEnd, tauView, rd.y);
  vec3 diffuse = 0.5 * (1.0 + ts.gam) * (ts.c1a * iPlusA + ts.c1b * iPlusB + ts.c2 * iMinus);
  vec3 sun = (0.5 * (ts.pA + ts.pB) + ts.q) * iSun;
  return max(ts.w * (diffuse + sun), vec3(0.0));
}

// 太陽光の単散乱 (等方)。位相関数 1/(4π) × 放射照度 π lightColor = lightColor / 4 が散乱の源。
// 減衰ありなら点 t での太陽の透過率 e^{-tau(t) / L.y} が掛かる。これも tau の指数関数なので s = -1 / L.y のモード積分になる
vec3 sunInscatter(vec3 c, vec3 rd, float d, vec3 T) {
  vec3 source = u_albedo * u_lightColor * 0.25;
  if (!u_lightAttenuation) return source * (1.0 - T);
  vec3 tauCam, tauEnd, tauView;
  rayTaus(c, rd, d, tauCam, tauEnd, tauView);
  return source * modeIntegral(vec3(-1.0 / LIGHT_DIR.y), vec3(0.0), tauCam, tauEnd, tauView, rd.y);
}

// 面の環境光にフォグを単散乱で適用する。半球の各方向で「空の光が透過する分 T L_a」と「フォグの内散乱 w L_a (1 - T)」を足すと
// L_a (1 - (1 - w)(1 - <T>)) になる (albedo = 1 なら変わらない。吸収がある分だけ暗くなる)。<T> は半球の cos 重み付き平均透過率。
// <T> の積分は閉じないので、空へ向かう代表方向 1 本 (仰角 cos = 2/3) の透過率で代表する。
// 上向きの面の <T> = 2 E3(tau) を exp(-1.5 tau) で近似する diffusivity factor で、数値積分でも上向きの面はよく合う。
// 側面は本当は下半分が地面まで濃いフォグを通るので暗めになるはずだが、地面やシーンの仮定を持ち込まないために同じ T を使う
// 太陽光がフォグで 1 回散乱して面に届く分 (これも単散乱) は、同じ代表方向で太陽の内散乱を積分して足す
const vec3 SKY_DIR = vec3(0.0, 2.0 / 3.0, 0.745356); // 長さ 1、y = 2/3
vec3 singleScatterAmbient(vec3 p) {
  vec3 T = exp(-min(tauFromTop(p.y) / SKY_DIR.y, vec3(60.0)));
  vec3 ambient = u_ambient * (1.0 - (1.0 - u_albedo) * (1.0 - T));
  if (u_sunScatter) ambient += sunInscatter(p, SKY_DIR, 1e5, T);
  return ambient;
}

vec3 shade(vec3 p, vec3 n) {
  float diff = max(dot(n, LIGHT_DIR), 0.0);
  float sh = shadow(p + n * 0.02, LIGHT_DIR);
  vec3 sun = u_lightColor * sunTransmittance(p);
  vec3 ambient = u_twoStream ? twoStreamAmbient(p, n) : (u_ambientFog ? singleScatterAmbient(p) : u_ambient);
  return surfaceAlbedo(p) * (diff * sh * sun + ambient);
}

void main() {
  vec2 uv = v_uv * vec2(u_resolution.x / u_resolution.y, 1.0);
  vec3 ro = u_cameraPosition;
  vec3 rd = normalize(u_cameraBasis * vec3(uv, 1.0));

  float hit = raymarch(ro, rd, FAR, 0.0);
  vec3 col;
  float d;
  if (hit > 0.0) {
    vec3 p = ro + rd * hit;
    col = shade(p, calcNormal(p));
    d = hit;
  } else {
    col = u_ambient; // 空 = 環境光 (どの方向から来る光も同じという前提)
    d = 1e5; // 無限遠扱い。rd.y <= 0 なら tau は発散して T -> 0
  }

  vec3 T = fogTransmittance(ro, rd, d);
  // 内散乱。既定は環境光 × 散乱アルベド × (1 - T) (Pickles の fogColor = ambient * albedo と同じ形) + 太陽の単散乱。
  // 2 ストリームのときは太陽も 2 ストリームの中で扱う
  vec3 inscatter;
  if (u_twoStream) {
    inscatter = twoStreamInscatter(ro, rd, d);
  } else {
    inscatter = u_ambient * u_albedo * (1.0 - T);
    if (u_sunScatter) inscatter += sunInscatter(ro, rd, d, T);
  }
  col = col * T + inscatter + u_emission * (1.0 - T);

  col = pow(col, vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}
