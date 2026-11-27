-- Notifications via ntfy.sh (free push notifications) — needs pg_net + pg_cron
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.app_settings (key text primary key, value text);
alter table public.app_settings enable row level security;
drop policy if exists "members all" on public.app_settings;
create policy "members all" on public.app_settings for all to authenticated using ((select public.is_member())) with check ((select public.is_member()));

create or replace function public.inr(n numeric) returns text language sql immutable as $$
  select '₹' || trim(to_char(round(n), 'FM99,99,99,99,990'));
$$;

create or replace function public.ntfy_send(p_title text, p_message text, p_tags text[] default array['moneybag'])
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_topic text; v_url text;
begin
  select value into v_topic from public.app_settings where key = 'ntfy_topic';
  select value into v_url from public.app_settings where key = 'app_url';
  if v_topic is null then return; end if;
  perform net.http_post(
    url := 'https://ntfy.sh/',
    body := jsonb_build_object('topic', v_topic, 'title', p_title, 'message', p_message, 'tags', to_jsonb(p_tags), 'click', coalesce(v_url, '')),
    headers := '{"Content-Type":"application/json"}'::jsonb);
end $$;

create or replace function public.notify_tx() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_on text; v_label text; v_what text; v_who text; v_how text;
begin
  select value into v_on from public.app_settings where key = 'notify_on_add';
  if coalesce(v_on, 'true') <> 'true' then return new; end if;
  v_label := case new.type when 'expense' then '💸 Expense' when 'income' then '💰 Income' when 'investment' then '📈 Invested'
    when 'chitty' then '🪙 Chitty paid' when 'emi' then '🏦 EMI paid' when 'cc_bill' then '💳 Card bill paid'
    when 'chitty_payout' then '🎯 Chitty payout' when 'withdrawal' then '↩️ Redeemed' else new.type end;
  v_what := coalesce(
    (select icon || ' ' || name from public.categories where id = new.category_id),
    (select name from public.investments where id = new.ref_id),
    (select name from public.chitties where id = new.ref_id),
    (select name from public.loans where id = new.ref_id),
    (select name from public.methods where id = new.method_id and new.type = 'cc_bill'), '');
  v_who := coalesce((select name from public.people where id = new.person_id), 'Joint');
  v_how := (select name from public.methods where id = new.method_id and new.type <> 'cc_bill');
  perform public.ntfy_send(v_label || ' ' || public.inr(new.amount),
    concat_ws(' · ', nullif(v_what, ''), v_who, v_how, nullif(new.note, '')));
  return new;
end $$;

drop trigger if exists transactions_notify on public.transactions;
create trigger transactions_notify after insert on public.transactions for each row execute function public.notify_tx();

create or replace function public.daily_reminder() returns void
language plpgsql security definer set search_path = public as $$
declare v_on text; d date := (now() at time zone 'Asia/Kolkata')::date; n int; spent numeric; mtd numeric; inc numeric;
begin
  select value into v_on from public.app_settings where key = 'daily_reminder';
  if coalesce(v_on, 'true') <> 'true' then return; end if;
  select count(*), coalesce(sum(amount) filter (where type = 'expense'), 0) into n, spent from public.transactions where date = d;
  select coalesce(sum(amount) filter (where type = 'expense'), 0), coalesce(sum(amount) filter (where type = 'income'), 0)
    into mtd, inc from public.transactions where date >= date_trunc('month', d)::date and date <= d;
  if n = 0 then
    perform public.ntfy_send('📝 Add today''s expenses', 'Nothing recorded today yet. Take a minute to add today''s spends. Month so far: ' || public.inr(mtd) || ' spent.', array['memo']);
  else
    perform public.ntfy_send('📊 Today: ' || public.inr(spent) || ' spent', n || ' entries today. Month so far: ' || public.inr(mtd) || ' spent of ' || public.inr(inc) || ' income. Anything missed?', array['bar_chart']);
  end if;
end $$;

revoke execute on function public.daily_reminder() from public, anon, authenticated;
revoke execute on function public.ntfy_send(text, text, text[]) from public, anon, authenticated;
revoke execute on function public.notify_tx() from public, anon, authenticated;

-- 9:00 PM IST = 15:30 UTC
select cron.unschedule('family-money-daily') where exists (select 1 from cron.job where jobname = 'family-money-daily');
select cron.schedule('family-money-daily', '30 15 * * *', $$select public.daily_reminder()$$);
