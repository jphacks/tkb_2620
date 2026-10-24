# 急カーブの検出・自動補正（Issue #6）

`correctSharpCurves(contour,options)` は等間隔化した閉じた輪郭（メートル、Issue #5の出力）から急カーブを見つけ、トラックが曲がれる形に補正する。
初期値は `minTurnRadius=6.0m`・`maxCorrectionIterations=30`・`maxDisplacement=3.0m`（`DEFAULT_CURVE_CORRECTION`）。

## 検出

`detectSharpCurves(points,minTurnRadius)` は連続する3点（前・自分・次。最後と最初もつなぐ）を通る円の半径 `abc/(4×面積)` を局所曲率として求める。
一直線なら半径は∞。半径6m未満の点を急カーブとする。出力は `{radii,sharp,minRadius}`。

## 補正

1. 急カーブの点の前後 `1.5×minTurnRadius` ぶんの点を補正の対象にする（中心ほど強く動かす）。
2. 対象の点のうち半径が目標（`minTurnRadius×1.25`）未満のものを、前後の点の中点の方向へ動かす。動かす量は、前後の点を弦とする目標半径の円弧に乗るまで。これを繰り返すと角が円弧に広がる。
3. 各点を、その点自身の補正前の位置から `maxDisplacement` 以内に戻す。補正中は点の番号を変えないので、図形全体が縮んだりずれたりしない。
4. 自己交差・重なりが出たらその回は採用せず、動かす量を半分にしてやり直す。
5. 元の点間隔で再リサンプリングし、もう一度曲率を確認する。急カーブがなくなるか、30回で終わる。
6. 途中で一番よかった回の結果を返す。急カーブが残る場合は `warning` を返す。最も急なカーブが補正前より悪くなる結果は採用しない。

目標半径を1.25倍にしているのは、円弧を再リサンプリングすると半径がわずかに小さく測られるため。

## 出力

`{contour,before,after,iterationsApplied,maxShift,warning?}`。`contour` は等間隔化と同じ形（`points[{x,y,t,distance}]`・`totalLength`・`actualSpacing`）で、始点・進行方向は入力と同じ。
`before`/`after` は補正前後の検出結果。`maxShift` は補正前の位置からの最大移動量（m）。
`t` は補正後の輪郭上の距離割合で、元輪郭の `t` とは一致しない。色の対応づけはIssue #9で行う。

## 画面

写真画面の検証欄に「急カーブ補正前」「急カーブ補正後」を並べ、急カーブを赤い点で表示する。補正前後の点数・最小半径・補正回数・最大移動量と、補正不能の警告を表示する。
写真確定時は `CapturedPerson.curveCorrection` に保持する。

## 注意

半径は「1px = 何m」の倍率で大きく変わる。人物が小さい（細い腕・脚の幅が数m）と半径6mでは曲がれないため、補正しきれずに警告が出る。移動が3m以内でも細い部分はつぶれて丸い形に近づく。
倍率・半径・移動量の調整はプレイテスト（Issue #27）で決める。

確認：`npm run test:curves` / `npm run test:capture` / `npm run lint` / `npm run format:check` / `npm run build`。
