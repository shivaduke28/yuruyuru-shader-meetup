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
  params.ts       FogParams (density/falloff/baseHeight/uniformDensity/ambient/albedo/emission/lightColor の Vec3 と sunIntensity) と Camera
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

### Playground のペイン

- 上のカード（preset / resolution / Reset）は固定、下のカードは `max-height: calc(100vh - 32px)` の中でスクロールする。フォルダが増えても設計は変えない
- resolution は物理ピクセルに対する倍率の選択式（x1 / x1/2 / x1/4）。4K のような絶対値にしないのは、ウィンドウの大きさと devicePixelRatio で同じラベルの意味が変わるから
- フォルダの並びはスライドの流れ: Distance Fog → Height Fog → Lights → Noise → Scene → Camera
- 光との相互作用のトグル 7 つ（sky attenuation / sky inscatter ambient / sun attenuation / sun inscatter / sun inscatter ambient / sun inscatter shadow / emission ambient）は全部高さフォグのものなので Height Fog に置く。
  名前は renderer のフラグと同じで、「光源 × 計算」をそのまま書く: attenuation = サーフェスに届くその光に透過率をかける、inscatter = その光の内散乱をカメラに足す、
  「〜 ambient」= サーフェスの環境光の項に足す。環境光は光源としては sky と呼ぶ（空の色 = ambient で、T も空へ向かう方向で計算するため。足す先の項の ambient と区別する）。
  以前の fog on ambient / fog on sun（何の計算か読めない）、ambient through fog / sunlit fog（現象の言い回しで中身が消える）はやめた
  Distance Fog は density だけ（光と相互作用しない）、Lights は光源の色と向きだけ。以前は Ambient Light / Sun Light のフォルダにトグルを分けて置いていたが、
  「fog on 〜」の fog がどちらのフォグか読めず、光源の設定とモデルの設定が混ざって見えたのでやめた
- preset はフォグのパラメータとトグルを決める（Scene / Noise / Camera は触らない）。Reset は Camera も含めて全部を既定に戻す（resolution は絵ではなく機械の都合なので触らない）
- 説明はツールチップ（title 属性、controls.ts の `withHelp` / `folderHelp`、スライダーは `controlPresets` の `help`）。Tweakpane にヘルプの仕組みがないのでブラウザ標準のもので代え、ペインを縦に伸ばす説明行は置かない。
  フォルダはタイトル行だけに付ける（フォルダ全体に付けると中のコントロールにも出る）

### パラメータの扱い

- FogParams の配列を `Object.assign` で差し替えない。Tweakpane が配列を参照しているので壊れる。必ず `assignParams` で値を書き込む
- スライドでは `live`（描画に使う値）と `target`（目標値）を分け、`target` が変わると 0.6 秒の ease-in-out で `live` を寄せる。
  スライダーの表示は `live`、操作は `target` に書く。スライダー操作時はトゥイーンせず即反映
- Tweakpane の `refresh()` は change イベントを同期で投げる。`refreshing` フラグの間はユーザー操作として扱わない
- `ambient` は環境光で、面のアンビエントにもフォグの内散乱にも使う。`albedo` は高さフォグの散乱アルベド (RGB、0..1)。
  距離フォグにはアルベドがない（アルベド 1 固定）。無限に広がる一様フォグでは空の色 = フォグの色なので、距離フォグの色は `ambient` そのもの。
  以前は `uniformAlbedo` と `uniformEmission` があったが、空（ambient）とフォグ色（ambient × albedo + emission）が食い違って太陽の円が消えるなどの歪みが出たので削除した（コミット 0f465f1 まで残っている）。
  同じ理屈で、無限に広がる一様フォグの中ではサーフェスに届く環境光 = フォグの放射なので、距離フォグの発光も ambient に含まれる。距離フォグのパラメータは density だけ。
  空に距離フォグを合成しても ambient × T + ambient × (1 − T) = ambient で変わらないので、空は距離フォグの影響を受けない。高さフォグは空にも適用する（地平線に近いほど沈む）
  両方あるときは視線に沿って散乱する量の比で混ぜる (fog.frag の `fogScatterWeights` + `mixByScatter`、`fogMixFactors` の近似を使う)。
  `emission` は高さフォグの発光で、距離フォグと混ざるときは albedo と同じ重みで高さフォグの分だけ乗せる。
  フォグの色 = `ambient * albedo + emission`。
  発光は既定では面のアンビエントに足さない。renderer の `emissionAmbient`（Playground の emission ambient）を入れると、空へ向かう代表方向の `emission * (1 - T)` を足す（高さフォグのみ）
- 発光を散乱と同じ重みで足すのは、エミッションを密度に比例させたモデル（L_e = E·κ）として読めば厳密
- 色空間は Unity のリニアワークフローと同じ。FogParams の色（ambient / albedo / emission / lightColor）と Tweakpane のカラーピッカーは sRGB で、
  renderer が `srgbToLinear` でリニアに変換してシェーダーに渡す。シェーダーはリニアで計算し、最後に `linearToSrgb` で sRGB にエンコードして出す（トーンマッピングなし、1 超はクリップ）。
  これでピッカーの色見本とフォグなしの空の色が一致する。1 を超える明るさは色では持たず、太陽は色（0..1）× `sunIntensity` に分ける（Unity の HDR カラーの intensity と同じ）。
  シェーダー内の定数（サーフェスの反射率 0.6、colorful の HSV）はリニアのまま
- 配色は環境光が暗めのグレー (sRGB 0.54、リニア 0.25)、太陽が暖色で環境光より明るい (色 (1, 0.96, 0.88) × 強さ 1.6。リニアで (1.6, 1.45, 1.2))、面の反射率 0.6。環境光が明るいと日の当たる面が白飛びし、フォグと影の差も消える
- 高さフォグのスライド 11〜14 は `plain` を基準に 1 枚 1 パラメータだけ変える（`heightVariation` に変えるものだけ渡す）
- renderer のフラグは 7 つで、UI のトグルと 1 対 1:
  `skyAttenuation`（サーフェスの環境光 × 空方向の透過率）、`skyInscatterAmbient`（空の光がフォグで散乱して届く分 ambient × albedo × (1 − T) を環境光に足す。両方で ambient × T + ambient × albedo × (1 − T)）、
  `sunAttenuation`（サーフェスに届く太陽光 × 太陽方向の透過率）、`sunInscatter`（太陽光のカメラへの内散乱）、
  `sunInscatterAmbient`（太陽光の内散乱を代表方向で積分して環境光に足す。fog.frag の `sunInscatterAmbient`。太陽→フォグ→サーフェスはフォグの散乱 1 回なので単散乱）、
  `sunInscatterShadow`（太陽の内散乱で柱の影を見る光芒。`sunInscatter` のときだけ効く）、`emissionAmbient`（フォグの発光を環境光に足す。Playground のみ）。
  エネルギーの帳尻を合わせるなら空の 2 つ、太陽の 3 つはそれぞれ揃えて入れる。
  スライドの定義は現象ごとで、`fogAmbient` で空の 2 つ、`fogSun` で太陽の 3 つをまとめてオンにし、`sunShadow` が `sunInscatterShadow`。トグルはフラグごとに出る。
  以前は環境光の 1 フラグ（ambientFog）のときだけ太陽の内散乱も環境光に足していたが、環境光のトグルが太陽の設定として振る舞って見えるので分けた
- 既定のモデルでは太陽はフォグの内散乱に入っていない（「全方向から同じ色で当たる」前提で ambient に丸め込んでいる）。`sunInscatter` は等方散乱で lightColor / 4 を源にし、減衰ありなら s = −1 / L.y のモード積分（fog.frag の `modeIntegral`）で深さ減衰をつける
- 距離フォグは太陽に一切関与しない。減衰させない（無限に広がる一様フォグは太陽を完全に遮るので割り切り）し、太陽光を散乱もしない（一様フォグの放射は ambient に含まれる）。
  以前は距離フォグの散乱 (1 − e^{−κ_u d}) も足していたが、サーフェスへの内散乱（d = ∞）で密度に関わらず lightColor / 4 に飽和し、環境光と太陽のトグルを両方入れて距離フォグがあるとサーフェスが 2.5 倍明るく跳ね、空も ambient でなくなるので外した。
  太陽の内散乱は高さフォグの項だけだが、視線の透過率には距離フォグを入れる。e^{−κ_u t} が入ると閉じないので、距離フォグの透過率を代表距離で積分の外に出す近似にする（fog.frag の `fogMixFactors` の heightFactor。数値積分と比べて最大誤差 0.06）。
  スライドは距離フォグ 0 なので厳密。数値積分版（中点則 64 ステップ）も一度入れて見比べたが差が小さいので外した
- ノイズ（renderer の `noise` / `noiseScale` / `noiseMin` / `noiseMax` / `noiseSpeed`、Playground の Noise）は Pickles Note の Noise の通り、消散係数に r = mix(min, max, fbm) をかけて τ̃ = R̄·τ とする。
  τ は閉じた式のまま、R̄（視線に沿った κ 重み付きのノイズ平均）だけをサンプルで見積もる。サンプルは d_k = 1 + 1.4^k（10 本、約 22 まで）でカメラの近くに固め、重みは κ だけ。
  d を超えた最初の 1 本は区間のうち d までの割合で lerp して入れる。試してボツにした案: 等比区間の中点で κ × 区間幅の重み（遠い区間が重くなり床の近くのサンプルが支配してサーフェスに張り付く）、終点 d でのサンプル（同じ理由で張り付く）、等間隔（Gist の注意）。
  Gist の LV の求積を κ の測度に置き換えた案（光学的深さが等分になる位置に等重みで置く。位置は閉じた式 + ニュートン法で逆算、上限は定数 τ = 4.6）も一度入れて見比べたが、上の方式のほうが見た目が良かったので削除した。
  視線の透過率にだけかける（T̃ = T^R̄）。太陽の内散乱・サーフェスの環境光・光芒の march は閉じた式のまま。
  ノイズは 3 オクターブの 3D バリューノイズ（振幅 0.5 / 0.25 / 0.125）で、z の格子をワールドの周期 512 で巻いてカメラ座標の巻き戻しで絵が飛ばないようにする（周波数は 1/512 刻みに丸める）。流れは上向きだけ（z に付けると巻きが崩れる）
- `sunInscatterShadow` は視線を 32 ステップ（48 単位まで、ピクセルごとのハッシュでずらす）レイマーチして、各点から太陽への影のレイを飛ばして `sunInscatter` と同じ被積分関数を数値積分する（fog.frag の `sunInscatterShadowed`）。
  影のレイは柱だけを見る専用の粗い march（`fogShadow`、24 歩、柱の上端まで。柱より上なら歩かない）。視線の透過率が 0.005 を切ったら打ち切る。
  48 単位より先は影を無視して閉じた式に切り替える。サーフェスへの内散乱（`sunInscatterAmbient`）は影を見ない
- 2 ストリーム近似（平行平板の多重散乱、太陽の特解込み、差分法で検算済み）は一度入れたが、使う場所がなくなったので削除した。必要ならコミット 12aac24 の fog.frag を参照
- 面の環境光にフォグを単散乱で適用すると `ambient * <T> + ambient * albedo * (1 - <T>)`（まとめると `ambient * (1 - (1 - albedo)(1 - <T>))` だが、スライドも UI も 2 項のまま書く。まとめた形は読みにくい）。<T> は空へ向かう代表方向 1 本（仰角 cos = 2/3、diffusivity factor）の透過率で代表し、面の向きは見ない。
  検討してボツにした案: 半球を上下に割って下半分に床までの透過率（床が y = 0 にあるこのデモでしか使えない）、
  下半分を T = 1（側面の沈みが消えて物足りない）、法線方向と空方向の T の平均（側面の法線サンプルが水平で T = 0 になり薄いフォグでも側面が暗い）、
  方向を平均してから T（exp の凸性で暗すぎ）。側面を正しくするには地面の高さが要るので、シンプルさを優先して 1 本にしたalbedo = 1 なら変わらない。
  深いところが暗くなる「床の吸収をフォグが映す」効果は多重散乱なので単散乱には出ない
- `modeIntegral` は視線に沿った ∫ T κ e^{sτ} dt の閉じた形（(e^{sτcam} − T e^{sτend}) / (1 + s rd.y)、1 + s rd.y = 0 は極限に切替）。
  終点の高さは床で止める（FAR を超えて床に届かなかったレイを d = 1e5 のまま入れると inf − inf で NaN になる）
- スライドのコードでは、距離フォグで `fogColor = ambient`、高さフォグの式のスライドで `fogColor = ambient * albedo` を書き、以降は `fogColor` で済ませる。
  透過率は `T` と書く。生の `exp(-density * dist)` は距離フォグの定義の 1 回だけで、高さフォグは `heightFogTransmittance(pos, dir, dist)` を定義して以降はそれを呼ぶ（`exp(-fog)` のような生の式を繰り返さない）。
  高さ y での濃さは `fogDensity`。太陽の内散乱は `sunInscatter(pos, dir, dist)`

### シーン

- y = 0 の床 + xz に 8 間隔で並ぶ高さ固定の柱（幅と高さは renderer の `pillarHalfWidth` / `pillarHeight`。既定 0.7 / 12。Playground の Scene で変えられる）。柱はセル中央で対称なので mod で繰り返しても SDF は正しい（高さをセルごとに変えるならグリッドトラバーサルが必要になる）
- カメラは +z に進み続ける。柱の列は x = 4 + 8k なので、初期位置は x = 0（列の間）
- 空は環境光 + 太陽の円（fog.frag の `sunDisc`、半径 1.5 度、色は lightColor）。既定の太陽はカメラの後ろなので、Playground で azimuth を 0 付近にすると見える。
  太陽の円は高さフォグだけで減衰させる（太陽の減衰と同じ割り切り。空は d = 1e5 なので距離フォグを入れると密度がいくら小さくても消える）。空の地の色は距離フォグ込みで沈む
- ライトは既定で順光（カメラの後ろ上、(0.3, 0.7, −0.6)）、ハードシャドウ。影のレイには最小歩幅を入れて表面すれすれでの stall を防ぐ。
  向きは renderer の `sunAzimuth` / `sunElevation`（度）で `u_lightDir` に渡す。仰角は 5 度を下限にする（0 だと太陽の透過率やフォグの影の式が発散する）。Playground の Sun で回せる。スライドは `sun: { azimuth, elevation }` で 1 枚だけ変えられる（光芒のスライドは逆光気味、方位 25 度・仰角 22 度）。太陽の向きはトゥイーンしない

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
