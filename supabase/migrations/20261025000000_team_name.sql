-- ランキングの名前を「チーム名」にし、16文字まで入れられるようにする（Issue #29）
-- 3つ目（20261024020000_schedule_delete.sql）のあとに、Supabase の SQL Editor で実行する。
-- 何度実行しても壊れない。
--
-- BODY ROAD はハンドル係とペダル係の2人で遊ぶので、1つの記録に「あやか＆ゆりえ」のような
-- チーム名を1つ付ける。2人ぶん入るよう、12文字から16文字に増やす（列の名前 display_name はそのまま）。
-- アプリ側の上限は src/db/courseRow.ts の DISPLAY_NAME_MAX（ここと同じ値にする）。

alter table public.rankings drop constraint if exists rankings_display_name_check;
alter table public.rankings add constraint rankings_display_name_check
  check (char_length(btrim(display_name)) between 1 and 16);

comment on column public.rankings.display_name is 'チーム名（16文字まで）。2人で1つの名前を付ける';
