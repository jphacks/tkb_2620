# 遊ばれた回数の記録

どのくらい遊ばれているか、新しいコースが作られているかを知るための記録です。
走り出すたびに `play_events` に1行足し、ゴールしたら終わった時刻を入れます。

- 記録するのは、遊び始めた日時・コース（`course_id`）・コースの種類・操作の仕方・ゴールした日時だけです。名前・写真・端末など、個人が分かることは記録しません。
- コースの種類（`course_source`）：`photo`（その場で写真から作った）／`memory`（思い出のコース）／`sample`（おためし便）
- 操作の仕方（`controller`）：`phones`（スマホ2台）／`keyboard`（PCのキーボード）
- ゴールしなかった回は `finished_at` が空のまま残ります。
- ブラウザからは書き込みだけできます（`log_play_start`・`log_play_finish`）。中身を読めるのは、Supabase のダッシュボード（SQL Editor）からだけです。
- SQL は [supabase/migrations/20261026010000_play_events.sql](../supabase/migrations/20261026010000_play_events.sql)。

## 集計の SQL

SQL Editor に貼って実行します。日付は日本時間です。

```sql
-- 1日ごとの、遊ばれた回数・ゴールした回数・新しく作られたコースの数
select d.day,
       coalesce(p.plays, 0)     as 遊ばれた回数,
       coalesce(p.finished, 0)  as ゴールした回数,
       coalesce(c.new_courses, 0) as 新しいコース
  from (
    select generate_series(
      (now() at time zone 'Asia/Tokyo')::date - 13,
      (now() at time zone 'Asia/Tokyo')::date,
      interval '1 day')::date as day
  ) d
  left join (
    select (started_at at time zone 'Asia/Tokyo')::date as day,
           count(*) as plays,
           count(finished_at) as finished
      from public.play_events group by 1
  ) p using (day)
  left join (
    select (created_at at time zone 'Asia/Tokyo')::date as day,
           count(*) as new_courses
      from public.courses
     where id <> '00000000-0000-4000-8000-000000000001'
     group by 1
  ) c using (day)
 order by d.day desc;

-- コースの種類・操作の仕方ごとの回数と、ゴールまで走った割合（全期間）
select course_source as コースの種類,
       controller    as 操作,
       count(*)      as 回数,
       round(100.0 * count(finished_at) / count(*)) as ゴール率
  from public.play_events
 group by 1, 2
 order by 3 desc;

-- 時間帯ごとの回数（日本時間）
select extract(hour from started_at at time zone 'Asia/Tokyo')::int as 時,
       count(*) as 回数
  from public.play_events
 group by 1
 order by 1;
```
