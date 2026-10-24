# 等間隔リサンプリング（Issue #5）

`resampleClosedContour(points,spacing)` はメートル単位の閉じた輪郭から、元の輪郭に沿う弧長が等しい点列を作る。
最後→最初の辺も累積距離に含む。連続する重複点・1e-7m以下の短辺・末尾の重複始点を除去し、輪郭を検証する。
一周の距離Lと希望間隔sから点数N=max(3,ceil(L/s))、実間隔=L/Nとして線形補間する。
始点と進行方向は変えず、末尾に始点を重複させない。5000点を超える入力設定や、不正になった出力は拒否する。

出力は `{points:[{x,y,t,distance}],totalLength,actualSpacing,requestedSpacing}`。
`t=i/N` と `distance=i*actualSpacing` は入力輪郭上の距離割合とメートル距離。角を挟む点同士の直線距離は弧長より短いことがある。
点を直線で結ぶと角が多少省略されるため、細かな形が必要な場合は間隔を小さくする。ゲーム用の最小半径は保証しない。

## 写真との接続

`resamplePhotoContour(points,width,height,{spacing,metersPerPixel})` は正規化された平滑化後の輪郭を入力とする。
`xMeters=xNormalized*photoWidth*metersPerPixel`、`yMeters=yNormalized*photoHeight*metersPerPixel`。
画像左上原点、右+x、下+yを維持。CourseDataの{x,z}への変換は後続処理で行い、同じ倍率を二重適用しない。
初期値は点間隔0.5m、1px=0.05m（仮）。倍率は読み込み・画像回転・縮小後の写真寸法に対する設定で、実際の身長推定ではない。

写真画面の検証欄で点間隔・倍率を調整できる。赤い点と一周の距離・点数・実間隔を確認する。
写真確定時は `CapturedPerson.resampledContour` と `resamplingOptions` を保持する。設定変更時は確定を解除する。
元写真・マスク・元輪郭・平滑化後輪郭を残す。色の取得は未実装で、元輪郭からの色抽出と`t`への対応づけはIssue #8/#9で行う。
元輪郭の距離割合と補正後の距離割合は変形の程度によりずれるため、`t`は完全な色の対応保証ではない。

PR #41が未マージの状態から作成したブランチはIssue #4に依存する。
確認：`npm run test:capture` / `npm run lint` / `npm run format:check` / `npm run build`。
