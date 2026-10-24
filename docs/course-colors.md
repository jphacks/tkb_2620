# 補正後コースへの色の対応づけ（Issue #9）

`mapCourseColors(segments,course,reference,{blendRatio})` は、元輪郭で取った人物の代表色（Issue #8 の `colorSamples`）を、急カーブ補正後のコース（Issue #6 の `contour.points`）の各点に割り当てる。
`course` と `reference`（元輪郭）は同じ座標系で渡す。写真画面では、どちらも写真上のメートル（正規化座標×写真の幅・高さ×1pxあたりのm）。初期値は `blendRatio=0.2`。

## 処理

1. 元輪郭上の位置は、色の区間の `startT`〜`endT`（START からの距離割合 0〜1）で管理する。区間は 0〜1 を隙間なく覆っている必要がある。
2. 始点・進行方向をそろえる（`alignToReference`）。符号付き面積の向きが元輪郭と逆なら反転し、元輪郭の START（`reference[0]`）に最も近い点が `points[0]` になるよう回転する。Issue #7 で両方とも START から反時計回りなので、通常はそのまま。
3. 補正後コースの各点に、START からの距離割合 `t` を計算する（最後→最初の辺を含む）。
4. 各点の色の取り出し位置 `sourceT` は、元輪郭上で最も近い位置の距離割合（`matchToReference`）。前の点の位置から先（一周の 25% まで）だけを探し、逆戻りしない。距離割合をそのまま使うと、ギザギザの元輪郭となめらかな補正後コースとで長さの配分が違うため、色の位置がずれる。
5. `sourceT` の区間の色を使う。区間の境界の前後だけ、短い方の区間の長さ×`blendRatio` の幅で隣の区間の色と線形に混ぜる（境界上で半々）。最後の区間→最初の区間の境界（t=0）も同じように混ぜる。

## 出力

`{points:[{x,y,t,sourceT,rgb,color}],wallColorStops,reversed,rotated,blendRatio}`。
`color` は `#rrggbb`。`wallColorStops` は `CourseData.wallColorStops` の形（`progress` 順）で、同じ色が続く部分は両端だけ残す。最後の色から最初の色へはゲーム側で補間する（docs/course-data.md）。

## 画面

写真画面の検証欄に「コースの色（赤い丸：START）」を追加した。補正後コースを点ごとの色で太く描き、その上に START から一周の壁の色の帯を表示する。
写真のときは「人物の色を取り出す」の結果を使う。サンプルの人型では、髪・肌・シャツ・ズボンを塗った合成画像から色を取る。
写真確定時は `CapturedPerson.courseColors` に保持する。

確認：`npm run test:colors` / `npm run test:curves` / `npm run test:capture` / `npm run lint` / `npm run format:check` / `npm run build`。
