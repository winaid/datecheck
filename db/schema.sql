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
