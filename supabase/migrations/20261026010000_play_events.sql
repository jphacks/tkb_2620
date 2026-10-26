-- 遊ばれた回数の記録。走り出すたびに1行、ゴールしたら終わった時刻を入れる。
-- 名前・写真・端末など、個人が分かることは記録しない。
-- 中身はブラウザからは読めない（集計は SQL Editor で見る）。書き込みは下の2つの関数からだけ。
create table if not exists public.play_events (
  id bigint generated always as identity primary key,
  -- 遊んだコース。コースが消えても記録は残す
  course_id uuid references public.courses (id) on delete set null,
  -- photo：その場で写真から作ったコース／memory：思い出のコース／sample：おためし便
  course_source text not null check (course_source in ('photo', 'memory', 'sample')),
  -- phones：スマホ2台／keyboard：PCのキーボード
  controller text not null check (controller in ('phones', 'keyboard')),
  started_at timestamptz not null default now(),
  -- ゴールした時刻。途中でやめたら null のまま
  finished_at timestamptz
);
create index if not exists play_events_started_at_idx on public.play_events (started_at);

alter table public.play_events enable row level security;
revoke all on public.play_events from anon, authenticated;

-- 走り出したときに呼ぶ。記録の番号を返す（ゴールしたときに使う）
create or replace function public.log_play_start(
  p_course_id uuid,
  p_course_source text,
  p_controller text
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.play_events (course_id, course_source, controller)
  values (
    (select id from public.courses where id = p_course_id),
    p_course_source,
    p_controller
  )
  returning id;
$$;

-- ゴールしたときに呼ぶ。走り出してから2時間以内の、まだ終わっていない記録だけ更新する
create or replace function public.log_play_finish(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.play_events
     set finished_at = now()
   where id = p_id
     and finished_at is null
     and started_at > now() - interval '2 hours';
$$;

revoke all on function public.log_play_start(uuid, text, text) from public;
revoke all on function public.log_play_finish(bigint) from public;
grant execute on function public.log_play_start(uuid, text, text) to anon, authenticated;
grant execute on function public.log_play_finish(bigint) to anon, authenticated;
