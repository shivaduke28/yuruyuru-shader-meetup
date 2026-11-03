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
- スライドのコードに出てくる `fogColor` は `ambient * albedo` のこと（albedo = 1 なら ambient そのもの）

### シーン

- y = 0 の床 + xz のセルごとに高さの違う柱。セル内 SDF をグリッドトラバーサルで進める（参考: 0b5vr「Shader: Grid Traversal」）
- カメラは +z に進み続ける。柱の列は x = 7k なので、初期位置は x = 3.5（列の間）
- ライトは順光（カメラの後ろ上）、ハードシャドウ。影のレイには最小歩幅を入れて表面すれすれでの stall を防ぐ

### 文言

- スライドの文章は素直な言い回しにする。凝った比喩や「ゼロ割り」「崩す」のような言い方は避ける
- コードは GLSL 準拠（`mix`、`vec3`）
- 見出しは「距離フォグ」「指数関数高さフォグ」「シェーダーコード」「発光」のように短く

## 参考資料

- 元ネタのブログと数式の詳細（Pickles Note の Gist）は README.md のリンク
- Pickles 本体（Unity 用シェーダー）は別リポジトリ。実装を確認したいときはローカルの Pickles リポジトリを参照する

## 作業の進め方

- レイアウトや見た目を変えるときは、先に設計（どの枠に何が入り、増えたらどうなるか）を文章で示してから実装する。場当たりの数値調整をしない
- ファイルの一部を置換するときは、置換前の文字列がファイル内に 1 回だけ現れることを確認してから行う
- 見た目の最終確認は shivaduke が `npm run dev` で行う。ヘッドレスのスクリーンショットは求められたときだけ
