-- KattaPack Zentrale: Nutzer verwalten
-- Teil A EINMAL im SQL Editor ausführen. Danach reicht jeweils eine Zeile aus Teil B.

-- ===== Teil A: Hilfsfunktionen anlegen (einmalig) =====
create extension if not exists pgcrypto with schema extensions;

create or replace function public.neuer_nutzer(p_email text, p_name text, p_passwort text)
returns text
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  e   text := lower(trim(p_email));
  uid uuid;
begin
  if length(coalesce(p_passwort, '')) < 8 then
    raise exception 'Das Passwort muss mindestens 8 Zeichen haben.';
  end if;

  select id into uid from auth.users where lower(email) = e;

  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e,
            crypt(p_passwort, gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text,
            jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true),
            'email', now(), now(), now());
  else
    update auth.users set encrypted_password = crypt(p_passwort, gen_salt('bf')), updated_at = now() where id = uid;
  end if;

  insert into public.mitglieder (email, name) values (e, p_name)
  on conflict (email) do update set name = excluded.name;

  return 'Fertig: ' || e || ' kann sich jetzt anmelden.';
end;
$$;

create or replace function public.nutzer_entfernen(p_email text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  e text := lower(trim(p_email));
begin
  delete from public.mitglieder where lower(email) = e;
  delete from auth.users where lower(email) = e;
  return 'Entfernt: ' || e;
end;
$$;

-- Nur im SQL Editor nutzbar, nicht über die Webseite
revoke all on function public.neuer_nutzer(text, text, text) from public, anon, authenticated;
revoke all on function public.nutzer_entfernen(text) from public, anon, authenticated;


-- ===== Teil B: im Alltag (Werte anpassen, nur die gewünschte Zeile ausführen) =====

-- Neuen Nutzer anlegen (oder Passwort eines bestehenden ändern):
-- select public.neuer_nutzer('neue-adresse@example.com', 'Vorname Nachname', 'SicheresPasswort123');

-- Nutzer entfernen:
-- select public.nutzer_entfernen('adresse@example.com');

-- Alle Mitglieder anzeigen:
-- select m.email, m.name, (u.id is not null) as hat_zugang from public.mitglieder m left join auth.users u on lower(u.email) = m.email;
