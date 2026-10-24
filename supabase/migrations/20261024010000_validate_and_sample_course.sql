-- 1つ目（20261024000000_courses_rankings.sql）を実行したあとに流す変更分（Issue #23 #24）
-- Supabase の SQL Editor にそのまま貼って実行できる。何度実行しても壊れない。
--
-- 1. 壁の色・座標の中身を、ゲーム側の検査（src/game/safety.ts の validateCourseData、#22）と同じ基準で検査する
--    （保存できたのに、読み込むとサンプルに差し替えられる食い違いをなくす）
-- 2. ランキングに「積んだ荷物の数」を持たせる（結果画面の「残り / 積んだ数」とスコアの計算に使う、#15 #21）
-- 3. サンプルの楕円コースを決まったIDで常に入れておき、写真なしで遊んだときもランキングを付けられるようにする

-- ───────────────── 1. コースの中身の検査 ─────────────────
-- 壁の色は1つ以上必要（ゲーム側は空だと不正と判定する）。省略できないよう既定値も外す
alter table public.courses alter column wall_color_stops drop default;

alter table public.courses drop constraint if exists courses_points_shape_check;
alter table public.courses add constraint courses_points_shape_check check (
  -- 各点が {x: 数, z: 数} のオブジェクトであること
  not jsonb_path_exists(
    course_points,
    '$[*] ? (@.type() != "object" || !exists(@.x) || !exists(@.z)
             || @.x.type() != "number" || @.z.type() != "number")'
  )
);

alter table public.courses drop constraint if exists courses_wall_color_stops_shape_check;
alter table public.courses add constraint courses_wall_color_stops_shape_check check (
  jsonb_array_length(wall_color_stops) >= 1
  -- 各要素が {progress: 0〜1 の数, color: '#RRGGBB'} であること
  and not jsonb_path_exists(
    wall_color_stops,
    '$[*] ? (@.type() != "object"
             || !exists(@.progress) || @.progress.type() != "number"
             || @.progress < 0 || @.progress > 1
             || !exists(@.color) || @.color.type() != "string"
             || !(@.color like_regex "^#[0-9A-Fa-f]{6}$"))'
  )
);

-- ───────────────── 2. ランキングの積んだ数 ─────────────────
alter table public.rankings add column if not exists cargo_total integer;
-- 先に入っていた記録があれば、今の積荷数（3個、src/game/cargo.ts）とみなす
update public.rankings
   set cargo_total = greatest(remaining_cargo, 3)
 where cargo_total is null;
alter table public.rankings alter column cargo_total set not null;

alter table public.rankings drop constraint if exists rankings_cargo_check;
alter table public.rankings add constraint rankings_cargo_check
  check (cargo_total >= 0 and remaining_cargo <= cargo_total);

-- 引数が増えるので、古い形の関数は消してから作り直す
drop function if exists public.submit_ranking(uuid, text, integer, integer, integer);

-- ゴールしたときに呼ぶ（#24）。記録を入れ、そのコースの4位以下を消す。
-- TOP3 に入れば順位（1〜3）、入らなければ null を返す。
-- 同時に登録されても4件以上残らないよう、コースの行をロックしてから入れる。
create or replace function public.submit_ranking(
  p_course_id uuid,
  p_display_name text,
  p_score integer,
  p_clear_time_ms integer,
  p_remaining_cargo integer,
  p_cargo_total integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_rank integer;
begin
  perform 1
    from public.courses
   where id = p_course_id
     and status = 'active'
   for update;
  if not found then
    raise exception 'course not found' using errcode = 'P0002';
  end if;

  insert into public.rankings
    (course_id, display_name, score, clear_time_ms, remaining_cargo, cargo_total)
  values
    (p_course_id, btrim(p_display_name), p_score, p_clear_time_ms,
     p_remaining_cargo, p_cargo_total)
  returning id into v_id;

  delete from public.rankings r
   where r.course_id = p_course_id
     and r.id in (
       select id
         from public.rankings
        where course_id = p_course_id
        order by score desc, clear_time_ms asc, created_at asc, id asc
       offset 3
     );

  select ranked.rank into v_rank
    from (
      select id,
             row_number() over (
               order by score desc, clear_time_ms asc, created_at asc, id asc
             )::integer as rank
        from public.rankings
       where course_id = p_course_id
    ) ranked
   where ranked.id = v_id;

  return v_rank; -- 消されていれば null
end;
$$;

revoke execute on function public.submit_ranking(uuid, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.submit_ranking(uuid, text, integer, integer, integer, integer)
  to anon, authenticated;

-- ───────────────── 3. サンプルの楕円コース ─────────────────
-- アプリの src/fixtures/sampleCourse.ts と同じ形（半径24×16・160点・道幅6・反時計回り）。
-- ID は固定。アプリはこのIDでランキングを読み書きする
insert into public.courses
  (id, name, course_points, wall_color_stops, theme_color, road_width, capture_mode)
select
  '00000000-0000-4000-8000-000000000001',
  'サンプルコース（楕円）',
  jsonb_agg(
    jsonb_build_object(
      'x', round((-24 * sin(i * 2 * pi() / 160))::numeric, 6),
      'z', round((-16 * cos(i * 2 * pi() / 160))::numeric, 6)
    ) order by i
  ),
  '[{"progress":0,"color":"#272321"},{"progress":0.2,"color":"#D7A58C"},
    {"progress":0.4,"color":"#E6DFD3"},{"progress":0.6,"color":"#334B6A"},
    {"progress":0.8,"color":"#C9947D"}]'::jsonb,
  '#F2A65A',
  6.0,
  'full_body'
from generate_series(0, 159) as i
on conflict (id) do nothing;

-- サンプルは古くなっても一覧から外さない（#32）
create or replace function public.archive_stale_courses(p_days integer)
returns integer
language sql
security definer
set search_path = ''
as $$
  with archived as (
    update public.courses
       set status = 'archived'
     where status = 'active'
       and id <> '00000000-0000-4000-8000-000000000001'
       and coalesce(last_played_at, created_at) < now() - make_interval(days => p_days)
    returning 1
  )
  select count(*)::integer from archived;
$$;

revoke execute on function public.archive_stale_courses(integer)
  from public, anon, authenticated;
grant execute on function public.archive_stale_courses(integer) to service_role;
