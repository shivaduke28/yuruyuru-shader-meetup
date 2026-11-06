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
uniform vec3 u_uniformAlbedo;  // 距離フォグの散乱アルベド。距離フォグの色 = ambient * uniformAlbedo (既定 1。空の色 = フォグの色なので 1 が自然)
uniform vec3 u_ambient;        // 環境光。面のアンビエントとフォグの内散乱に使う
uniform vec3 u_albedo;         // 高さフォグの散乱アルベド。フォグの色 = ambient * albedo + emission
uniform vec3 u_emission;       // 高さフォグ自体が発する光
uniform bool u_colorful;       // 柱の色をセルごとにランダムな色相にする
uniform float u_pillarHalfWidth; // 柱の半分の幅 (セル 8 の中に収まる範囲)
uniform float u_pillarHeight;    // 柱の高さ
uniform vec3 u_lightColor;     // 平行光源の色 × 強さ
uniform vec3 u_lightDir;       // 平行光源の向き (光源へ向かう単位ベクトル、y > 0)。既定はカメラの後ろ上からの順光
uniform bool u_sunAttenuation; // 平行光源を高さフォグで減衰させる
uniform bool u_sunInscatter;     // 太陽光の単散乱 (等方) をフォグの内散乱に足す (カメラへ)。u_sunAttenuation なら深さで減衰
uniform bool u_sunInscatterAmbient; // 太陽光の単散乱をサーフェスの環境光に足す (サーフェスへ)
uniform float u_phaseG;        // 太陽光の散乱の Henyey-Greenstein の g (-1..1)。0 で等方、正で前方散乱
uniform float u_frame;         // フレーム番号 (光芒の march の開始位置をフレームごとにずらす)
uniform bool u_skyAttenuation;      // サーフェスの環境光 (空の光) を空方向の透過率で減衰させる: ambient * T
uniform bool u_skyInscatterAmbient; // 空の光がフォグで散乱してサーフェスに届く分を環境光に足す: ambient * albedo * (1 - T)
uniform bool u_emissionAmbient; // サーフェスの環境光に高さフォグの発光を足す: emission * (1 - T)
uniform bool u_sunInscatterShadow; // 太陽光の内散乱で、サンプル点から太陽への影 (柱・床) を見る。視線をレイマーチして数値積分する (光芒)
uniform bool u_noise;           // 消散係数に 3D ノイズをかける (視線の透過率にだけ効く)
uniform int u_fogMixMode;       // 高さフォグと距離フォグの合成。0: 散乱量の比で色を混ぜる (正しい)、1: 高さ→距離の順に合成、2: 距離→高さの順に合成 (1, 2 は比較用の間違った合成)
uniform float u_noiseScale;     // ノイズの周波数 (1/長さ)
uniform float u_noiseMin;       // r = mix(noiseMin, noiseMax, fbm)
uniform float u_noiseMax;
uniform float u_noiseSpeed;     // ノイズの流れる速さ (長さ/秒)

// ---------------------------------------------------------------------------
// 指数関数高さフォグ
//
// 消散係数   kappa(p) = a * exp(-f * (p.y - h))
// レイ上の点 x_t = c + t * rd  (0 <= t <= d)
// 光学的深さ tau = ∫_0^d kappa(x_t) dt
//              = a * exp(-f * (c.y - h)) * (1 - exp(-f * rd.y * d)) / (f * rd.y)
// rd.y -> 0 の極限は a * exp(-f * (c.y - h)) * d
// ---------------------------------------------------------------------------
// exp の引数を float の範囲内で止める。d = 1e5 のレイや遠い終点で exp が inf になると、density = 0 のとき 0 × inf = NaN になる
vec3 expClamped(vec3 x) {
  return exp(min(x, vec3(80.0)));
}

vec3 heightFogOpticalDepth(vec3 c, vec3 rd, float d, vec3 a, vec3 f, vec3 h) {
  vec3 k0 = a * exp(-f * (c.y - h)); // カメラ位置での消散係数
  vec3 fv = f * rd.y;
  bvec3 isFlat = lessThan(abs(fv), vec3(1e-4));
  vec3 fvSafe = mix(fv, vec3(1.0), vec3(isFlat));
  vec3 slanted = k0 * (1.0 - expClamped(-fvSafe * d)) / fvSafe;
  vec3 horizontal = k0 * d;
  return mix(slanted, horizontal, vec3(isFlat));
}

vec3 fogTransmittance(vec3 c, vec3 rd, float d) {
  vec3 tau = heightFogOpticalDepth(c, rd, d, u_density, u_falloff, u_baseHeight)
           + u_uniformDensity * d;
  return exp(-tau);
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

// 真上に無限遠までの高さフォグの光学的深さ tau(y) = kappa(y) / f
vec3 tauFromTop(float y) {
  return u_density * expClamped(-u_falloff * (y - u_baseHeight)) / u_falloff;
}

// 点 p から太陽までの高さフォグの透過率。太陽の向き l への無限遠までの光学的深さは tauFromTop(p.y) / l.y。
// 距離フォグは考えない
vec3 sunTransmittance(vec3 p) {
  if (!u_sunAttenuation) return vec3(1.0);
  return exp(-tauFromTop(p.y) / u_lightDir.y);
}

// ---------------------------------------------------------------------------
// 高さフォグと距離フォグが混ざるときの内散乱
// 視線に沿った ∫ T_view(t) kappa(t) ... dt は、T_view = e^{-tau_h(t) - kappa_u t} に距離フォグが入ると
// w = e^{-fv t} の冪乗になって閉じない (不完全ガンマ関数)。そこで平均値の定理で、もう一方のフォグの透過率を積分の外に出す:
//   高さフォグの項 × heightFactor = 1 / (1 + kappa_u t_h)。t_h は高さフォグの光学的深さが 1 になる距離
//     (届かなければ密度の e 倍距離 1 / fv に連続につなぐ、水平なら 1 / k0)。水平なレイで厳密 (kappa_h / (kappa_h + kappa_u))
//   距離フォグの項 × uniformFactor = 1 / (1 + tau_h(t_u))。t_u は距離フォグの内散乱の重み kappa_u e^{-kappa_u t} の [0, d] での平均距離
//   Python の数値積分と比べて最大誤差 0.06 (plain + 距離フォグ 0.005〜0.08、空から急な見下ろしまで)。水平線をまたいで連続
// ---------------------------------------------------------------------------
void fogMixFactors(vec3 c, vec3 rd, float d, out vec3 heightFactor, out vec3 uniformFactor) {
  vec3 k0 = u_density * exp(-u_falloff * (c.y - u_baseHeight)); // カメラ位置の高さフォグの密度
  vec3 fv = u_falloff * rd.y;
  bvec3 isFlat = lessThan(abs(fv), vec3(1e-4));
  vec3 fvSafe = mix(fv, vec3(1.0), vec3(isFlat));
  // 高さフォグの光学的深さが 1 になる距離: (k0 / fv)(1 - e^{-fv t}) = 1 → t = -ln(1 - fv / k0) / fv。
  // 上向きで 1 に届かないレイは、無限遠の光学的深さの 63% (= 密度の e 倍距離 1 / fv) に達する距離へ連続につなぐ。
  // 届く・届かないで式を切り替えると、境目 (rd.y = k0 / f の等高線) が空に線として出る
  vec3 ratio = min(fv / max(k0, vec3(1e-6)), vec3(1.0 - exp(-1.0)));
  vec3 tH = -log(max(1.0 - ratio, vec3(1e-6))) / fvSafe;
  tH = min(mix(tH, 1.0 / max(k0, vec3(1e-6)), vec3(isFlat)), vec3(d));
  heightFactor = 1.0 / (1.0 + u_uniformDensity * tH);

  // 距離フォグの内散乱の重みの平均距離 (切断指数分布の平均) での高さフォグの光学的深さ
  vec3 xd = u_uniformDensity * d;
  bvec3 thin = lessThan(xd, vec3(1e-4));
  vec3 xdSafe = mix(xd, vec3(1.0), vec3(thin));
  vec3 tU = mix(1.0 / max(u_uniformDensity, vec3(1e-6)) - d * exp(-xdSafe) / (1.0 - exp(-xdSafe)), vec3(0.5 * d), vec3(thin));
  vec3 tauH = mix(k0 * (1.0 - expClamped(-fvSafe * tU)) / fvSafe, k0 * tU, vec3(isFlat));
  uniformFactor = 1.0 / (1.0 + min(tauH, vec3(1e4)));
}

// 視線に沿って 2 つのフォグが散乱する量 (高さフォグ a、距離フォグ b)。片方しかなければそのフォグだけ 1
void fogScatterWeights(vec3 c, vec3 rd, float d, out vec3 a, out vec3 b) {
  if (all(equal(u_uniformDensity, vec3(0.0)))) { a = vec3(1.0); b = vec3(0.0); return; }
  if (all(equal(u_density, vec3(0.0)))) { a = vec3(0.0); b = vec3(1.0); return; }
  vec3 hf, uf;
  fogMixFactors(c, rd, d, hf, uf);
  vec3 tauH = heightFogOpticalDepth(c, rd, d, u_density, u_falloff, u_baseHeight);
  a = (1.0 - exp(-tauH)) * hf;
  b = (1.0 - exp(-u_uniformDensity * d)) * uf;
}

// 高さフォグの値 h と距離フォグの値 u を散乱量の比で混ぜる。albedo にも emission (密度に比例するモデル) にも同じ重み
vec3 mixByScatter(vec3 h, vec3 u, vec3 a, vec3 b) {
  return (h * a + u * b) / max(a + b, vec3(1e-6));
}

// 太陽光の位相関数 × π。放射照度 π lightColor にかけると散乱の源 (視線方向へ散乱する放射輝度) になる。
// Henyey-Greenstein で、g = 0 なら 1/(4π) × π = 1/4 (等方)。cosTheta = dot(レイの向き rd, 太陽の向き) で、太陽を見る向きが 1。
// 平行光源は向きが一定なので視線上で定数になり、積分の外に出せる (閉じた式はそのまま)
float sunPhase(float cosTheta) {
  float g = u_phaseG;
  float g2 = g * g;
  return 0.25 * (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * cosTheta, 1e-4), 1.5);
}

// 太陽光の単散乱 (カメラへ)。lightColor × sunPhase × albedo × ∫_0^d T(c, x_t) kappa_h(x_t) T_sun(x_t) dt。
// 積分は閉じて (T_sun(c) - T(c, x_d) T_sun(x_d)) / (1 - rd.y / l.y)。分母が 0 に近い向きでは極限 T_sun(c) tau(c, x_d) を使う。
// 太陽の減衰なし (T_sun = 1) なら 1 - T(c, x_d)。
// 高さフォグだけで、距離フォグは太陽光を散乱しない。T(c, x_t) に距離フォグが入ると閉じないので、距離フォグの透過率は fogMixFactors の hf で積分の外に出す
vec3 sunInscatter(vec3 c, vec3 rd, float d) {
  vec3 tauView = heightFogOpticalDepth(c, rd, d, u_density, u_falloff, u_baseHeight);
  vec3 Tview = exp(-tauView);
  vec3 scatter;
  if (!u_sunAttenuation) {
    scatter = 1.0 - Tview;
  } else {
    vec3 TsunCam = sunTransmittance(c);
    vec3 TsunEnd = sunTransmittance(c + rd * d);
    float den = 1.0 - rd.y / u_lightDir.y;
    scatter = abs(den) < 1e-2 ? TsunCam * tauView : (TsunCam - Tview * TsunEnd) / den;
  }
  vec3 hf, uf;
  fogMixFactors(c, rd, d, hf, uf);
  return u_lightColor * sunPhase(dot(rd, u_lightDir)) * u_albedo * scatter * hf;
}

// フォグの中の点 p から太陽への影 (柱だけ。床は上向きのレイを遮らない)。
// 柱の上端より上なら影はないので歩かない。歩くのも柱の上端までで、サーフェス上ではないので歩数と判定は粗くてよい
float fogShadow(vec3 p) {
  float maxDist = (u_pillarHeight - p.y) / u_lightDir.y;
  if (maxDist <= 0.0) return 1.0;
  float t = 0.0;
  for (int i = 0; i < 24; i++) {
    float h = pillarSdf(p + u_lightDir * t);
    if (h < 0.02) return 0.0;
    t += max(h, 0.1);
    if (t > maxDist) break;
  }
  return 1.0;
}

// 太陽の内散乱を、サンプル点ごとに太陽方向の影 (柱) を見ながら数値積分する (光芒)。
// 被積分関数は sunInscatter と同じ T_view [albedo_h kappa_h T_sun + albedo_u kappa_u] に影の可視性をかけたもの。
// 等間隔の矩形則 S(xi) = Σ_k f((k + xi) dt) dt。開始位置 xi を固定すると影の境界の誤差が隣のピクセルで揃って縞になるので、
// xi をピクセルごとのハッシュでずらす (誤差の大きさは同じで相関が消え、ざらつきになる)。
// さらにフレーム n ごとに xi_n = fract(hash + n φ) (φ = 黄金比の小数部分) と回す。∫_0^1 S(xi) dxi は厳密に積分に一致するので、
// xi_n が [0, 1) に一様に分布すればフレーム平均が積分に近づく。{n φ} は 1 次元の低不一致列で、乱数より均等に散り連続フレームで近い値が出ない
// (本質はジッターすること。黄金比は収束が少し良い選び方で、乱数でも動く)。
// 視線の透過率がほぼ 0 になったら打ち切る。SHADOW_RANGE より先は影を無視して閉じた式 (sunInscatter) に切り替え、手前の透過率をかけて足す。
// 1 ピクセルあたり最大 SHADOW_STEPS 本の影のレイを飛ばすので重い。Playground の resolution で調整する。
// R はノイズの平均 (ノイズなしなら 1)。合成で視線の透過率を T^R にしているのと揃えて、march の中でも濃さに R をかけ、
// 視線の透過率を T^R にする (視線 1 本で 1 つの値なので、光芒の筋の中にムラの形は出ない。筋全体が明るくなったり暗くなったりするだけ)。
// 太陽への透過率はノイズを見ない (閉じた式側と同じ)
const int SHADOW_STEPS = 32;
const float SHADOW_RANGE = 48.0;
vec3 sunInscatterShadowed(vec3 c, vec3 rd, float d, vec2 pix, vec3 R) {
  float tEnd = min(d, SHADOW_RANGE);
  float dt = tEnd / float(SHADOW_STEPS);
  float jitter = fract(hash21(pix) + 0.618034 * u_frame);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < SHADOW_STEPS; i++) {
    float t = (float(i) + jitter) * dt;
    vec3 p = c + rd * t;
    vec3 Tview = pow(fogTransmittance(c, rd, t), R);
    if (max(Tview.r, max(Tview.g, Tview.b)) < 0.005) break;
    float vis = fogShadow(p);
    if (vis <= 0.0) continue;
    vec3 kappaH = R * u_density * exp(-u_falloff * (p.y - u_baseHeight));
    sum += Tview * u_albedo * kappaH * sunTransmittance(p) * (vis * dt);
  }
  vec3 result = u_lightColor * sunPhase(dot(rd, u_lightDir)) * sum;
  if (d > tEnd) {
    vec3 pEnd = c + rd * tEnd;
    result += pow(fogTransmittance(c, rd, tEnd), R) * sunInscatter(pEnd, rd, d - tEnd);
  }
  return result;
}

// 面の環境光にフォグを単散乱で適用する。半球の各方向で「空の光が透過する分 T L_a」(u_skyAttenuation) と
// 「フォグの内散乱 w L_a (1 - T)」(u_skyInscatterAmbient) を足すと L_a (1 - (1 - w)(1 - <T>)) になる
// (albedo = 1 なら変わらない。吸収がある分だけ暗くなる)。<T> は半球の cos 重み付き平均透過率。
// <T> の積分は閉じないので、空へ向かう代表方向 1 本 (仰角 cos = 2/3) の透過率で代表する。
// 上向きの面の <T> = 2 E3(tau) を exp(-1.5 tau) で近似する diffusivity factor で、数値積分でも上向きの面はよく合う。
// 側面は本当は下半分が地面まで濃いフォグを通るので暗めになるはずだが、地面やシーンの仮定を持ち込まないために同じ T を使う
// 距離フォグは含めない (空まで無限に続くので T = 0 になってしまう)。albedo は高さフォグのもの
const vec3 SKY_DIR = vec3(0.0, 2.0 / 3.0, 0.745356); // 長さ 1、y = 2/3
vec3 skyTransmittance(vec3 p) {
  return exp(-tauFromTop(p.y) / SKY_DIR.y);
}

// 太陽光がフォグで 1 回散乱して面に届く分 (これも単散乱)。同じ代表方向で太陽の内散乱を積分する。
// u_sunInscatterAmbient で切り替える (太陽→フォグ→サーフェスの経路なので、空の光の扱いとは独立)
vec3 sunInscatterAmbient(vec3 p) {
  return sunInscatter(p, SKY_DIR, 1e5);
}

// ---------------------------------------------------------------------------
// ノイズ (Pickles Note の Noise)
// 消散係数にノイズをかける: kappa~(p) = r(p) kappa(p)、r: R^3 -> [0, 1]。
// 光学的深さは tau~ = ∫ r kappa dt = R_bar tau で厳密 (R_bar は視線に沿った kappa 重み付きのノイズ平均)。
// tau は閉じた式のまま使い、R_bar だけサンプルで見積もる。T~ = exp(-R_bar tau) = T^R_bar
// ---------------------------------------------------------------------------
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// 3D バリューノイズ。格子の z をワールドの周期 (CELL * PERIOD_CELLS) で巻いて、カメラ座標の巻き戻しで絵が飛ばないようにする
float valueNoise(vec3 p, float periodZ) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float z0 = mod(i.z, periodZ);
  float z1 = mod(i.z + 1.0, periodZ);
  float n000 = hash31(vec3(i.xy, z0)),            n100 = hash31(vec3(i.x + 1.0, i.y, z0));
  float n010 = hash31(vec3(i.x, i.y + 1.0, z0)),  n110 = hash31(vec3(i.xy + 1.0, z0));
  float n001 = hash31(vec3(i.xy, z1)),            n101 = hash31(vec3(i.x + 1.0, i.y, z1));
  float n011 = hash31(vec3(i.x, i.y + 1.0, z1)),  n111 = hash31(vec3(i.xy + 1.0, z1));
  float nx00 = mix(n000, n100, f.x), nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x), nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}

// 3 オクターブの fbm (振幅 0.5, 0.25, 0.125) を [0, 1] に正規化し、mix(noiseMin, noiseMax, fbm) を返す。
// 周波数は z 方向にワールドの周期で割り切れる値に丸める (周期 512 に対して 1 / 512 刻み)。
// 流れは上向き (z をずらすと周期の巻きが崩れるので z には付けない)
float fogNoise(vec3 p) {
  float worldPeriod = CELL * PERIOD_CELLS;
  float cellsZ = max(round(u_noiseScale * worldPeriod), 1.0);
  float freq = cellsZ / worldPeriod;
  // 模様を上に流すにはルックアップ位置を下にずらす
  vec3 q = (p - vec3(0.0, 1.0, 0.0) * u_noiseSpeed * u_time) * freq;
  float n = 0.5 * valueNoise(q, cellsZ) + 0.25 * valueNoise(q * 2.0, cellsZ * 2.0) + 0.125 * valueNoise(q * 4.0, cellsZ * 4.0);
  return mix(u_noiseMin, u_noiseMax, n / 0.875);
}

// レイに沿った kappa 重み付きのノイズ平均 R_bar(c, x_d) = ∫ r kappa dt / ∫ kappa dt を数値積分で見積もる。
// サンプル点 t_k = 1 + 1.4^k (k = 0 は t = 1) はカメラの近くに固め、各点の重みは kappa(x_{t_k}) × 受け持つ区間 [t_{k-1}, min(t_k, d)] の幅。
// 等間隔 t_k = d k / N にするとサンプル位置がサーフェスまでの距離で決まり、模様がサーフェスと一緒に動いて見える
const int NOISE_SAMPLES = 10;
const float NOISE_STEP_EXP = 1.4;
vec3 noiseMean(vec3 c, vec3 rd, float d) {
  vec3 sum = vec3(0.0);
  vec3 wsum = vec3(0.0);
  float t = 1.0;
  float tPrev = 0.0;
  float step = NOISE_STEP_EXP;
  for (int k = 0; k < NOISE_SAMPLES; k++) {
    vec3 p = c + rd * t;
    vec3 kappa = u_density * exp(-u_falloff * (p.y - u_baseHeight)) + u_uniformDensity + vec3(1e-6);
    vec3 w = kappa * (min(t, d) - tPrev); // 区間 [tPrev, t] のうち d までの幅
    sum += w * fogNoise(p);
    wsum += w;
    if (t > d) break;
    tPrev = t;
    t = 1.0 + step;
    step *= NOISE_STEP_EXP;
  }
  return sum / wsum;
}

// 太陽の円。視線と太陽の向きの角度で描き、縁は少しだけぼかす。円の大きさは見た目で決めた (実際の太陽は半径 0.27 度)
const float SUN_RADIUS = radians(1.5);
const float SUN_SOFT = radians(0.3);
float sunDisc(vec3 rd) {
  float angle = acos(clamp(dot(rd, u_lightDir), -1.0, 1.0));
  return 1.0 - smoothstep(SUN_RADIUS - SUN_SOFT, SUN_RADIUS, angle);
}

vec3 shade(vec3 p, vec3 n) {
  float diff = max(dot(n, u_lightDir), 0.0);
  float sh = shadow(p + n * 0.02, u_lightDir);
  vec3 sun = u_lightColor * sunTransmittance(p);
  vec3 ambient = u_ambient;
  if (u_skyAttenuation || u_skyInscatterAmbient || u_emissionAmbient) {
    vec3 T = skyTransmittance(p);
    if (u_skyAttenuation) ambient = u_ambient * T;
    if (u_skyInscatterAmbient) ambient += u_ambient * u_albedo * (1.0 - T);
    // 発光するフォグに囲まれたサーフェスには全方向から発光が届く。視線の内散乱と同じ形で代表方向の (1 - T) を重みにする。
    // 距離フォグの発光は空まで無限に続いて T = 0 になるので含めない (albedo と同じ割り切り)
    if (u_emissionAmbient) ambient += u_emission * (1.0 - T);
  }
  if (u_sunInscatterAmbient) ambient += sunInscatterAmbient(p);
  return surfaceAlbedo(p) * (diff * sh * sun + ambient);
}

vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
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
  // ノイズは視線の透過率にかける (T~ = T^R_bar)。光芒の march にも同じ R を渡す。閉じた式の太陽の内散乱とサーフェスの環境光はノイズを見ない
  vec3 R = u_noise ? noiseMean(ro, rd, d) : vec3(1.0);
  T = pow(T, R);
  // 内散乱 = 環境光 × 散乱アルベド × (1 - T) + 太陽の単散乱。
  // 高さフォグと距離フォグで albedo や emission が違うときは、散乱する量の比で混ぜる
  vec3 sunIn = u_sunInscatter ? (u_sunInscatterShadow ? sunInscatterShadowed(ro, rd, d, gl_FragCoord.xy, R) : sunInscatter(ro, rd, d)) : vec3(0.0);
  if (u_fogMixMode != 0) {
    // 比較用: 2 つのフォグを順番に合成する。透過率の積は正しいが、先に合成したフォグの内散乱が後のフォグの透過率で丸ごと減衰する。
    // 高さ→距離なら近くの高さフォグまで距離フォグの色に染まり、距離→高さなら遠くの距離フォグまで高さフォグの色に染まる
    vec3 Th = pow(exp(-heightFogOpticalDepth(ro, rd, d, u_density, u_falloff, u_baseHeight)), R);
    vec3 Tu = pow(exp(-u_uniformDensity * d), R);
    vec3 fogH = u_ambient * u_albedo + u_emission;
    vec3 fogU = u_ambient * u_uniformAlbedo;
    if (u_fogMixMode == 1) {
      col = mix(fogH, col, Th);
      col = mix(fogU, col, Tu);
    } else {
      col = mix(fogU, col, Tu);
      col = mix(fogH, col, Th);
    }
    col += sunIn;
  } else {
    vec3 wa, wb;
    fogScatterWeights(ro, rd, d, wa, wb);
    vec3 inscatter = u_ambient * mixByScatter(u_albedo, u_uniformAlbedo, wa, wb) * (1.0 - T) + sunIn;
    // 発光は高さフォグだけ (距離フォグの発光は ambient に含まれる) なので、散乱量の比で高さフォグの分だけ乗せる
    col = col * T + inscatter + mixByScatter(u_emission, vec3(0.0), wa, wb) * (1.0 - T);
  }
  // 太陽の円は高さフォグだけで減衰させる。距離フォグの色は ambient そのもので空に合成しても空は変わらないので、
  // 空にかかるのは高さフォグだけ。太陽の円も同じ扱いにする
  if (hit < 0.0) {
    vec3 Th = exp(-heightFogOpticalDepth(ro, rd, d, u_density, u_falloff, u_baseHeight));
    col += u_lightColor * sunDisc(rd) * Th;
  }

  // 計算はリニアで、出力で sRGB にエンコードする。入力の色は renderer が sRGB -> リニアに変換して渡している
  // (Unity のリニアワークフローと同じ)。1 を超えた分はクリップ (トーンマッピングなし)
  fragColor = vec4(linearToSrgb(col), 1.0);
}
