-- 古いコースを毎日自動でDBから消す（Issue #32）
-- 2つ目（20261024010000_validate_and_sample_course.sql）のあとに、Supabase の SQL Editor で実行する。
-- 何度実行しても壊れない（同じ名前の関数・予定は上書きされる）。
--
-- DBを軽く保つため、忘れられたコースは archived にせず、行ごと消す。
-- そのコースのランキングも一緒に消える（rankings.course_id は on delete cascade）。
-- 消す条件：最後に遊ばれてから31日（一度も遊ばれていなければ作ってから31日）。
-- 31日はエビングハウスの忘却曲線の実験の最後の測定点で、思い出度（Memory Score、#30）が約21になる日。
-- アプリ側の計算は src/game/memoryScore.ts の FORGOTTEN_AFTER_DAYS（ここと同じ値にする）。
-- サンプルの楕円コースは消さない。

create or replace function public.delete_stale_courses(p_days integer)
returns integer
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.courses
     where id <> '00000000-0000-4000-8000-000000000001'
       and coalesce(last_played_at, created_at) < now() - make_interval(days => p_days)
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function public.delete_stale_courses(integer)
  from public, anon, authenticated;
grant execute on function public.delete_stale_courses(integer) to service_role;

-- 一覧から外すだけの古い関数は使わないので消す
drop function if exists public.archive_stale_courses(integer);

-- Supabase の pg_cron（DBの中で決まった時刻に処理を動かす機能）を使う
create extension if not exists pg_cron with schema pg_catalog;

-- 古い名前の予定が残っていれば外す
select cron.unschedule(jobname)
  from cron.job
 where jobname = 'archive-stale-courses';

-- 毎日 03:10（日本時間）＝ 18:10（UTC）に実行する
select cron.schedule(
  'delete-stale-courses',
  '10 18 * * *',
  $$select public.delete_stale_courses(31)$$
);
