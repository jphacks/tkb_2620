-- コースに一言（どんなときの写真か）。書かなくてもよい（null）。
-- 思い出のコースのカードの吹き出しに出すため、30文字まで。ほかの列と同じく公開される。
alter table public.courses add column if not exists comment text;

alter table public.courses drop constraint if exists courses_comment_check;
alter table public.courses add constraint courses_comment_check
  check (comment is null or char_length(btrim(comment)) between 1 and 30);

-- ブラウザから保存するときに、一言の列も送れるようにする（読む権限はもとからある）
grant insert (comment) on public.courses to anon, authenticated;
