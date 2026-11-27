\set ON_ERROR_STOP on
create function public.expect(ok boolean, what text) returns void language plpgsql as
    $$ begin if ok is not true then raise exception 'FAIL %', what; end if; raise notice 'PASS %', what; end $$;
grant execute on function public.expect(boolean, text) to anon, authenticated, service_role;

insert into auth.users (id, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000001', '{"full_name": "Amina", "role": "admin", "blocked": false}'),
    ('00000000-0000-0000-0000-000000000002', '{"name": "Brian"}'),
    ('00000000-0000-0000-0000-000000000003', '{}');
select expect((select role = 'user' and full_name = 'Amina' from profiles
    where id = '00000000-0000-0000-0000-000000000001'), 'sign-up data cannot make an admin');
select expect((select full_name = 'Brian' from profiles where id = '00000000-0000-0000-0000-000000000002'),
    'a Google name is kept');

-- The daily limit, with the limit a minute out of the way.
update app_settings set requests_per_minute = 1000;
select expect((select count(*) = 50 from generate_series(1, 50)
    where take_quota('00000000-0000-0000-0000-000000000001', 1) = 'ok'), 'fifty requests a day are allowed');
select expect(take_quota('00000000-0000-0000-0000-000000000001', 1) = 'daily_limit', 'the fifty-first is not');
select expect((select requests = 50 from usage_daily where user_id = '00000000-0000-0000-0000-000000000001'),
    'a refused request is not counted');
select return_quota('00000000-0000-0000-0000-000000000001', 1);
select expect(take_quota('00000000-0000-0000-0000-000000000001', 1) = 'ok', 'a returned request can be used again');
select expect((select count(*) = 3 from generate_series(1, 5)
    where take_quota('00000000-0000-0000-0000-000000000001', 0, 1) = 'ok'), 'three live sessions a day are allowed');
select expect(take_quota('00000000-0000-0000-0000-000000000001', 0, 0, 20000) = 'ok', 'reading aloud has room');
select expect(take_quota('00000000-0000-0000-0000-000000000001', 0, 0, 1) = 'daily_limit', 'and then none');

update profiles set daily_requests = 2 where id = '00000000-0000-0000-0000-000000000002';
select expect((select count(*) = 2 from generate_series(1, 4)
    where take_quota('00000000-0000-0000-0000-000000000002', 1) = 'ok'), 'a person''s own limit applies');

update app_settings set requests_per_minute = 5;
select expect((select count(*) = 5 from generate_series(1, 9)
    where take_quota('00000000-0000-0000-0000-000000000003', 1) = 'ok'), 'five a minute, where set');
select expect(take_quota('00000000-0000-0000-0000-000000000003', 1) = 'too_many_requests', 'then wait');
select expect(take_quota('00000000-0000-0000-0000-000000000003', 0, 0, 10) = 'ok',
    'reading aloud is not held by the limit a minute');
update recent_requests set taken_at = taken_at - interval '2 minutes';
select expect(take_quota('00000000-0000-0000-0000-000000000003', 1) = 'ok', 'a minute later, again');

update app_settings set everyone_daily_requests = (select sum(requests) from usage_daily), requests_per_minute = 1000;
select expect(take_quota('00000000-0000-0000-0000-000000000003', 1) = 'daily_limit',
    'everyone together has a ceiling');

update profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000001';
update app_settings set requests_per_minute = 1;
select expect((select count(*) = 200 from generate_series(1, 200)
    where take_quota('00000000-0000-0000-0000-000000000001', 1) = 'ok'), 'an admin has no limit');
select expect((select count(*) = 10 from generate_series(1, 10)
    where take_quota('00000000-0000-0000-0000-000000000001', 0, 1) = 'ok'), 'nor on live sessions');

update profiles set blocked = true where id = '00000000-0000-0000-0000-000000000001';
select expect(take_quota('00000000-0000-0000-0000-000000000001', 1) = 'blocked', 'a blocked person is refused');
select expect(take_quota('00000000-0000-0000-0000-000000000009', 1) = 'blocked', 'so is one with no profile');
update profiles set blocked = false where id = '00000000-0000-0000-0000-000000000001';
update app_settings set ai_enabled = false;
select expect(take_quota('00000000-0000-0000-0000-000000000001', 1) = 'ai_off', 'the switch stops admins too');
update app_settings set ai_enabled = true;

select record_call('00000000-0000-0000-0000-000000000002', 'assistant', 'm', 'replied', 0.001, 20);
select record_call('00000000-0000-0000-0000-000000000002', 'speak', 'm', 'replied', 0.002, 20);
select expect((select cost_usd = 0.003 from usage_daily where user_id = '00000000-0000-0000-0000-000000000002'),
    'costs add up');

-- As a signed-in person.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select expect((select count(*) = 1 from profiles), 'a person sees only their own profile');
select expect((select count(*) = 1 from usage_daily), 'and only their own usage');
select expect((select my_allowance() ->> 'requests_limit' = '2' and my_allowance() ->> 'requests_used' = '2'),
    'and their allowance');
create function pg_temp.refused(command text) returns boolean language plpgsql as
    $$ begin execute command; return false; exception when insufficient_privilege then return true; end $$;
select expect(pg_temp.refused('update profiles set role = ''admin'''), 'cannot make themselves an admin');
select expect(pg_temp.refused('update usage_daily set requests = 0'), 'cannot reset their usage');
select expect(pg_temp.refused('delete from usage_daily'), 'cannot delete their usage');
select expect(pg_temp.refused('select * from app_settings'), 'cannot read the settings');
select expect(pg_temp.refused('select * from ai_calls'), 'cannot read the calls');
select expect(pg_temp.refused('select take_quota(auth.uid(), 1)'), 'cannot take quota');
select expect(pg_temp.refused('select return_quota(auth.uid(), 100)'), 'cannot give themselves quota');
select expect(pg_temp.refused('select record_call(auth.uid(), ''speak'', '''', ''x'', 0, 0)'), 'cannot write calls');
set role anon;
select expect(pg_temp.refused('select * from profiles'), 'someone not signed in sees no profiles');
select expect(pg_temp.refused('select my_allowance()'), 'and has no allowance');
reset role;
