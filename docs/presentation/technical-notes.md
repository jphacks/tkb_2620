# 技術説明の実装根拠

図の矢印・枠・説明はPowerPointの編集可能な図形です。13枚目のグラフも編集可能なグラフで、値は実装式から計算しました。

| スライド | 内容                                                | 実装                                                                                                                                                                                                                                                       |
| -------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6〜7     | 最大連結領域・外周・平滑化・等間隔化・曲率補正      | [extractContour.ts](../../src/image-processing/extractContour.ts)、[previewContour.ts](../../src/image-processing/previewContour.ts)、[correctCurves.ts](../../src/image-processing/correctCurves.ts)、[fitRoad.ts](../../src/image-processing/fitRoad.ts) |
| 8        | 16区間・3地点・内側3/6/10px・中央値・道路への色対応 | [extractColors.ts](../../src/image-processing/extractColors.ts)、[mapCourseColors.ts](../../src/image-processing/mapCourseColors.ts)                                                                                                                       |
| 9〜10    | 慣性・摩擦・箱の接触・乗り越え・落下                | [slideCargo.ts](../../src/game/slideCargo.ts)、[cargoRails.ts](../../src/game/cargoRails.ts)、[fallCargo.ts](../../src/game/fallCargo.ts)                                                                                                                  |
| 11       | 20Hz送信・担当確認・最大1秒の入力保持               | [useControlSender.ts](../../src/hooks/useControlSender.ts)、[useRemoteInput.ts](../../src/socket/useRemoteInput.ts)、[server/index.ts](../../server/index.ts)                                                                                              |
| 12       | 写真と保存データの境界                              | [courseRow.ts](../../src/db/courseRow.ts)、[supabase.ts](../../src/db/supabase.ts)                                                                                                                                                                         |
| 13       | 思い出度と31日未プレイ削除                          | [memoryScore.ts](../../src/game/memoryScore.ts)、[日次削除SQL](../../supabase/migrations/20261024020000_schedule_delete.sql)                                                                                                                               |

## アピール文から正確にした表現

- 人物領域の推定はMediaPipeを利用。独自実装は、そのマスクを走れる道路へ変える後処理。
- 色抽出は人物マスク外を除外する。マスクが誤認識すると背景色が混じる可能性はあるため「背景を絶対拾わない」とは言わない。
- 急カーブの半径6mは目標。形の保存・自己交差回避と両立できない場合は警告を返す。
- 実車の加減速値を参照した元資料は確認できていないため、資料では慣性・摩擦・抵抗のモデルと実機調整を説明する。
- DBには座標・色・道幅以外にもコース名・モード・プレイ日時・回数・チーム名・ランキング記録を保存する。
- 忘却曲線はUIの着想であり、人の記憶や継続利用の効果を検証した結果ではない。式のtは経過分数、1分以内は100。数値自体はUIに表示しない。
- 31日未プレイのコースは次の日次処理で削除。DB側でpg_cronとSQLが適用済みであることが前提。サンプルコースは対象外。
- ミニマップの落下マーカーは、地面の着地点ではなく荷台から落ち始めた地点。

## 運転と設計意図の追加説明

- 空走距離・制動距離の図は距離比を表さない模式図です。固定の空走時間を追加する実装ではありません。
- `src/game/constants.ts` の `brakeRise = 2.5` により、無制動から全入力時の最大制動圧まで約0.4秒。`updateGame.ts` で制動圧に応じて減速し、走行抵抗と駆動力も加味します。
- 人とのつながりと現実の空間への敬意、再プレイされるコースが残る仕組みはチームの設計意図です。実車の精密再現や継続利用の効果を実証したものではありません。

## ランキングの追加説明

`src/game/score.ts`：タイム点50点＋積荷点50点の100点満点。`src/db/courseRow.ts`：コースごとにスコア降順、タイム昇順、同点同タイムは先の登録順でTOP3。`src/components/RankingEntryForm.tsx`：TOP3に入る記録にチーム名登録を案内（16文字まで）。`RankingTable.tsx` と `SavedCourses.tsx`：コース一覧で記録を表示。17枚目のチーム名と記録は説明用の例。

## 保存量を抑える設計

ランキングはDBの `submit_ranking` 内で4位以下を削除し、1コースあたりTOP3のみ保存します（`20261024010000_validate_and_sample_course.sql`）。31日未プレイのコースは日次処理で削除し、外部キーの `ON DELETE CASCADE` で関連記録も削除します（`20261024020000_schedule_delete.sql`）。サンプルコースは対象外。日次処理はDB側のSQL・pg_cron適用が前提です。これらはDBの肥大化と負担を抑える設計で、利用規模によらず総データ量が一定であるとの保証ではありません。
