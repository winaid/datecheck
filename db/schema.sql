-- DATE CHECK 데이터베이스 (Supabase 프로젝트 datecheck, 서울) — 2026-10-27
-- 모든 표는 RLS 를 켜고 정책을 두지 않는다: 브라우저(anon·authenticated)는 아무것도 못 읽고,
-- 우리 서버가 비밀 키(service_role)로만 읽고 쓴다. 회원을 지우면(auth.users) 기록도 함께 지워진다.

-- 조회 기록 — 리포트는 서버만 풀 수 있는 암호화 봉투(sealed, lib/token.mjs)로만 둔다.
-- 목록에 보여 줄 숫자(검사한 항목·신호 수)만 따로 적는다. 원본(사진·대화)은 어디에도 두지 않는다.
create table if not exists public.reports (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  checked text[] not null default '{}',
  signals int not null default 0,
  notes int not null default 0,
  sealed text not null
);
create index if not exists reports_user_created on public.reports (user_id, created_at desc);
create index if not exists reports_expires on public.reports (expires_at);

-- 조회 횟수 — 계정마다 짧은 시간·하루 한도를 센다(take_quota)
create table if not exists public.usage_hits (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  at timestamptz not null default now()
);
create index if not exists usage_hits_user_bucket_at on public.usage_hits (user_id, bucket, at desc);
create index if not exists usage_hits_bucket_at on public.usage_hits (bucket, at);

-- 약관·개인정보 동의 — 판(version)마다 한 줄
create table if not exists public.consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null,
  agreed_at timestamptz not null default now(),
  primary key (user_id, version)
);

-- 삭제 요청·문의·신고 — 함수가 다시 시작돼도 남게(예전엔 임시 폴더라 사라졌다)
create table if not exists public.requests (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  type text not null check (type in ('delete', 'inquiry', 'report')),
  message text not null,
  contact text not null default '',
  done boolean not null default false
);

alter table public.reports enable row level security;
alter table public.usage_hits enable row level security;
alter table public.consents enable row level security;
alter table public.requests enable row level security;
revoke all on public.reports, public.usage_hits, public.consents, public.requests from anon, authenticated;

-- 횟수 한도 — 창(초)마다 최대 횟수. 걸리면 그 창의 길이(초), 통과하면 0 을 돌려주고 한 번을 센다.
-- 같은 계정의 동시 요청이 한도를 넘지 않게 계정·종류별로 잠근다.
create or replace function public.take_quota(p_user uuid, p_bucket text, p_windows int[], p_maxes int[])
returns int
language plpgsql security definer set search_path = public as $$
declare
  i int;
  n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_bucket, 0));
  for i in 1 .. coalesce(array_length(p_windows, 1), 0) loop
    select count(*) into n from public.usage_hits
      where user_id = p_user and bucket = p_bucket and at > now() - make_interval(secs => p_windows[i]);
    if n >= p_maxes[i] then
      return p_windows[i];
    end if;
  end loop;
  insert into public.usage_hits (user_id, bucket) values (p_user, p_bucket);
  return 0;
end $$;
revoke execute on function public.take_quota(uuid, text, int[], int[]) from public, anon, authenticated;
grant execute on function public.take_quota(uuid, text, int[], int[]) to service_role;

-- 관리자 화면 숫자 — 회원 수·가입 경로·최근 14일 조회와 가입(한국 시간)
create or replace function public.admin_counts()
returns jsonb
language sql security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'providers', (select coalesce(jsonb_object_agg(p, n), '{}'::jsonb) from (
      select coalesce(raw_app_meta_data->>'provider', 'email') p, count(*) n from auth.users group by 1) x),
    'reportsStored', (select count(*) from public.reports where expires_at > now()),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', to_char(g, 'YYYY-MM-DD'), 'checks', c, 'signups', s) order by g), '[]'::jsonb) from (
      select g,
        (select count(*) from public.usage_hits h where h.bucket = 'analyze' and (h.at at time zone 'Asia/Seoul')::date = g) c,
        (select count(*) from auth.users u where (u.created_at at time zone 'Asia/Seoul')::date = g) s
      from generate_series((now() at time zone 'Asia/Seoul')::date - 13, (now() at time zone 'Asia/Seoul')::date, interval '1 day') as t(g0),
        lateral (select t.g0::date as g) d) z)
  )
$$;
revoke execute on function public.admin_counts() from public, anon, authenticated;
grant execute on function public.admin_counts() to service_role;

-- 보관 기간이 지난 조회 기록과 오래된 횟수 기록은 매시간 지운다
create extension if not exists pg_cron;
select cron.unschedule('datecheck-purge') where exists (select 1 from cron.job where jobname = 'datecheck-purge');
select cron.schedule('datecheck-purge', '17 * * * *',
  $$delete from public.reports where expires_at < now(); delete from public.usage_hits where at < now() - interval '90 days'$$);

-- 관리자 집계를 데이터베이스에 (2026-10-28) — Vercel 은 함수가 다시 뜨면 임시 폴더(/tmp) 집계가 사라져
-- 라이브 관리자 화면의 방문·퍼널·API 원가가 늘 0 이었다. 개인정보 없는 하루 합계만 남긴다.
--   key = 'ev:<화면 이벤트>' · 'api:<API>'(호출 수·원가·응답 시간) · 'fail:<API>'(실패 수) · 'purge:originals'(파기한 원본 수)
create table if not exists public.metrics_daily (
  day date not null,
  key text not null,
  n bigint not null default 0,
  krw numeric not null default 0,
  ms bigint not null default 0,
  primary key (day, key)
);
alter table public.metrics_daily enable row level security;
revoke all on public.metrics_daily from anon, authenticated;

-- 한 요청에서 생긴 집계를 한 번에 더한다(한국 시간 날짜). p_items = [{"k":"ev:landing_view","n":1,"krw":0,"ms":0}, …]
create or replace function public.bump_metrics(p_items jsonb)
returns void
language sql security definer set search_path = public as $$
  insert into public.metrics_daily as m (day, key, n, krw, ms)
  select (now() at time zone 'Asia/Seoul')::date, left(x->>'k', 80), sum(coalesce((x->>'n')::bigint, 1)), sum(coalesce((x->>'krw')::numeric, 0)), sum(coalesce((x->>'ms')::bigint, 0))
  from jsonb_array_elements(p_items) x
  where x->>'k' ~ '^(ev|api|fail|purge):[a-z0-9_-]{1,60}$'
  group by 2
  on conflict (day, key) do update set n = m.n + excluded.n, krw = m.krw + excluded.krw, ms = m.ms + excluded.ms
$$;
revoke execute on function public.bump_metrics(jsonb) from public, anon, authenticated;
grant execute on function public.bump_metrics(jsonb) to service_role;

-- 관리자 접근 로그 — 누가(접속 주소) 언제 무엇을 했나
create table if not exists public.admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  action text not null,
  ip text not null default ''
);
create index if not exists admin_log_at on public.admin_log (at desc);
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;

-- 관리자 화면 집계 — 최근 30일 하루 합계 · 30일 안에 조회한 회원 수(두 번 이상 포함) · 파기 누계 · 접근 로그 60건
create or replace function public.admin_metrics()
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('day', to_char(day, 'YYYY-MM-DD'), 'key', key, 'n', n, 'krw', krw, 'ms', ms)), '[]'::jsonb)
      from public.metrics_daily where day >= (now() at time zone 'Asia/Seoul')::date - 29),
    'users30', (select count(distinct user_id) from public.usage_hits where bucket = 'analyze' and at > now() - interval '30 days'),
    'repeat30', (select count(*) from (select user_id from public.usage_hits where bucket = 'analyze' and at > now() - interval '30 days' group by user_id having count(*) >= 2) r),
    'purgeOriginals', (select coalesce(sum(n), 0) from public.metrics_daily where key = 'purge:originals'),
    'purgeLastDay', (select to_char(max(day), 'YYYY-MM-DD') from public.metrics_daily where key = 'purge:originals'),
    'adminLog', (select coalesce(jsonb_agg(jsonb_build_object('at', at, 'action', action, 'ip', ip) order by at desc), '[]'::jsonb)
      from (select * from public.admin_log order by at desc limit 60) l)
  )
$$;
revoke execute on function public.admin_metrics() from public, anon, authenticated;
grant execute on function public.admin_metrics() to service_role;

-- 회원 목록 — 이메일·가입 방식·가입일·마지막 로그인·조회 수·보관 중인 조회 기록 (최근 가입 500명)
create or replace function public.admin_members()
returns jsonb
language sql security definer set search_path = public, auth as $$
  select coalesce(jsonb_agg(m order by m->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'provider', coalesce(u.raw_app_meta_data->>'provider', 'email'),
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'confirmed', u.email_confirmed_at is not null,
      'checks', (select count(*) from public.usage_hits h where h.user_id = u.id and h.bucket = 'analyze'),
      'stored', (select count(*) from public.reports r where r.user_id = u.id and r.expires_at > now())
    ) m
    from auth.users u
    order by u.created_at desc
    limit 500
  ) x
$$;
revoke execute on function public.admin_members() from public, anon, authenticated;
grant execute on function public.admin_members() to service_role;

-- 보관 기간: 하루 합계 400일, 접근 로그 1년 — 매시간 지우기에 더한다
select cron.unschedule('datecheck-purge') where exists (select 1 from cron.job where jobname = 'datecheck-purge');
select cron.schedule('datecheck-purge', '17 * * * *',
  $$delete from public.reports where expires_at < now(); delete from public.usage_hits where at < now() - interval '90 days';
    delete from public.metrics_daily where day < (now() at time zone 'Asia/Seoul')::date - 400; delete from public.admin_log where at < now() - interval '1 year'$$);
