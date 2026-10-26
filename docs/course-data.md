# コースデータの共通ルール

既存のDB設計を基準にする。型は `shared/course.ts`。

- `points` は道路中心線のゲーム空間座標 `{x, z}`。正規化した画像座標ではない。
- 画像処理中はピクセル座標を使ってよい。CourseDataを返す前に変換し、ゲーム側で再変換しない。
- 元の輪郭で最も上、同じ高さなら最も右をSTARTにする。
- 進行方向は真上（+Y側）から見て反時計回り。サンプルでは画面の上を−Z、右を+Xとして、上→左→下→右の順に進む。
- `points[0]` がSTART。点は走行順。末尾に始点を重複保存せず、ゲーム側で閉じる。
- START決定と向きの統一は `src/image-processing/normalizeContour.ts` の `orderFromStart`（「START地点の決定」）。写真から輪郭を作った直後に適用し、平滑化・等間隔化・色の取得はすべてSTARTから反時計回りに進む。
- `roadWidth` は道路全幅。座標・車体と同じゲーム空間の単位。
- 色は `#RRGGBB`。`progress` は閉じる区間を含む全長に対するSTARTからの距離割合。
- 色はprogress順に並べ、一周の境界では最後の色から最初の色へ補間する。1の重複点は必須ではない。
- `captureMode` は `full_body` または `clipped`。どちらも閉じたコースを返す。
- 元の写真はDBに保存しない。

## 未確定

既存アルゴリズムと確認するまで、座標の原点・軸の向き・倍率は固定しない。
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

名前を対応させるだけで座標・幅を再変換しない。

テーブル・関数・権限は `supabase/migrations/` のSQL（「コースのテーブル」・「ランキング」）。SupabaseのSQL Editorに、ファイル名の順（`20261024000000_courses_rankings.sql` → `20261024010000_validate_and_sample_course.sql`）に貼って実行する（再実行しても壊れない）。

- `courses`：上の列に加え `id`・`name`（20文字まで）・`comment`（コースに一言。どんなときの写真か。任意で30文字まで、書かなければ null。`20261026000000_course_comment.sql`）・`status`（`active`/`archived`）・`play_count`・`created_at`・`last_played_at`。Memory Score（「思い出度」）は `last_played_at` から必要なときに計算し、保存しない。
- 保存するコースの中身は、ゲーム側の検査（`src/game/safety.ts` の `validateCourseData`、「エラー処理」）と同じ基準でDBも検査する：点は `{x: 数, z: 数}` が3〜5000個、壁の色は1つ以上で `{progress: 0〜1, color: '#RRGGBB'}`、テーマ色は `#RRGGBB`、道幅は0より大きい。
- `rankings`：`course_id`・`display_name`（2人で1つのチーム名、16文字まで。`20261025000000_team_name.sql`）・`score`（0〜100）・`clear_time_ms`・`remaining_cargo`・`cargo_total`（積んだ数。残り ≤ 積んだ数）・`created_at`。コースごとにTOP3だけ残す。分けない（2人・3人で同じランキング）。
- サンプルの楕円コースは、ID `00000000-0000-4000-8000-000000000001`・名前「サンプルコース（楕円）」で常に入れておく（`sampleCourse.ts` と同じ形）。写真なしで遊んだときもこのIDでランキングを付ける。古くなっても消さない。
- `play_events`：遊ばれた回数の記録（`20261026010000_play_events.sql`）。走り出すたびに1行、ゴールしたら終わった時刻を入れる。個人が分かることは記録しない。集計の仕方は [play-stats.md](play-stats.md)。
- ブラウザ（anonキー）からできるのは、公開中のコースとランキングを読む・コースを保存する・`record_play(course_id)`（遊び始め）・`submit_ranking(course_id, display_name, score, clear_time_ms, remaining_cargo, cargo_total)`（ゴール。TOP3なら順位、圏外ならnull）・`log_play_start`／`log_play_finish`（遊ばれた回数の記録。読むことはできない）だけ。書き換え・削除・ランキングの直接登録はRLSと権限で拒否する。
- `delete_stale_courses(days)`（「古いコースの整理」）は管理者（service_role）専用。DBを軽く保つため、最後に遊ばれてから指定日数たったコース（サンプルを除く）を行ごと消す（ランキングも `on delete cascade` で一緒に消える）。アプリでは31日（エビングハウスの忘却曲線の最後の測定点、思い出度 約21）で、pg_cron が毎日実行する（`20261024020000_schedule_delete.sql`）。最初に作った `archive_stale_courses` はこのSQLで消す。`status` 列は残っているが、今は使っていない。
- スコアはブラウザで計算して送るため、改ざんは防げない（ハッカソン用の割り切り）。
  `sampleCourse.ts` はデータ形状の確認用。寸法・幅3はサンプル限りの値。周回方向は反時計回りに統一する。
