# CLAUDE.md

ゆるゆるシェーダー交流会 #2 の LT「指数関数高さフォグ」のインタラクティブスライドと Playground。
発表内容の方針は README.md を正とする（難しいことは説明しない、導出は出さない、パラメータを RGB ごとに変えると面白い）。

## コマンド

```
npm run dev      # 開発サーバー
npm run build    # tsc --noEmit && vite build
glslangValidator src/fog/glsl/fullscreen.vert src/fog/glsl/fog.frag   # シェーダーの検証
```

- シェーダーを触ったら必ず glslangValidator を通す（ビルドでは検証されない）
- `main` への push で GitHub Actions が GitHub Pages にデプロイする（.github/workflows/deploy.yml）
- 公開 URL: https://shivaduke28.github.io/yuruyuru-shader-meetup/
  （トップ / slides.html / play.html）

## 構成

```
index.html        トップ。スライドと Playground へのリンク
slides.html       スライド (src/slides/)
play.html         Playground (src/play/)
src/fog/          スライドと Playground が共有する部分
  glsl/fog.frag   フルスクリーンレイマーチ + 指数関数高さフォグ。主役の関数は heightFogOpticalDepth
  glsl/fullscreen.vert
  params.ts       FogParams (density/falloff/baseHeight/uniformDensity/ambient/albedo/emission、すべて Vec3) と Camera
  renderer.ts     WebGL2 の描画ループ、カメラ、ドラッグ・ホイール操作
  controls.ts     Tweakpane のバインディング。controlPresets にスライダーの定義
src/slides/
  slides.ts       スライドの定義（title / side / body / params / controls / randomize）
  main.ts         ページ送り、トゥイーン、枠への自動縮小
src/style.css     スライド・Playground・トップのスタイル
```

## 設計上の決めごと

### スライドのレイアウト

- ステージは 1920×1080 の固定キャンバス。px で設計し、ウィンドウに合わせて JS で一様に zoom する
- 枠は 5 つ（見出し / デモ / 右カラム / 本文 / ページ番号）で、位置と大きさはページによらず固定
- 右カラム（コード + スライダー）と本文は `fitToBox` で「基準サイズで描き、枠からはみ出すなら入るまで一様に縮小」する。
  コードは幅だけで縮め、スライダーを道連れにしない。カラム全体の縮小は高さが溢れたときだけ
- したがって中身の量に応じた px や vh の予算計算はしない。見やすさを保ちたければ中身を減らす
- コードブロックは折り返さない（長い行は縮小で収める）
- レイアウトは 2 種類: `demo`（見出し + デモ + 右カラム + 本文）と `text`（見出し + 本文）。text でも本文はデモと同じ上端から始める

### パラメータの扱い

- FogParams の配列を `Object.assign` で差し替えない。Tweakpane が配列を参照しているので壊れる。必ず `assignParams` で値を書き込む
- スライドでは `live`（描画に使う値）と `target`（目標値）を分け、`target` が変わると 0.6 秒の ease-in-out で `live` を寄せる。
  スライダーの表示は `live`、操作は `target` に書く。スライダー操作時はトゥイーンせず即反映
- Tweakpane の `refresh()` は change イベントを同期で投げる。`refreshing` フラグの間はユーザー操作として扱わない
- `ambient` は環境光で、面のアンビエントにもフォグの内散乱にも使う。`albedo` はフォグの散乱アルベド (RGB、0..1)。
  フォグの色 = `ambient * albedo + emission`（Pickles の `Ls * scatteringAlbedo + _Emission` と同じ形）。発光は面のアンビエントには足さない
- 発光を散乱と同じ重みで足すのは、エミッションを密度に比例させたモデル（L_e = E·κ）として読めば厳密
- 配色は環境光が暗めのグレー (0.25)、太陽が暖色で環境光より明るい (1.6, 1.45, 1.2)、面の反射率 0.6。環境光が明るいと日の当たる面が白飛びし、フォグと影の差も消える
- 高さフォグのスライド 11〜14 は `plain` を基準に 1 枚 1 パラメータだけ変える（`heightVariation` に変えるものだけ渡す）
- renderer のフラグは `lightAttenuation`（面に届く太陽光の減衰）、`sunScatter`（太陽光の内散乱）、`ambientFog`（面の環境光にフォグを単散乱で適用）、`twoStream`（環境光の多重散乱）の 4 つ。
  スライドは単散乱の段で揃える: `fogAmbient`（= ambientFog）と `fogSun`（= lightAttenuation + sunScatter をまとめて）で切り替え、指定したスライドにはトグルのカードが出る。
  太陽の減衰・カメラへの内散乱・面への内散乱（`ambientFog` のとき、代表方向で `sunInscatter` を積分して環境光に足す。太陽→フォグ→面はフォグの散乱 1 回なので単散乱）は
  エネルギーの帳尻が合うように必ずまとめてオンオフする。`twoStream` は Playground 専用（スライドでは常に false）
- 面の環境光にフォグを単散乱で適用すると `ambient * (1 - (1 - albedo)(1 - <T>))`。<T> は空へ向かう代表方向 1 本（仰角 cos = 2/3、diffusivity factor）の透過率で代表し、面の向きは見ない。
  検討してボツにした案: 半球を上下に割って下半分に床までの透過率（床が y = 0 にあるこのデモでしか使えない）、
  下半分を T = 1（側面の沈みが消えて物足りない）、法線方向と空方向の T の平均（側面の法線サンプルが水平で T = 0 になり薄いフォグでも側面が暗い）、
  方向を平均してから T（exp の凸性で暗すぎ）。側面を正しくするには地面の高さが要るので、シンプルさを優先して 1 本にしたalbedo = 1 なら変わらない。
  深いところが暗くなる「床の吸収をフォグが映す」効果は多重散乱なので単散乱には出ない
- 既定のモデルでは太陽はフォグの内散乱に入っていない（「全方向から同じ色で当たる」前提で ambient に丸め込んでいる）。`sunScatter` は等方散乱で lightColor / 4 を源にし、減衰ありなら s = −1 / L.y のモード積分（fog.frag の `modeIntegral`）で深さ減衰をつける
- 2 ストリームがオンのときは太陽も 2 ストリームの源項（特解 e^{−τ/L.y}、床の境界条件に直達光の反射）として扱い、`sunScatter` の単散乱は別に足さない。λ = 1/L.y（albedo ≈ 0.49）で特解が共鳴するので行列式を 0 から離している。
  閉じた式は ODE と境界条件を Python の差分で検算済み。太陽ありだとフォグの中の放射が 0.7〜0.9 程度になり、ほぼ白く見えるのはモデルどおり
- 2 ストリーム近似（fog.frag の `twoStream*`）は高さフォグを平行平板とみなし、上端から ambient、床（y = 0、反射率 0.6）で反射する境界条件で解く。
  内散乱の積分も閉じた形（モードごとに (e^{sτcam} − T e^{sτend}) / (1 + s rd.y)）。albedo は 0.99 に丸める（1 だと退化）。
  終点の高さは床で止める（FAR を超えて床に届かなかったレイを d = 1e5 のまま入れると inf − inf で NaN になる）
- スライドのコードでは `fogColor = ambient * albedo`。距離フォグのスライドで一度書き、以降は `fogColor` で済ませる

### シーン

- y = 0 の床 + xz に 8 間隔で並ぶ高さ固定の柱。柱はセル中央で対称なので mod で繰り返しても SDF は正しい（高さをセルごとに変えるならグリッドトラバーサルが必要になる）
- カメラは +z に進み続ける。柱の列は x = 4 + 8k なので、初期位置は x = 0（列の間）
- ライトは順光（カメラの後ろ上）、ハードシャドウ。影のレイには最小歩幅を入れて表面すれすれでの stall を防ぐ

### 文言

- スライドの文章は素直な言い回しにする。凝った比喩や「ゼロ割り」「崩す」「層」のような言い方は避ける。「霧」は使わず「フォグ」、「面」は使わず「サーフェス」で統一
- コードは GLSL 準拠（`mix`、`vec3`）
- 見出しは「距離フォグ」「指数関数高さフォグ」「シェーダーコード」「発光」のように短く

## 参考資料

- 元ネタのブログと数式の詳細（Pickles Note の Gist）は README.md のリンク
- Pickles 本体（Unity 用シェーダー）は別リポジトリ。実装を確認したいときはローカルの Pickles リポジトリを参照する

## 作業の進め方

- レイアウトや見た目を変えるときは、先に設計（どの枠に何が入り、増えたらどうなるか）を文章で示してから実装する。場当たりの数値調整をしない
- ファイルの一部を置換するときは、置換前の文字列がファイル内に 1 回だけ現れることを確認してから行う
- 見た目の最終確認は shivaduke が `npm run dev` で行う。ヘッドレスのスクリーンショットは求められたときだけ
