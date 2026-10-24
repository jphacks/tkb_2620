-- 古いコースを毎日自動で一覧から外す（Issue #32）
-- 2つ目（20261024010000_validate_and_sample_course.sql）のあとに、Supabase の SQL Editor で実行する。
-- 何度実行しても壊れない（同じ名前の予定は上書きされる）。
--
-- 外す条件：最後に遊ばれてから31日（作ってから一度も遊ばれていなければ作ってから31日）。
-- 31日はエビングハウスの忘却曲線の実験の最後の測定点で、思い出度（Memory Score、#30）が約21になる日。
-- アプリ側の計算は src/game/memoryScore.ts の FORGOTTEN_AFTER_DAYS（ここと同じ値にする）。
-- サンプルの楕円コースは外さない（archive_stale_courses の中で除外済み）。データは消さない。

-- Supabase の pg_cron（DBの中で決まった時刻に処理を動かす機能）を使う
create extension if not exists pg_cron with schema pg_catalog;

-- 毎日 03:10（日本時間）＝ 18:10（UTC）に実行する
select cron.schedule(
  'archive-stale-courses',
  '10 18 * * *',
  $$select public.archive_stale_courses(31)$$
);
