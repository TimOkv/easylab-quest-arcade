-- =============================================================================
-- EasyLab Quest & Endless Arcade — схема Supabase (PostgreSQL 15+).
-- Разворачивается одним прогоном в SQL Editor; повторный прогон безопасен.
--
-- После первого прогона (один раз, в SQL Editor под postgres):
--   select public.ezq_set_curator_secret('придумайте-длинный-секрет');
--   -- необязательно, Google-таблица (нужно расширение pg_net):
--   update public.ezq_settings set sheets_webhook_url = 'https://script.google.com/macros/s/…/exec',
--                                  sheets_webhook_secret = 'секрет-из-Script-Properties';
--
-- Модель доступа: RLS включён на всех таблицах, политик нет, прав у anon нет.
-- Аноним видит только представление public.leaderboard и вызывает RPC ниже
-- (SECURITY DEFINER, search_path зафиксирован). Ошибки — RAISE EXCEPTION с кодом
-- в начале текста: NO_QUEST, BAD_CODE, BAD_NAME, BAD_COINS, CHEAT_SPEED, TOO_SHORT,
-- SCORE_RANGE, RATE_LIMIT, CODE_TAKEN, FORBIDDEN, BAD_LIMIT.
-- =============================================================================

-- ---------------------------------------------------------------- роли (для локальных тестов; в Supabase уже есть)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to anon, authenticated;

-- Старый вариант из брифа: leaderboard как таблица → сохраняем её под другим именем.
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'leaderboard' and c.relkind = 'r') then
    alter table public.leaderboard rename to leaderboard_legacy_v0;
  end if;
end $$;

-- ---------------------------------------------------------------- таблицы

create table if not exists public.seasons (
  id          bigint generated always as identity primary key,
  title       varchar(64) not null,
  started_at  timestamptz not null default now(),
  ends_at     timestamptz null,
  finished_at timestamptz null,
  is_active   boolean not null default true
);
create unique index if not exists ux_seasons_one_active on public.seasons (is_active) where is_active;

create table if not exists public.ezq_settings (
  id                    int primary key default 1 check (id = 1),
  daily_score_limit     int not null default 3000 check (daily_score_limit between 100 and 100000),
  curator_secret_hash   text null,
  sheets_webhook_url    text null,
  sheets_webhook_secret text null
);

create table if not exists public.quest_completions (
  id                uuid primary key default gen_random_uuid(),
  verification_code varchar(10) not null unique,
  player_name       varchar(32) not null,
  student_id        text null,
  coins_earned      integer not null check (coins_earned >= 0 and coins_earned <= 75),
  rooms_solved      integer not null default 4,
  completed_at      timestamptz default now(),
  is_awarded        boolean default false,
  awarded_at        timestamptz null
);
create index if not exists idx_quest_verification on public.quest_completions (verification_code);
create index if not exists idx_quest_student on public.quest_completions (student_id);
create index if not exists idx_quest_name on public.quest_completions (lower(player_name));
create index if not exists idx_quest_recent on public.quest_completions (completed_at desc);

-- Сумма засчитанных очков ученика за сезон: одна строка на (сезон, код).
create table if not exists public.leaderboard_entries (
  id                uuid primary key default gen_random_uuid(),
  season_id         bigint not null references public.seasons(id),
  verification_code varchar(10) not null references public.quest_completions(verification_code),
  session_id        text not null,
  student_id        text null,
  player_name       varchar(16) not null,
  score             integer not null default 0 check (score >= 0),
  runs_count        integer not null default 0,
  is_hidden         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (season_id, verification_code)
);
create index if not exists idx_leaderboard_top on public.leaderboard_entries (season_id, score desc, created_at asc);

-- Журнал забегов (CHECK-и §4.2 брифа живут здесь).
create table if not exists public.arcade_runs (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null unique,
  verification_code  varchar(10) not null references public.quest_completions(verification_code),
  season_id          bigint not null references public.seasons(id),
  session_id         text not null,
  score              integer not null check (score >= 0 and score <= 50000),
  counted_score      integer not null default 0 check (counted_score >= 0),
  time_spent_seconds integer not null check (time_spent_seconds >= 5),
  jumps_count        integer not null default 0,
  day_msk            date not null,
  created_at         timestamptz not null default now()
);
create index if not exists idx_runs_code_day on public.arcade_runs (verification_code, day_msk);

create table if not exists public.season_winners (
  season_id         bigint not null references public.seasons(id),
  place             smallint not null check (place between 1 and 3),
  verification_code varchar(10) not null,
  player_name       varchar(16) not null,
  score             integer not null,
  primary key (season_id, place)
);

-- ---------------------------------------------------------------- сид

insert into public.ezq_settings (id) values (1) on conflict (id) do nothing;
insert into public.seasons (title) select 'Сезон 1'
  where not exists (select 1 from public.seasons where is_active);

-- ---------------------------------------------------------------- RLS и права

alter table public.seasons             enable row level security;
alter table public.ezq_settings        enable row level security;
alter table public.quest_completions   enable row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.arcade_runs         enable row level security;
alter table public.season_winners      enable row level security;

revoke all on public.seasons, public.ezq_settings, public.quest_completions,
              public.leaderboard_entries, public.arcade_runs, public.season_winners
  from public, anon, authenticated;

-- Публичный ТОП: текущий сезон, без скрытых, без кодов и student_id.
-- GET /rest/v1/leaderboard?order=score.desc,created_at.asc&limit=10
create or replace view public.leaderboard as
  select e.player_name, e.score, e.created_at, e.runs_count
  from public.leaderboard_entries e
  join public.seasons s on s.id = e.season_id and s.is_active
  where not e.is_hidden and e.score > 0;

revoke all on public.leaderboard from public, anon, authenticated;
grant select on public.leaderboard to anon, authenticated;

-- ---------------------------------------------------------------- внутренние помощники

create or replace function public.ezq_fail(p_code text, p_detail text default null)
returns void language plpgsql immutable set search_path = public, pg_temp as $$
begin
  raise exception '%', p_code || coalesce(': ' || p_detail, '') using errcode = 'P0001';
end $$;

create or replace function public.ezq_is_code(p text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p ~ '^EZ-[2-9A-HJ-NP-Z]{4}$', false)
$$;

create or replace function public.ezq_norm_name(p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')
$$;

-- Зеркало validatePlayerName из src/core/rules.ts: 2–16 символов, буквы/цифры/пробел/_-.
-- и фильтр мата (регистр, ё→е, латинские двойники, без разделителей, схлопнутые повторы).
create or replace function public.ezq_name_error(p text)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v text := public.ezq_norm_name(p);
  low text;
  cyr text;
  lat text;
  ru text[] := array['хуй','хуе','хуя','хуи','хуйн','пизд','ебан','ебал','ебат','ебуч','ебут','ебар','еблан',
    'заеб','уеб','выеб','въеб','отъеб','доеб','наеб','проеб','долбоеб','бля','сука','сучк',
    'сучар','мудак','мудил','пидор','пидар','пидр','гандон','гондон','говн','дерьм','залуп',
    'шлюх','жоп','дроч','ублюд','мраз','шалав'];
  en text[] := array['fuck','fuk','shit','bitch','cunt','dick','asshole','fag','nigg','whore','slut','porn',
    'penis','pussy','bastard','hitler','nazi',
    'hui','huy','huj','xuy','xyu','xui','pizd','pidor','pidar','pidr','suka','blya','eban',
    'ebal','ebat','mudak','gandon','zhopa','jopa','govno','dermo','zalup','shluh'];
  r text;
begin
  if char_length(v) < 2 then return 'TOO_SHORT'; end if;
  if char_length(v) > 16 then return 'TOO_LONG'; end if;
  if v !~ '^[A-Za-zА-Яа-яЁё0-9 _.\-]+$' then return 'BAD_CHARS'; end if;
  low := replace(lower(v), 'ё', 'е');
  cyr := regexp_replace(regexp_replace(translate(low, 'abcehkmoptxy01346', 'авсенкмортхуоизчб'), '[^а-я]', '', 'g'), '(.)\1+', '\1', 'g');
  lat := regexp_replace(regexp_replace(translate(low, 'авекмнорстух013457', 'abekmhopctyxoieast'), '[^a-z]', '', 'g'), '(.)\1+', '\1', 'g');
  foreach r in array ru loop
    if strpos(cyr, regexp_replace(r, '(.)\1+', '\1', 'g')) > 0 then return 'PROFANITY'; end if;
  end loop;
  foreach r in array en loop
    if strpos(lat, regexp_replace(r, '(.)\1+', '\1', 'g')) > 0 then return 'PROFANITY'; end if;
  end loop;
  return null;
end $$;

create or replace function public.ezq_today_msk()
returns date language sql stable set search_path = public, pg_temp as $$
  select (now() at time zone 'Europe/Moscow')::date
$$;

create or replace function public.ezq_active_season()
returns public.seasons language sql stable security definer set search_path = public, pg_temp as $$
  select * from public.seasons where is_active limit 1
$$;

create or replace function public.ezq_daily_limit()
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select daily_score_limit from public.ezq_settings where id = 1), 3000)
$$;

-- Позиция ученика в активном сезоне (без записи).
create or replace function public.ezq_standing(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.seasons := public.ezq_active_season();
  e public.leaderboard_entries;
  v_rank int;
  v_gap int;
  v_tenth int;
  v_visible int;
  v_today int;
begin
  select * into e from public.leaderboard_entries where season_id = s.id and verification_code = p_code;
  if found and not e.is_hidden and e.score > 0 then
    select r into v_rank from (
      select verification_code, rank() over (order by score desc, created_at asc) as r
      from public.leaderboard_entries where season_id = s.id and not is_hidden and score > 0
    ) t where t.verification_code = p_code;
  end if;
  if not coalesce(e.is_hidden, false) and (v_rank is null or v_rank > 10) then
    select count(*) into v_visible from public.leaderboard_entries where season_id = s.id and not is_hidden and score > 0;
    if v_visible < 10 then
      v_gap := 1;
    else
      select score into v_tenth from public.leaderboard_entries where season_id = s.id and not is_hidden and score > 0
        order by score desc, created_at asc offset 9 limit 1;
      v_gap := greatest(0, v_tenth - coalesce(e.score, 0) + 1);
    end if;
  end if;
  select coalesce(sum(counted_score), 0) into v_today from public.arcade_runs
    where verification_code = p_code and season_id = s.id and day_msk = public.ezq_today_msk();
  return jsonb_build_object(
    'rank', v_rank,
    'season_total', coalesce(e.score, 0),
    'gap_to_top10', v_gap,
    'today_counted', v_today,
    'daily_limit', public.ezq_daily_limit(),
    'is_hidden', coalesce(e.is_hidden, false),
    'season_ends_at', s.ends_at,
    'season_closed', s.ends_at is not null and s.ends_at <= now()
  );
end $$;

create or replace function public.ezq_curator_auth(p_secret text)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
declare h text;
begin
  select curator_secret_hash into h from public.ezq_settings where id = 1;
  if h is null or p_secret is null
     or encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') <> h then
    perform public.ezq_fail('FORBIDDEN');
  end if;
end $$;

create or replace function public.ezq_completion_card(q public.quest_completions)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'verification_code', q.verification_code,
    'player_name', q.player_name,
    'student_id', q.student_id,
    'coins_earned', q.coins_earned,
    'rooms_solved', q.rooms_solved,
    'completed_at', q.completed_at,
    'is_awarded', q.is_awarded,
    'awarded_at', q.awarded_at,
    'possible_duplicate', exists (
      select 1 from public.quest_completions o
      where o.id <> q.id
        and (lower(o.player_name) = lower(q.player_name)
             or (q.student_id is not null and o.student_id = q.student_id))
    )
  )
$$;

-- ---------------------------------------------------------------- RPC ученика

create or replace function public.register_quest_completion(
  p_code text, p_player_name text, p_student_id text, p_coins int, p_completed_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_name text := public.ezq_norm_name(p_player_name);
  v_student text := nullif(btrim(coalesce(p_student_id, '')), '');
  v_at timestamptz := p_completed_at;
  q public.quest_completions;
begin
  if not public.ezq_is_code(p_code) then perform public.ezq_fail('BAD_CODE'); end if;
  if public.ezq_name_error(v_name) is not null then perform public.ezq_fail('BAD_NAME', public.ezq_name_error(v_name)); end if;
  if p_coins is null or p_coins < 0 or p_coins > 75 then perform public.ezq_fail('BAD_COINS'); end if;

  if v_student is not null then
    select * into q from public.quest_completions where student_id = v_student order by completed_at limit 1;
    if found then
      return jsonb_build_object('verification_code', q.verification_code, 'coins_earned', q.coins_earned,
        'completed_at', q.completed_at, 'player_name', q.player_name, 'restored', true);
    end if;
  end if;

  select * into q from public.quest_completions where verification_code = p_code;
  if found then
    -- Повтор той же отправки (ответ потерялся в сети) — не конфликт.
    if lower(q.player_name) = lower(v_name) and q.coins_earned = p_coins
       and q.student_id is not distinct from v_student then
      return jsonb_build_object('verification_code', q.verification_code, 'coins_earned', q.coins_earned,
        'completed_at', q.completed_at, 'player_name', q.player_name, 'restored', false);
    end if;
    perform public.ezq_fail('CODE_TAKEN');
  end if;

  if v_at is null or v_at < now() - interval '30 days' or v_at > now() + interval '5 minutes' then
    v_at := now();
  end if;
  begin
    insert into public.quest_completions (verification_code, player_name, student_id, coins_earned, rooms_solved, completed_at, is_awarded)
      values (p_code, v_name, v_student, p_coins, 4, v_at, false)
      returning * into q;
  exception when unique_violation then
    perform public.ezq_fail('CODE_TAKEN');
  end;
  return jsonb_build_object('verification_code', q.verification_code, 'coins_earned', q.coins_earned,
    'completed_at', q.completed_at, 'player_name', q.player_name, 'restored', false);
end $$;

create or replace function public.restore_by_student(p_student_id text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('verification_code', q.verification_code, 'coins_earned', q.coins_earned,
                            'player_name', q.player_name, 'completed_at', q.completed_at)
  from public.quest_completions q
  where q.student_id = nullif(btrim(coalesce(p_student_id, '')), '')
  order by q.completed_at limit 1
$$;

create or replace function public.submit_arcade_score(
  p_run_id uuid, p_code text, p_session_id text, p_student_id text, p_player_name text,
  p_score int, p_time_spent int, p_jumps int)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_name text := public.ezq_norm_name(p_player_name);
  v_today date := public.ezq_today_msk();
  s public.seasons := public.ezq_active_season();
  prev public.arcade_runs;
  v_closed boolean;
  v_used int;
  v_counted int;
begin
  if not public.ezq_is_code(p_code) then perform public.ezq_fail('BAD_CODE'); end if;
  -- Сериализуем отправки одного ученика (лимит и сумма считаются без гонок).
  perform 1 from public.quest_completions where verification_code = p_code for update;
  if not found then perform public.ezq_fail('NO_QUEST'); end if;

  select * into prev from public.arcade_runs where run_id = p_run_id;
  if found then
    return public.ezq_standing(prev.verification_code) || jsonb_build_object('counted', prev.counted_score);
  end if;

  if public.ezq_name_error(v_name) is not null then perform public.ezq_fail('BAD_NAME', public.ezq_name_error(v_name)); end if;
  if p_score is null or p_score < 0 or p_score > 50000 then perform public.ezq_fail('SCORE_RANGE'); end if;
  if p_time_spent is null or p_time_spent < 5 then perform public.ezq_fail('TOO_SHORT'); end if;
  if p_score::numeric / p_time_spent > 120 then perform public.ezq_fail('CHEAT_SPEED'); end if;
  if (select count(*) from public.arcade_runs where verification_code = p_code and day_msk = v_today) >= 60 then
    perform public.ezq_fail('RATE_LIMIT');
  end if;

  v_closed := s.ends_at is not null and s.ends_at <= now();
  if v_closed then
    v_counted := 0;
  else
    select coalesce(sum(counted_score), 0) into v_used from public.arcade_runs
      where verification_code = p_code and season_id = s.id and day_msk = v_today;
    v_counted := greatest(0, least(p_score, public.ezq_daily_limit() - v_used));
  end if;

  insert into public.arcade_runs (run_id, verification_code, season_id, session_id, score, counted_score, time_spent_seconds, jumps_count, day_msk)
    values (p_run_id, p_code, s.id, coalesce(p_session_id, ''), p_score, v_counted, p_time_spent, greatest(coalesce(p_jumps, 0), 0), v_today);

  if not v_closed then
    insert into public.leaderboard_entries as e (season_id, verification_code, session_id, student_id, player_name, score, runs_count)
      values (s.id, p_code, coalesce(p_session_id, ''), nullif(btrim(coalesce(p_student_id, '')), ''), v_name, v_counted, 1)
      on conflict (season_id, verification_code) do update
        set score = e.score + excluded.score,
            runs_count = e.runs_count + 1,
            player_name = excluded.player_name,
            session_id = excluded.session_id,
            student_id = coalesce(excluded.student_id, e.student_id),
            updated_at = now();
  end if;

  return public.ezq_standing(p_code) || jsonb_build_object('counted', v_counted);
end $$;

create or replace function public.get_my_standing(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.ezq_is_code(p_code) then perform public.ezq_fail('BAD_CODE'); end if;
  if not exists (select 1 from public.quest_completions where verification_code = p_code) then return null; end if;
  return public.ezq_standing(p_code);
end $$;

create or replace function public.get_season_info()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('title', s.title, 'ends_at', s.ends_at, 'daily_limit', public.ezq_daily_limit(),
                            'is_closed', s.ends_at is not null and s.ends_at <= now())
  from public.seasons s where s.is_active limit 1
$$;

-- ---------------------------------------------------------------- RPC куратора (verify.html)

create or replace function public.curator_check(p_secret text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.ezq_curator_auth(p_secret);
  return true;
end $$;

create or replace function public.curator_find(p_secret text, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q public.quest_completions;
begin
  perform public.ezq_curator_auth(p_secret);
  select * into q from public.quest_completions where verification_code = upper(btrim(coalesce(p_code, '')));
  if not found then return null; end if;
  return public.ezq_completion_card(q);
end $$;

create or replace function public.curator_recent(p_secret text, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.ezq_curator_auth(p_secret);
  return coalesce((
    select jsonb_agg(public.ezq_completion_card(q) order by q.completed_at desc)
    from (select * from public.quest_completions order by completed_at desc
          limit least(greatest(coalesce(p_limit, 50), 1), 50)) q
  ), '[]'::jsonb);
end $$;

create or replace function public.curator_set_awarded(p_secret text, p_code text, p_awarded boolean)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare q public.quest_completions;
begin
  perform public.ezq_curator_auth(p_secret);
  update public.quest_completions
     set is_awarded = coalesce(p_awarded, false),
         awarded_at = case when coalesce(p_awarded, false) then now() else null end
   where verification_code = upper(btrim(coalesce(p_code, '')))
  returning * into q;
  if not found then return null; end if;
  return public.ezq_completion_card(q);
end $$;

create or replace function public.curator_leaderboard(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.seasons := public.ezq_active_season();
begin
  perform public.ezq_curator_auth(p_secret);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'rank', case when e.off then null else e.r end,
      'verification_code', e.verification_code, 'player_name', e.player_name, 'score', e.score,
      'runs_count', e.runs_count, 'is_hidden', e.is_hidden, 'created_at', e.created_at
    ) order by e.is_hidden, e.score desc, e.created_at asc)
    from (
      select x.*, (x.is_hidden or x.score = 0) as off,
             rank() over (partition by (x.is_hidden or x.score = 0) order by x.score desc, x.created_at asc) as r
      from public.leaderboard_entries x where x.season_id = s.id
    ) e
  ), '[]'::jsonb);
end $$;

create or replace function public.curator_set_hidden(p_secret text, p_code text, p_hidden boolean)
returns boolean language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public.ezq_curator_auth(p_secret);
  update public.leaderboard_entries set is_hidden = coalesce(p_hidden, false), updated_at = now()
   where verification_code = upper(btrim(coalesce(p_code, '')))
     and season_id = (public.ezq_active_season()).id;
  return found;
end $$;

create or replace function public.curator_set_daily_limit(p_secret text, p_limit int)
returns int language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public.ezq_curator_auth(p_secret);
  if p_limit is null or p_limit < 100 or p_limit > 100000 then perform public.ezq_fail('BAD_LIMIT'); end if;
  update public.ezq_settings set daily_score_limit = p_limit where id = 1;
  return p_limit;
end $$;

create or replace function public.curator_set_countdown(p_secret text, p_title text, p_ends_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public.ezq_curator_auth(p_secret);
  update public.seasons
     set title = coalesce(nullif(left(btrim(coalesce(p_title, '')), 64), ''), title),
         ends_at = p_ends_at
   where is_active;
  return public.get_season_info();
end $$;

create or replace function public.curator_finish_season(p_secret text, p_next_title text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  s public.seasons := public.ezq_active_season();
  v_title text;
begin
  perform public.ezq_curator_auth(p_secret);
  insert into public.season_winners (season_id, place, verification_code, player_name, score)
    select s.id, row_number() over (order by score desc, created_at asc), verification_code, player_name, score
    from public.leaderboard_entries
    where season_id = s.id and not is_hidden and score > 0
    order by score desc, created_at asc
    limit 3;
  update public.seasons set is_active = false, finished_at = now(),
         ends_at = coalesce(ends_at, now()) where id = s.id;
  v_title := coalesce(nullif(left(btrim(coalesce(p_next_title, '')), 64), ''),
                      'Сезон ' || ((select count(*) from public.seasons) + 1));
  insert into public.seasons (title) values (v_title);
  return jsonb_build_object('finished_season', s.title, 'season', public.get_season_info(),
                            'winners', public.curator_winners(p_secret));
end $$;

create or replace function public.curator_winners(p_secret text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.ezq_curator_auth(p_secret);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'season_id', s.id, 'season_title', s.title, 'finished_at', s.finished_at, 'place', w.place,
      'player_name', w.player_name, 'verification_code', w.verification_code, 'score', w.score
    ) order by s.finished_at desc nulls last, s.id desc, w.place)
    from public.season_winners w join public.seasons s on s.id = w.season_id
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- админ (только SQL Editor)

create or replace function public.ezq_set_curator_secret(p_secret text)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if p_secret is null or char_length(p_secret) < 8 then
    raise exception 'Секрет куратора — минимум 8 символов';
  end if;
  update public.ezq_settings set curator_secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') where id = 1;
end $$;

-- ---------------------------------------------------------------- права на функции

do $$
declare f text;
begin
  -- PUBLIC и (в Supabase) anon/authenticated получают EXECUTE по умолчанию — снимаем явно, только с наших функций
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'ezq\_%' or p.proname in (
             'register_quest_completion','restore_by_student','submit_arcade_score','get_my_standing','get_season_info',
             'curator_check','curator_find','curator_recent','curator_set_awarded','curator_leaderboard',
             'curator_set_hidden','curator_set_daily_limit','curator_set_countdown','curator_finish_season','curator_winners'))
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function
  public.register_quest_completion(text, text, text, int, timestamptz),
  public.restore_by_student(text),
  public.submit_arcade_score(uuid, text, text, text, text, int, int, int),
  public.get_my_standing(text),
  public.get_season_info(),
  public.curator_check(text),
  public.curator_find(text, text),
  public.curator_recent(text, int),
  public.curator_set_awarded(text, text, boolean),
  public.curator_leaderboard(text),
  public.curator_set_hidden(text, text, boolean),
  public.curator_set_daily_limit(text, int),
  public.curator_set_countdown(text, text, timestamptz),
  public.curator_finish_season(text, text),
  public.curator_winners(text)
to anon, authenticated;

-- ---------------------------------------------------------------- Google-таблица (R50) через pg_net

create or replace function public.ezq_notify_sheets()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare st public.ezq_settings;
begin
  select * into st from public.ezq_settings where id = 1;
  if st.sheets_webhook_url is null or st.sheets_webhook_url = '' then return new; end if;
  perform net.http_post(
    url := st.sheets_webhook_url,
    body := jsonb_build_object(
      'secret', st.sheets_webhook_secret,
      'event', case when tg_op = 'INSERT' then 'insert' else 'awarded' end,
      'row', jsonb_build_object(
        'time', to_char(new.completed_at at time zone 'Europe/Moscow', 'DD.MM.YYYY HH24:MI'),
        'verification_code', new.verification_code,
        'player_name', new.player_name,
        'student_id', coalesce(new.student_id, ''),
        'coins_earned', new.coins_earned,
        'status', case when new.is_awarded then 'Начислено' else 'Ожидает начисления' end)),
    headers := '{"Content-Type": "application/json"}'::jsonb);
  return new;
exception when others then
  -- Сбой вебхука не должен ломать регистрацию прохождения.
  raise warning 'ezq_notify_sheets: %', sqlerrm;
  return new;
end $$;
revoke execute on function public.ezq_notify_sheets() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    begin
      create extension if not exists pg_net;
    exception when others then
      raise notice 'pg_net недоступно: %', sqlerrm;
    end;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    drop trigger if exists ezq_sheets_insert on public.quest_completions;
    drop trigger if exists ezq_sheets_awarded on public.quest_completions;
    create trigger ezq_sheets_insert after insert on public.quest_completions
      for each row execute function public.ezq_notify_sheets();
    create trigger ezq_sheets_awarded after update of is_awarded on public.quest_completions
      for each row when (old.is_awarded is distinct from new.is_awarded)
      execute function public.ezq_notify_sheets();
  else
    raise notice 'pg_net не установлено — триггер Google-таблицы пропущен';
  end if;
end $$;
