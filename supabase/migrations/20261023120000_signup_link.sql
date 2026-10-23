-- =============================================================================
-- Secret Santa — iscrizione dei partecipanti tramite link di gruppo
--
-- Principi:
--   * Ogni evento può avere un link d'iscrizione (/iscrizione#<signup_token>)
--     che l'admin apre, chiude o rigenera. Chi lo possiede può solo iscriversi:
--     non vede gli altri partecipanti né i loro link.
--   * L'iscrizione restituisce solo il token personale del nuovo iscritto.
--   * Con il proprio token personale un partecipante può modificare nome,
--     immagine e foto finché l'evento è in DRAFT.
--   * Il ruolo `anon` può caricare foto solo nella cartella di un evento in
--     DRAFT; non può leggere l'elenco dei file, sovrascriverli o cancellarli.
--   * L'admin può impostare una foto di copertina dell'evento, mostrata nella
--     pagina d'iscrizione e nelle pagine personali.
-- =============================================================================

alter table public.events
  add column signup_token text unique
    constraint events_signup_token_check check (signup_token is null or signup_token ~ '^[A-Za-z0-9_-]{43}$'),
  add column signup_open boolean not null default false,
  add column cover_path text
    constraint events_cover_path_check check (
      cover_path is null
      or (char_length(cover_path) <= 200 and cover_path ~ ('^' || id::text || '/cover-[A-Za-z0-9_-]+\.(jpg|png|webp)$'))
    );

grant update (cover_path) on public.events to authenticated;

comment on column public.events.signup_token is
  'Token segreto del link d''iscrizione. Si modifica solo con set_signup_open / regenerate_signup_token.';

-- -----------------------------------------------------------------------------
-- Funzioni interne (non eseguibili dai client)
-- -----------------------------------------------------------------------------

-- La foto deve essere un file già caricato nella cartella dell'evento e non
-- usato da un altro partecipante.
create function public.assert_photo_available(p_event_id uuid, p_photo_path text, p_participant_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_photo_path is null
     or char_length(p_photo_path) > 200
     or p_photo_path !~ ('^' || p_event_id::text || '/[A-Za-z0-9_-]+\.(jpg|png|webp)$')
     or not exists (
       select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = p_photo_path
     )
     or exists (
       select 1 from public.participants p
       where p.photo_path = p_photo_path and p.id is distinct from p_participant_id
     )
     or exists (select 1 from public.events e where e.cover_path = p_photo_path) then
    raise exception 'SS_PHOTO_INVALID';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Funzioni amministrative
-- -----------------------------------------------------------------------------

-- Apre o chiude le iscrizioni; alla prima apertura crea il token del link.
create function public.set_signup_open(p_event_id uuid, p_open boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
  v_token text;
begin
  if not public.is_admin() then
    raise exception 'SS_FORBIDDEN' using errcode = '42501';
  end if;

  select e.status into v_status from public.events e where e.id = p_event_id for update;
  if not found then
    raise exception 'SS_NOT_FOUND';
  end if;
  if p_open and v_status <> 'DRAFT' then
    raise exception 'SS_EVENT_LOCKED';
  end if;

  update public.events e
  set signup_open = coalesce(p_open, false),
      signup_token = coalesce(e.signup_token, public.generate_invite_token())
  where e.id = p_event_id
  returning e.signup_token into v_token;

  return v_token;
end;
$$;

-- Sostituisce il link d'iscrizione: quello precedente smette di funzionare.
create function public.regenerate_signup_token(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.is_admin() then
    raise exception 'SS_FORBIDDEN' using errcode = '42501';
  end if;

  update public.events e
  set signup_token = public.generate_invite_token()
  where e.id = p_event_id
  returning e.signup_token into v_token;

  if v_token is null then
    raise exception 'SS_NOT_FOUND';
  end if;
  return v_token;
end;
$$;

-- -----------------------------------------------------------------------------
-- Funzioni pubbliche del link d'iscrizione
-- -----------------------------------------------------------------------------

-- Dati dell'evento da mostrare nella pagina d'iscrizione. Zero righe se il
-- token non è valido. Nessun dato sui partecipanti.
create function public.signup_info(p_token text)
returns table (
  event_id uuid,
  event_name text,
  event_description text,
  event_budget text,
  event_exchange_date date,
  event_cover_path text,
  is_open boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.name, e.description, e.budget, e.exchange_date, e.cover_path, (e.signup_open and e.status = 'DRAFT')
  from public.events e
  where p_token ~ '^[A-Za-z0-9_-]{43}$' and e.signup_token = p_token;
$$;

-- Iscrive un nuovo partecipante e restituisce il SUO token personale.
create function public.register_participant(
  p_token text,
  p_name text,
  p_email text,
  p_avatar text,
  p_photo_path text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_status public.event_status;
  v_open boolean;
  v_count integer;
  v_participant_id uuid;
  v_token text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'SS_SIGNUP_INVALID';
  end if;

  -- FOR UPDATE serializza le iscrizioni dello stesso evento (limite di 100)
  -- e si scontra con save_draw: un'iscrizione non può infilarsi in un'estrazione.
  select e.id, e.status, e.signup_open into v_event_id, v_status, v_open
  from public.events e where e.signup_token = p_token for update;
  if not found then
    raise exception 'SS_SIGNUP_INVALID';
  end if;
  if not v_open or v_status <> 'DRAFT' then
    raise exception 'SS_SIGNUP_CLOSED';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'SS_INVALID_INPUT';
  end if;

  select count(*) into v_count from public.participants p where p.event_id = v_event_id;
  if v_count >= 100 then
    raise exception 'SS_SIGNUP_FULL';
  end if;

  if p_photo_path is not null then
    perform public.assert_photo_available(v_event_id, p_photo_path, null);
  end if;

  insert into public.participants (event_id, name, email, avatar, photo_path)
  values (v_event_id, p_name, lower(btrim(p_email)), coalesce(p_avatar, 'gift'), p_photo_path)
  returning id into v_participant_id;

  select t.token into v_token from public.invite_tokens t where t.participant_id = v_participant_id;
  return v_token;
end;
$$;

-- -----------------------------------------------------------------------------
-- Funzioni pubbliche del link personale
-- -----------------------------------------------------------------------------

-- Come nella versione iniziale, con in più la foto di copertina dell'evento.
drop function public.participant_status(text);

create function public.participant_status(p_token text)
returns table (
  participant_name text,
  event_name text,
  event_description text,
  event_budget text,
  event_exchange_date date,
  event_status public.event_status,
  has_revealed boolean,
  event_cover_path text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_participant_id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return;
  end if;

  select t.participant_id into v_participant_id from public.invite_tokens t where t.token = p_token;
  if v_participant_id is null then
    return;
  end if;

  update public.participants p set opened_at = now()
  where p.id = v_participant_id and p.opened_at is null;

  return query
  select p.name, e.name, e.description, e.budget, e.exchange_date, e.status, p.revealed_at is not null, e.cover_path
  from public.participants p
  join public.events e on e.id = p.event_id
  where p.id = v_participant_id;
end;
$$;

create function public.participant_profile(p_token text)
returns table (
  event_id uuid,
  participant_name text,
  participant_avatar text,
  participant_photo_path text,
  can_edit boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.event_id, p.name, p.avatar, p.photo_path, e.status = 'DRAFT'
  from public.invite_tokens t
  join public.participants p on p.id = t.participant_id
  join public.events e on e.id = p.event_id
  where p_token ~ '^[A-Za-z0-9_-]{43}$' and t.token = p_token;
$$;

-- Modifica nome, immagine e foto del proprietario del token (solo in DRAFT).
-- p_photo_path: nuova foto già caricata; p_remove_photo: torna all'immagine predefinita.
-- La foto sostituita resta nel bucket e viene rimossa quando l'admin elimina l'evento.
create function public.participant_update_profile(
  p_token text,
  p_name text,
  p_avatar text,
  p_photo_path text default null,
  p_remove_photo boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant_id uuid;
  v_event_id uuid;
  v_status public.event_status;
  v_old_photo text;
  v_new_photo text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'SS_NOT_FOUND';
  end if;

  select p.id, p.event_id, p.photo_path into v_participant_id, v_event_id, v_old_photo
  from public.invite_tokens t
  join public.participants p on p.id = t.participant_id
  where t.token = p_token;
  if v_participant_id is null then
    raise exception 'SS_NOT_FOUND';
  end if;

  select e.status into v_status from public.events e where e.id = v_event_id for key share;
  if v_status <> 'DRAFT' then
    raise exception 'SS_EVENT_LOCKED';
  end if;

  v_new_photo := v_old_photo;
  if coalesce(p_remove_photo, false) then
    v_new_photo := null;
  elsif p_photo_path is not null then
    perform public.assert_photo_available(v_event_id, p_photo_path, v_participant_id);
    v_new_photo := p_photo_path;
  end if;

  update public.participants p
  set name = p_name, avatar = coalesce(p_avatar, p.avatar), photo_path = v_new_photo
  where p.id = v_participant_id;
end;
$$;

-- Registra che l'email con il link personale è stata inviata (dopo l'iscrizione).
create function public.participant_mark_emailed(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.participants p
  set invited_at = now(), invite_method = 'email'
  from public.invite_tokens t
  where p_token ~ '^[A-Za-z0-9_-]{43}$' and t.token = p_token
    and p.id = t.participant_id and p.invite_method is null;
$$;

-- -----------------------------------------------------------------------------
-- Storage: caricamento delle foto dalla pagina d'iscrizione / personale
-- -----------------------------------------------------------------------------
create function public.photo_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_name, '') ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    and exists (
      select 1 from public.events e
      where e.id::text = split_part(p_name, '/', 1) and e.status = 'DRAFT'
    );
$$;

create policy photos_anon_insert on storage.objects
  for insert to anon
  with check (bucket_id = 'photos' and (select public.photo_upload_allowed(name)));

-- -----------------------------------------------------------------------------
-- Privilegi
-- -----------------------------------------------------------------------------
revoke execute on function
  public.participant_status(text),
  public.assert_photo_available(uuid, text, uuid),
  public.set_signup_open(uuid, boolean),
  public.regenerate_signup_token(uuid),
  public.signup_info(text),
  public.register_participant(text, text, text, text, text),
  public.participant_profile(text),
  public.participant_update_profile(text, text, text, text, boolean),
  public.participant_mark_emailed(text),
  public.photo_upload_allowed(text)
from public, anon, authenticated;

grant execute on function public.participant_status(text) to anon, authenticated;
grant execute on function public.set_signup_open(uuid, boolean) to authenticated;
grant execute on function public.regenerate_signup_token(uuid) to authenticated;
grant execute on function public.signup_info(text) to anon, authenticated;
grant execute on function public.register_participant(text, text, text, text, text) to anon, authenticated;
grant execute on function public.participant_profile(text) to anon, authenticated;
grant execute on function public.participant_update_profile(text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.participant_mark_emailed(text) to anon, authenticated;
grant execute on function public.photo_upload_allowed(text) to anon;
