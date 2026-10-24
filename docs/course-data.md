# コースデータの共通ルール

既存のDB設計を基準にする。型は `shared/course.ts`。

- `points` は道路中心線のゲーム空間座標 `{x, z}`。正規化した画像座標ではない。
- 画像処理中はピクセル座標を使ってよい。CourseDataを返す前に変換し、ゲーム側で再変換しない。
- 元の輪郭で最も上、同じ高さなら最も右をSTARTにする。
- `points[0]` がSTART。点は走行順。末尾に始点を重複保存せず、ゲーム側で閉じる。
- `roadWidth` は道路全幅。座標・車体と同じゲーム空間の単位。
- 色は `#RRGGBB`。`progress` は閉じる区間を含む全長に対するSTARTからの距離割合。
- 色はprogress順に並べ、一周の境界では最後の色から最初の色へ補間する。1の重複点は必須ではない。
- `captureMode` は `full_body` または `clipped`。どちらも閉じたコースを返す。
- 元の写真はDBに保存しない。

## 未確定

既存アルゴリズムと確認するまで、座標の原点・軸の向き・倍率・周回方向は固定しない。
道路幅、車体寸法、荷物数なども実機で調整する。WORLD_SIZE=100 / roadWidth=0.06は採用しない。
色の取得位置と、輪郭補正後の距離への対応方法は既存アルゴリズムに合わせる。

## DB対応

| 共通データ     | coursesカラム    |
| -------------- | ---------------- |
| points         | course_points    |
| wallColorStops | wall_color_stops |
| themeColor     | theme_color      |
| roadWidth      | road_width       |
| captureMode    | capture_mode     |

名前を対応させるだけで座標・幅を再変換しない。DBアクセスとマイグレーションは未実装。
`sampleCourse.ts` はデータ形状の確認用。座標・幅3・向きはサンプル限りの値であり正式仕様ではない。
