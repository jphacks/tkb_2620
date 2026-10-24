-- BODY ROAD のコースとランキング（Issue #23 #24 #25、#28〜#32 を見越した形）
-- Supabase の SQL Editor にそのまま貼って実行できる。何度実行しても壊れないようにしてある。
--
-- 方針
-- - アプリはブラウザから公開キー（anon）で直接つなぐため、必ず RLS を有効にする。
-- - 誰でもできる：公開中のコースとランキングを読む、新しいコースを保存する
-- - 関数経由でしかできない：プレイ回数・最終プレイ日時の更新、ランキングの登録
-- - 誰もできない（管理者のみ）：コースの書き換え・削除、ランキングの直接の書き換え
-- - 元の人物写真は保存しない（docs/course-data.md）

-- ───────────────────────── courses（#23） ─────────────────────────
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  -- 完成画面で付けた名前（空欄なら「なまえのないコース」、20文字まで）
  name text not null default 'なまえのないコース'
    check (char_length(btrim(name)) between 1 and 20),
  -- CourseData.points：道路中心線のゲーム空間座標 [{x, z}, ...]。START が先頭、反時計回り
  course_points jsonb not null
    check (
      jsonb_typeof(course_points) = 'array'
      and jsonb_array_length(course_points) between 3 and 5000
    ),
  -- CourseData.wallColorStops：[{progress: 0〜1, color: '#RRGGBB'}, ...]
  wall_color_stops jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(wall_color_stops) = 'array'
      and jsonb_array_length(wall_color_stops) <= 256
    ),
  theme_color text not null check (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  -- 道路の全幅（ゲーム空間の単位）
  road_width real not null check (road_width > 0 and road_width <= 100),
  capture_mode text not null check (capture_mode in ('full_body', 'clipped')),
  -- 一覧に出すか（#32 で古いコースを archived にする）
  status text not null default 'active'
    check (status in ('active', 'archived')),
  play_count integer not null default 0 check (play_count >= 0),
  created_at timestamptz not null default now(),
  -- 最後に遊ばれた日時。Memory Score（#30）はここから必要なときに計算し、DBには保存しない
  last_played_at timestamptz
);

comment on table public.courses is '人物写真から作ったコース（#23）。元の写真は保存しない';

-- 一覧（#28 #31）：公開中のコースを、最後に遊ばれた順・新しい順に取る
create index if not exists courses_active_recent_idx
  on public.courses (status, last_played_at desc nulls last, created_at desc);

-- ───────────────────────── rankings（#24） ─────────────────────────
create table if not exists public.rankings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 12),
  -- 総合スコア（タイム50＋積荷50 の100点満点、src/game/score.ts）
  score integer not null check (score between 0 and 100),
  clear_time_ms integer not null check (clear_time_ms > 0),
  remaining_cargo integer not null check (remaining_cargo >= 0),
  created_at timestamptz not null default now()
);

comment on table public.rankings is 'コース別TOP3（#24）。submit_ranking で登録し、4位以下は消す';

-- 順位：スコアが高い → タイムが短い → 先に出した記録
create index if not exists rankings_course_order_idx
  on public.rankings (course_id, score desc, clear_time_ms asc, created_at asc);

-- ───────────────────────── 関数 ─────────────────────────

-- 遊び始めたときに呼ぶ（#25 #30）。プレイ回数を増やし、最終プレイ日時を今にする
create or replace function public.record_play(p_course_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.courses
     set play_count = play_count + 1,
         last_played_at = now()
   where id = p_course_id
     and status = 'active';
$$;

-- ゴールしたときに呼ぶ（#24）。記録を入れ、そのコースの4位以下を消す。
-- TOP3 に入れば順位（1〜3）、入らなければ null を返す。
-- 同時に登録されても4件以上残らないよう、コースの行をロックしてから入れる。
create or replace function public.submit_ranking(
  p_course_id uuid,
  p_display_name text,
  p_score integer,
  p_clear_time_ms integer,
  p_remaining_cargo integer
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
    (course_id, display_name, score, clear_time_ms, remaining_cargo)
  values
    (p_course_id, btrim(p_display_name), p_score, p_clear_time_ms, p_remaining_cargo)
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

-- 古いコースを一覧から外す（#32）。条件は後で決めるため、日数を引数にする。
-- 管理者（service_role）専用。データは消さない。外した件数を返す。
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
       and coalesce(last_played_at, created_at) < now() - make_interval(days => p_days)
    returning 1
  )
  select count(*)::integer from archived;
$$;

-- ───────────────────────── 権限と RLS ─────────────────────────
alter table public.courses enable row level security;
alter table public.rankings enable row level security;

-- Supabase は public のテーブルに全権限を付けるので、いったん外してから必要な分だけ付ける
revoke all on public.courses, public.rankings from anon, authenticated;
grant select on public.courses, public.rankings to anon, authenticated;
-- 新しいコースの保存は、中身の列だけ。id・回数・日時・status はDBが決める
grant insert (name, course_points, wall_color_stops, theme_color, road_width, capture_mode)
  on public.courses to anon, authenticated;

drop policy if exists "公開中のコースは誰でも読める" on public.courses;
create policy "公開中のコースは誰でも読める"
  on public.courses for select
  to anon, authenticated
  using (status = 'active');

drop policy if exists "コースは誰でも保存できる" on public.courses;
create policy "コースは誰でも保存できる"
  on public.courses for insert
  to anon, authenticated
  with check (status = 'active' and play_count = 0 and last_played_at is null);

drop policy if exists "公開中のコースのランキングは誰でも読める" on public.rankings;
create policy "公開中のコースのランキングは誰でも読める"
  on public.rankings for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.courses c
       where c.id = rankings.course_id and c.status = 'active'
    )
  );
-- rankings への直接の書き込みポリシーは作らない（submit_ranking 経由のみ）

-- 関数は既定で誰でも（Supabase では anon・authenticated にも直接）実行権限が付くので、
-- いったんすべて外してから必要な分だけ付け直す
revoke execute on function public.record_play(uuid)
  from public, anon, authenticated;
revoke execute on function public.submit_ranking(uuid, text, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.archive_stale_courses(integer)
  from public, anon, authenticated;
grant execute on function public.record_play(uuid) to anon, authenticated;
grant execute on function public.submit_ranking(uuid, text, integer, integer, integer)
  to anon, authenticated;
grant execute on function public.archive_stale_courses(integer) to service_role;
