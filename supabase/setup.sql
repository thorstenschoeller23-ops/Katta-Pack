-- KattaPack Zentrale: Einrichtung der Datenbank in Supabase
-- Im Supabase-Dashboard unter "SQL Editor" einfügen und mit "Run" ausführen.
-- VORHER unten bei "Mitglieder" eure zwei E-Mail-Adressen und Namen eintragen.

-- 1) Tabellen
create table if not exists public.mitglieder (
  email text primary key,
  name  text not null
);

create table if not exists public.profile (
  id   uuid primary key references auth.users(id) on delete cascade,
  name text
);

create table if not exists public.docs (
  path       text primary key,
  collection text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.schluessel (
  id   int primary key default 1,
  wert text not null
);

-- 2) Wer Mitglied ist (nur eingetragene E-Mail-Adressen)
create or replace function public.ist_mitglied()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mitglieder m
    where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 3) Zugriffsregeln: nur angemeldete Mitglieder lesen und schreiben
alter table public.mitglieder enable row level security;
alter table public.profile    enable row level security;
alter table public.docs       enable row level security;
alter table public.schluessel enable row level security;

drop policy if exists mitglieder_lesen on public.mitglieder;
create policy mitglieder_lesen on public.mitglieder for select to authenticated using (public.ist_mitglied());

drop policy if exists profile_lesen on public.profile;
create policy profile_lesen on public.profile for select to authenticated using (public.ist_mitglied());
drop policy if exists profile_anlegen on public.profile;
create policy profile_anlegen on public.profile for insert to authenticated with check (public.ist_mitglied() and id = auth.uid());
drop policy if exists profile_aendern on public.profile;
create policy profile_aendern on public.profile for update to authenticated using (id = auth.uid()) with check (public.ist_mitglied() and id = auth.uid());

drop policy if exists docs_alles on public.docs;
create policy docs_alles on public.docs for all to authenticated using (public.ist_mitglied()) with check (public.ist_mitglied());

drop policy if exists schluessel_lesen on public.schluessel;
create policy schluessel_lesen on public.schluessel for select to authenticated using (public.ist_mitglied());

revoke all on public.mitglieder, public.profile, public.docs, public.schluessel from anon;

-- 4) Live-Aktualisierung (Häkchen und Notizen erscheinen sofort beim anderen)
do $$
begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null;
end $$;

-- 5) Mitglieder: HIER eure E-Mail-Adressen und Namen eintragen
insert into public.mitglieder (email, name) values
  ('erste-adresse@example.com', 'Vorname Nachname'),
  ('zweite-adresse@example.com', 'Vorname Nachname')
on conflict (email) do update set name = excluded.name;

-- 6) Schlüssel für die verschlüsselten Inhalte:
--    Die Zeile "insert into public.schluessel ..." bekommt ihr gesondert (nicht im Repository,
--    weil das Repository öffentlich ist). Sie gehört hier ans Ende und wird einmal ausgeführt.
