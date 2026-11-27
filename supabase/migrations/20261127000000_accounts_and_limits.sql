-- Accounts and daily limits for the online editor's AI.
--
-- People read their own profile and usage and write neither. Only the AI function, with the service role, takes and
-- records use. Admins are made by hand, by setting profiles.role to 'admin' in the table editor. Days are UTC.
-- Nothing here holds what anyone said, typed or built.

create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    full_name text not null default '' check (char_length(full_name) <= 100),
    role text not null default 'user' check (role in ('user', 'admin')),
    blocked boolean not null default false,
    -- A person's own limits. Empty means the usual ones.
    daily_requests integer check (daily_requests >= 0),
    daily_live_sessions integer check (daily_live_sessions >= 0),
    created_at timestamptz not null default now()
);

-- One row of settings, changed in the table editor.
create table public.app_settings (
    id boolean primary key default true check (id),
    ai_enabled boolean not null default true,
    daily_requests integer not null default 50 check (daily_requests >= 0),
    daily_live_sessions integer not null default 3 check (daily_live_sessions >= 0),
    daily_characters integer not null default 20000 check (daily_characters >= 0),
    requests_per_minute integer not null default 20 check (requests_per_minute >= 0),
    -- For everyone who is not an admin, together: a bound on what many accounts can spend.
    everyone_daily_requests integer not null default 1000 check (everyone_daily_requests >= 0),
    everyone_daily_live_sessions integer not null default 60 check (everyone_daily_live_sessions >= 0),
    everyone_daily_characters integer not null default 200000 check (everyone_daily_characters >= 0)
);
insert into public.app_settings default values;

create table public.usage_daily (
    user_id uuid not null references auth.users (id) on delete cascade,
    day date not null,
    requests integer not null default 0,
    live_sessions integer not null default 0,
    characters integer not null default 0,
    cost_usd numeric(12, 6) not null default 0,
    primary key (user_id, day)
);

-- When each person's requests of the last minute were taken.
create table public.recent_requests (
    user_id uuid not null references auth.users (id) on delete cascade,
    taken_at timestamptz not null default clock_timestamp()
);
create index recent_requests_by_user on public.recent_requests (user_id, taken_at);

create table public.ai_calls (
    id bigint generated always as identity primary key,
    user_id uuid references auth.users (id) on delete set null,
    called_at timestamptz not null default now(),
    kind text not null check (kind in ('assistant', 'voice-turn', 'speak', 'live-session', 'live-tool')),
    model text not null default '',
    outcome text not null,
    cost_usd numeric(12, 6) not null default 0,
    milliseconds integer not null default 0
);

-- A profile for each new account. Nothing a person sends at sign-up can set their role or limits.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    insert into public.profiles (id, full_name)
    values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 100))
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();

insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

-- Take some of today's allowance before calling an AI service, or say why not:
-- 'ok', 'ai_off', 'blocked', 'too_many_requests' or 'daily_limit'.
create function public.take_quota(
    p_user uuid, p_requests integer default 0, p_live_sessions integer default 0, p_characters integer default 0
) returns text
language plpgsql security definer set search_path = '' as $$
declare
    settings public.app_settings;
    profile public.profiles;
    used public.usage_daily;
    all_used record;
    today date := (now() at time zone 'utc')::date;
begin
    if p_requests < 0 or p_live_sessions < 0 or p_characters < 0 then
        raise exception 'amounts cannot be negative';
    end if;
    select * into settings from public.app_settings where id;
    if not settings.ai_enabled then return 'ai_off'; end if;
    select * into profile from public.profiles where id = p_user;
    if not found or profile.blocked then return 'blocked'; end if;

    -- One at a time, so that requests arriving together cannot pass a limit.
    perform pg_advisory_xact_lock(hashtext('brailled.quota'));
    insert into public.usage_daily (user_id, day) values (p_user, today) on conflict do nothing;
    select * into used from public.usage_daily where user_id = p_user and day = today;

    if profile.role <> 'admin' then
        delete from public.recent_requests
            where user_id = p_user and taken_at <= clock_timestamp() - interval '1 minute';
        if p_requests + p_live_sessions > 0 and
            (select count(*) from public.recent_requests where user_id = p_user) >= settings.requests_per_minute then
            return 'too_many_requests';
        end if;

        if (p_requests > 0 and used.requests + p_requests >
                coalesce(profile.daily_requests, settings.daily_requests))
            or (p_live_sessions > 0 and used.live_sessions + p_live_sessions >
                coalesce(profile.daily_live_sessions, settings.daily_live_sessions))
            or (p_characters > 0 and used.characters + p_characters > settings.daily_characters) then
            return 'daily_limit';
        end if;

        select coalesce(sum(u.requests), 0) as requests, coalesce(sum(u.live_sessions), 0) as live_sessions,
            coalesce(sum(u.characters), 0) as characters
            into all_used
            from public.usage_daily u join public.profiles p on p.id = u.user_id
            where u.day = today and p.role <> 'admin';
        if (p_requests > 0 and all_used.requests + p_requests > settings.everyone_daily_requests)
            or (p_live_sessions > 0 and
                all_used.live_sessions + p_live_sessions > settings.everyone_daily_live_sessions)
            or (p_characters > 0 and all_used.characters + p_characters > settings.everyone_daily_characters) then
            return 'daily_limit';
        end if;

        if p_requests + p_live_sessions > 0 then
            insert into public.recent_requests (user_id) values (p_user);
        end if;
    end if;

    update public.usage_daily
        set requests = requests + p_requests, live_sessions = live_sessions + p_live_sessions,
            characters = characters + p_characters
        where user_id = p_user and day = today;
    return 'ok';
end;
$$;

-- Give back what was taken, when the AI service failed.
create function public.return_quota(
    p_user uuid, p_requests integer default 0, p_live_sessions integer default 0, p_characters integer default 0
) returns void
language sql security definer set search_path = '' as $$
    update public.usage_daily
        set requests = greatest(requests - greatest(p_requests, 0), 0),
            live_sessions = greatest(live_sessions - greatest(p_live_sessions, 0), 0),
            characters = greatest(characters - greatest(p_characters, 0), 0)
        where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

-- Record a call and what it cost. No words are passed in.
create function public.record_call(
    p_user uuid, p_kind text, p_model text, p_outcome text, p_cost_usd numeric, p_milliseconds integer
) returns void
language sql security definer set search_path = '' as $$
    insert into public.ai_calls (user_id, kind, model, outcome, cost_usd, milliseconds)
        values (p_user, p_kind, p_model, p_outcome, p_cost_usd, p_milliseconds);
    insert into public.usage_daily (user_id, day, cost_usd)
        values (p_user, (now() at time zone 'utc')::date, p_cost_usd)
        on conflict (user_id, day) do update set cost_usd = public.usage_daily.cost_usd + excluded.cost_usd;
$$;

-- What the signed-in person has used today and may use. An empty limit means no limit.
create function public.my_allowance() returns json
language sql stable security definer set search_path = '' as $$
    select json_build_object(
        'name', p.full_name,
        'admin', p.role = 'admin',
        'blocked', p.blocked,
        'ai_enabled', s.ai_enabled,
        'requests_used', coalesce(u.requests, 0),
        'requests_limit', case when p.role = 'admin' then null else coalesce(p.daily_requests, s.daily_requests) end,
        'live_sessions_used', coalesce(u.live_sessions, 0),
        'live_sessions_limit',
            case when p.role = 'admin' then null else coalesce(p.daily_live_sessions, s.daily_live_sessions) end)
    from public.profiles p
    cross join public.app_settings s
    left join public.usage_daily u on u.user_id = p.id and u.day = (now() at time zone 'utc')::date
    where p.id = auth.uid() and s.id;
$$;

-- Row-level security: a table with no policy is closed to everyone but the service role.
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.usage_daily enable row level security;
alter table public.recent_requests enable row level security;
alter table public.ai_calls enable row level security;

revoke all on public.profiles, public.app_settings, public.usage_daily, public.recent_requests, public.ai_calls
    from anon, authenticated;
grant select on public.profiles, public.usage_daily to authenticated;
create policy "read own profile" on public.profiles
    for select to authenticated using (id = (select auth.uid()));
create policy "read own usage" on public.usage_daily
    for select to authenticated using (user_id = (select auth.uid()));

revoke execute on function
    public.handle_new_user(),
    public.take_quota(uuid, integer, integer, integer),
    public.return_quota(uuid, integer, integer, integer),
    public.record_call(uuid, text, text, text, numeric, integer),
    public.my_allowance()
    from public, anon, authenticated;
grant execute on function
    public.take_quota(uuid, integer, integer, integer),
    public.return_quota(uuid, integer, integer, integer),
    public.record_call(uuid, text, text, text, numeric, integer)
    to service_role;
grant execute on function public.my_allowance() to authenticated;
