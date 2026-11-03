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
uniform vec3 u_fogColor;       // 内散乱に使う定数光
uniform vec3 u_emission;       // フォグ自体が発する光

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
// シーン: y = 0 の床 + xz のセルごとに高さの違う柱
// セルごとの SDF をグリッドトラバーサルで進める (参考: https://scrapbox.io/0b5vr/Shader:_Grid_Traversal)
// ---------------------------------------------------------------------------
const float CELL = 7.0;
const float PILLAR_HALF_WIDTH = 0.7;
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

float pillarHeight(vec2 cellCenter) {
  return 3.0 + 10.0 * hash21(cellCenter / CELL);
}

vec2 cellCenterOf(vec2 xz) {
  return floor(xz / CELL + 0.5) * CELL;
}

// セル内だけを見た SDF: 床 + そのセルの柱
float mapCell(vec3 p, vec2 cellCenter) {
  float h = pillarHeight(cellCenter);
  vec2 q = p.xz - cellCenter;
  float pillar = sdBox(vec3(q.x, p.y - h * 0.5, q.y), vec3(PILLAR_HALF_WIDTH, h * 0.5, PILLAR_HALF_WIDTH));
  return min(p.y, pillar);
}

float mapScene(vec3 p) {
  return mapCell(p, cellCenterOf(p.xz));
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(1e-3, 0.0);
  return normalize(vec3(
    mapScene(p + e.xyy) - mapScene(p - e.xyy),
    mapScene(p + e.yxy) - mapScene(p - e.yxy),
    mapScene(p + e.yyx) - mapScene(p - e.yyx)));
}

// セルの境界で止まりながらレイマーチする。当たらなければ -1
float raymarch(vec3 ro, vec3 rd, float maxDist, float minStep) {
  // rd.xz が 0 だと 1/rd が inf になるので、ごく小さい値に逃がす
  vec2 dxz = mix(rd.xz, vec2(1e-6), vec2(lessThan(abs(rd.xz), vec2(1e-6))));
  vec2 invDir = 1.0 / dxz;
  float t = 0.0;
  for (int i = 0; i < 128; i++) {
    vec3 p = ro + rd * t;
    // 境界上の点が入る側のセルに入るよう、進行方向に少しずらして判定する
    vec2 center = cellCenterOf(p.xz + dxz * 1e-3);
    float h = mapCell(p, center);
    if (h < 1e-3 * max(1.0, t)) return t;
    // セルの各面までの距離。最小が境界までの距離
    vec2 exitT = abs(0.5 * CELL * invDir) - (p.xz - center) * invDir;
    float tExit = min(exitT.x, exitT.y);
    t += max(min(h, tExit + 2e-3), minStep);
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

vec3 shade(vec3 p, vec3 n) {
  float diff = max(dot(n, LIGHT_DIR), 0.0);
  float sh = shadow(p + n * 0.02, LIGHT_DIR);
  // アンビエント光 = フォグを照らしている一定の光なので u_fogColor をそのまま使う
  return vec3(0.8) * (diff * sh + u_fogColor);
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
    col = vec3(0.0);
    d = 1e5; // 無限遠扱い。rd.y <= 0 なら tau は発散して T -> 0
  }

  vec3 T = fogTransmittance(ro, rd, d);
  // 散乱で入ってくる光 (fogColor) に、フォグ自体が発する光 (emission) を足す。面のアンビエントには足さない
  col = mix(u_fogColor + u_emission, col, T);

  col = pow(col, vec3(1.0 / 2.2));
  fragColor = vec4(col, 1.0);
}
