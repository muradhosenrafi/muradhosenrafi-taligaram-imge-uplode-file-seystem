-- Run this entire file once in Supabase SQL Editor. No media bytes are stored here.
create table if not exists public.rafi_vault_settings (
 owner text primary key check (owner='owner'),
 secret text not null, chat text not null, bot text not null, title text not null
);
create table if not exists public.rafi_vault_entries (
 id text primary key,
 owner text not null default 'owner' check (owner='owner'),
 parent text references public.rafi_vault_entries(id) on delete restrict,
 name text not null check (length(name) between 1 and 180),
 kind text not null check(kind in ('file','folder')),
 mime text not null default '',
 size bigint not null default 0 check(size between 0 and 2147483648),
 created bigint not null,
 ready boolean not null default false
);
create index if not exists rafi_vault_entries_parent on public.rafi_vault_entries(parent);
create table if not exists public.rafi_vault_parts (
 id text primary key,
 entry text not null references public.rafi_vault_entries(id) on delete cascade,
 idx integer not null check(idx>=0),
 file text not null, message bigint not null,
 size integer not null check(size between 1 and 3145728),
 hash text not null,
 unique(entry,idx)
);
create table if not exists public.rafi_vault_login_attempts (
 id text primary key, window_start timestamptz not null, attempts integer not null
);
alter table public.rafi_vault_settings enable row level security;
alter table public.rafi_vault_entries enable row level security;
alter table public.rafi_vault_parts enable row level security;
alter table public.rafi_vault_login_attempts enable row level security;
revoke all on public.rafi_vault_settings,public.rafi_vault_entries,public.rafi_vault_parts,public.rafi_vault_login_attempts from anon,authenticated;
grant select,insert,update,delete on public.rafi_vault_settings,public.rafi_vault_entries,public.rafi_vault_parts,public.rafi_vault_login_attempts to service_role;

-- One shared atomic limit for this single-owner vault: 20 attempts per 15 minutes.
create or replace function public.vault_take_login_attempt() returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;
begin
 insert into public.rafi_vault_login_attempts(id,window_start,attempts) values('owner',clock_timestamp(),1)
 on conflict(id) do update set
 attempts=case when rafi_vault_login_attempts.window_start<clock_timestamp()-interval '15 minutes' then 1 else rafi_vault_login_attempts.attempts+1 end,
 window_start=case when rafi_vault_login_attempts.window_start<clock_timestamp()-interval '15 minutes' then clock_timestamp() else rafi_vault_login_attempts.window_start end
 returning attempts into n;
 return n<=20;
end $$;
create or replace function public.vault_complete_file(file_id text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare e public.rafi_vault_entries%rowtype; n bigint; total bigint;
begin
 select * into e from public.rafi_vault_entries where id=file_id and owner='owner' and kind='file' for update;
 if not found then return false; end if;
 select count(*),coalesce(sum(size),0) into n,total from public.rafi_vault_parts where entry=file_id;
 if n<>ceil(e.size::numeric/3145728) or total<>e.size then return false; end if;
 update public.rafi_vault_entries set ready=true where id=file_id;
 return true;
end $$;
create or replace function public.vault_remove_entry(entry_id text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform id from public.rafi_vault_entries where id=entry_id and owner='owner' for update;
 if not found then return false; end if;
 if exists(select 1 from public.rafi_vault_entries where parent=entry_id and ready=true) then return false; end if;
 delete from public.rafi_vault_entries where parent=entry_id and ready=false;
 delete from public.rafi_vault_entries where id=entry_id and owner='owner';
 return true;
end $$;
revoke all on function public.vault_take_login_attempt(),public.vault_complete_file(text),public.vault_remove_entry(text) from public,anon,authenticated;
grant execute on function public.vault_take_login_attempt(),public.vault_complete_file(text),public.vault_remove_entry(text) to service_role;
notify pgrst, 'reload schema';
