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
uniform vec3 u_albedo;         // 高さフォグの散乱アルベド
uniform vec3 u_uniformAlbedo;  // 距離フォグの散乱アルベド
uniform vec3 u_emission;       // フォグ自体が発する光
uniform bool u_colorful;       // 柱の色をセルごとにランダムな色相にする
uniform float u_pillarHalfWidth; // 柱の半分の幅 (セル 8 の中に収まる範囲)
uniform float u_pillarHeight;    // 柱の高さ
uniform vec3 u_lightColor;     // 平行光源の色 × 強さ
uniform bool u_lightAttenuation; // 平行光源を高さフォグで減衰させる
uniform bool u_sunScatter;     // 太陽光の単散乱 (等方) をフォグの内散乱に足す。u_lightAttenuation なら深さで減衰
uniform bool u_ambientFog;     // サーフェスの環境光にフォグを単散乱で適用する: ambient * (1 - (1 - albedo) (1 - T))

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
const float SURFACE_ALBEDO = 0.6; // 床と柱の反射率 (2 ストリーム近似の床の境界条件にも使う)
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
  return sdBox(vec3(q.x, p.y - 0.5 * u_pillarHeight, q.y), vec3(u_pillarHalfWidth, 0.5 * u_pillarHeight, u_pillarHalfWidth));
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

// 上端から測った高さフォグの光学的深さ tau(y) = kappa(y) / f (真上へ無限遠まで)
vec3 tauFromTop(float y) {
  return u_density * exp(-u_falloff * (y - u_baseHeight)) / u_falloff;
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

// ---------------------------------------------------------------------------
// 高さフォグと距離フォグが混ざるときの内散乱
// 視線に沿った ∫ T_view(t) kappa(t) ... dt は、T_view = e^{-tau_h(t) - kappa_u t} に距離フォグが入ると
// w = e^{-fv t} の冪乗になって閉じない (不完全ガンマ関数)。そこで平均値の定理で、もう一方のフォグの透過率を積分の外に出す:
//   高さフォグの項 × heightFactor = 1 / (1 + kappa_u t*)。t* は高さフォグの光学的深さが 1 になる距離
//     (届かなければ密度の e 倍距離 1 / fv に連続につなぐ、水平なら 1 / k0)。水平なレイで厳密 (kappa_h / (kappa_h + kappa_u))
//   距離フォグの項 × uniformFactor = 1 / (1 + tau_h(t_u))。t_u は距離フォグの内散乱の重み kappa_u e^{-kappa_u t} の [0, d] での平均距離
//   Python の数値積分と比べて最大誤差 0.06 (plain + 距離フォグ 0.005〜0.08、空から急な見下ろしまで)。水平線をまたいで連続
// ---------------------------------------------------------------------------
void fogMixFactors(vec3 c, vec3 rd, float d, out vec3 heightFactor, out vec3 uniformFactor) {
  vec3 k0 = u_density * exp(-u_falloff * (c.y - u_baseHeight)); // カメラ位置の高さフォグの密度
  vec3 fv = u_falloff * rd.y;
  bvec3 flat_ = lessThan(abs(fv), vec3(1e-4));
  vec3 fvSafe = mix(fv, vec3(1.0), vec3(flat_));
  // 高さフォグの光学的深さが 1 になる距離: (k0 / fv)(1 - e^{-fv t}) = 1 → t = -ln(1 - fv / k0) / fv。
  // 上向きで 1 に届かないレイは、無限遠の光学的深さの 63% (= 密度の e 倍距離 1 / fv) に達する距離へ連続につなぐ。
  // 届く・届かないで式を切り替えると、境目 (rd.y = k0 / f の等高線) が空に線として出る
  vec3 ratio = min(fv / max(k0, vec3(1e-6)), vec3(1.0 - exp(-1.0)));
  vec3 tStar = -log(max(1.0 - ratio, vec3(1e-6))) / fvSafe;
  tStar = min(mix(tStar, 1.0 / max(k0, vec3(1e-6)), vec3(flat_)), vec3(d));
  heightFactor = 1.0 / (1.0 + u_uniformDensity * tStar);

  // 距離フォグの内散乱の重みの平均距離 (切断指数分布の平均) での高さフォグの光学的深さ
  vec3 xd = u_uniformDensity * d;
  bvec3 thin = lessThan(xd, vec3(1e-4));
  vec3 xdSafe = mix(xd, vec3(1.0), vec3(thin));
  vec3 tU = mix(1.0 / max(u_uniformDensity, vec3(1e-6)) - d * exp(-xdSafe) / (1.0 - exp(-xdSafe)), vec3(0.5 * d), vec3(thin));
  vec3 tauH = mix(k0 * (1.0 - exp(-fvSafe * tU)) / fvSafe, k0 * tU, vec3(flat_));
  uniformFactor = 1.0 / (1.0 + min(tauH, vec3(1e4)));
}

// 視線に沿って 2 つのフォグが散乱する量の比で albedo を混ぜる。片方しかなければそのフォグの albedo
vec3 mixedAlbedo(vec3 c, vec3 rd, float d) {
  if (all(equal(u_uniformDensity, vec3(0.0)))) return u_albedo;
  if (all(equal(u_density, vec3(0.0)))) return u_uniformAlbedo;
  vec3 hf, uf;
  fogMixFactors(c, rd, d, hf, uf);
  vec3 tauH = heightFogOpticalDepth(c, rd, d, u_density, u_falloff, u_baseHeight);
  vec3 a = (1.0 - exp(-min(tauH, vec3(60.0)))) * hf;
  vec3 b = (1.0 - exp(-min(u_uniformDensity * d, vec3(60.0)))) * uf;
  return (u_albedo * a + u_uniformAlbedo * b) / max(a + b, vec3(1e-6));
}

// 太陽光の単散乱 (等方)。位相関数 1/(4π) × 放射照度 π lightColor = lightColor / 4 が散乱の源。
// 視線に沿って ∫ T_view(t) [albedo_h kappa_h(t) T_sun(t) + albedo_u kappa_u] dt を積分する。
// T_sun = e^{-tau_h(t) / L.y} は高さフォグだけ (無限に広がる距離フォグは太陽を完全に遮ってしまうので、太陽は減衰させないと割り切る)。
// 高さフォグの項は tau の指数関数なので s = -1 / L.y のモード積分、距離フォグの項は 1 - e^{-kappa_u d}。混ざるときは fogMixFactors
vec3 sunInscatter(vec3 c, vec3 rd, float d, vec3 T) {
  vec3 source = u_lightColor * 0.25;
  if (!u_lightAttenuation) return source * mixedAlbedo(c, rd, d) * (1.0 - T);
  vec3 tauCam, tauEnd, tauView;
  rayTaus(c, rd, d, tauCam, tauEnd, tauView);
  vec3 hf, uf;
  fogMixFactors(c, rd, d, hf, uf);
  vec3 heightTerm = u_albedo * modeIntegral(vec3(-1.0 / LIGHT_DIR.y), vec3(0.0), tauCam, tauEnd, tauView, rd.y) * hf;
  vec3 uniformTerm = u_uniformAlbedo * (1.0 - exp(-min(u_uniformDensity * d, vec3(60.0)))) * uf;
  return source * (heightTerm + uniformTerm);
}

// 面の環境光にフォグを単散乱で適用する。半球の各方向で「空の光が透過する分 T L_a」と「フォグの内散乱 w L_a (1 - T)」を足すと
// L_a (1 - (1 - w)(1 - <T>)) になる (albedo = 1 なら変わらない。吸収がある分だけ暗くなる)。<T> は半球の cos 重み付き平均透過率。
// <T> の積分は閉じないので、空へ向かう代表方向 1 本 (仰角 cos = 2/3) の透過率で代表する。
// 上向きの面の <T> = 2 E3(tau) を exp(-1.5 tau) で近似する diffusivity factor で、数値積分でも上向きの面はよく合う。
// 側面は本当は下半分が地面まで濃いフォグを通るので暗めになるはずだが、地面やシーンの仮定を持ち込まないために同じ T を使う
// 太陽光がフォグで 1 回散乱して面に届く分 (これも単散乱) は、同じ代表方向で太陽の内散乱を積分して足す。
// 距離フォグは含めない (空まで無限に続くので T = 0 になってしまう)。albedo は高さフォグのもの
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
  vec3 ambient = u_ambientFog ? singleScatterAmbient(p) : u_ambient;
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
  // 内散乱 = 環境光 × 散乱アルベド × (1 - T) (Pickles の fogColor = ambient * albedo と同じ形) + 太陽の単散乱。
  // 高さフォグと距離フォグで albedo が違うときは、散乱する量の比で混ぜる
  vec3 inscatter = u_ambient * mixedAlbedo(ro, rd, d) * (1.0 - T);
  if (u_sunScatter) inscatter += sunInscatter(ro, rd, d, T);
  col = col * T + inscatter + u_emission * (1.0 - T);

  col = pow(col, vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}
