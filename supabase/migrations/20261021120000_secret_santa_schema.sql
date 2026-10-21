-- =============================================================================
-- Secret Santa — schema iniziale
--
-- Principi:
--   * Tutte le tabelle hanno RLS attiva; solo gli amministratori (tabella admins)
--     possono leggere o modificare i dati, tramite la propria sessione Supabase Auth.
--   * Il ruolo `anon` non ha alcun privilegio sulle tabelle.
--   * Lo stato dell'evento e gli abbinamenti si modificano solo tramite funzioni
--     transazionali che rivalidano tutto (save_draw, publish_event, ...).
--   * I partecipanti accedono solo tramite le funzioni participant_status /
--     participant_reveal, che richiedono il token personale e non restituiscono
--     nulla del destinatario prima della pubblicazione.
--   * Gli errori applicativi usano messaggi con prefisso "SS_" che l'app traduce
--     in italiano senza esporre dettagli interni.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create type public.event_status as enum ('DRAFT', 'DRAWN', 'PUBLISHED', 'CLOSED');

-- -----------------------------------------------------------------------------
-- Amministratori
-- -----------------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.admins is
  'Utenti Supabase Auth autorizzati a gestire il Secret Santa. Si gestisce solo da SQL.';

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a where a.user_id = (select auth.uid())
  );
$$;

-- -----------------------------------------------------------------------------
-- Funzioni di utilità
-- -----------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 32 byte casuali (256 bit) codificati in base64url senza padding: 43 caratteri.
create function public.generate_invite_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;

-- -----------------------------------------------------------------------------
-- Eventi
-- -----------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint events_name_check check (char_length(name) between 1 and 80 and name = btrim(name)),
  description text
    constraint events_description_check check (description is null or char_length(description) <= 500),
  budget text
    constraint events_budget_check check (budget is null or char_length(budget) <= 40),
  exchange_date date,
  status public.event_status not null default 'DRAFT',
  drawn_at timestamptz,
  published_at timestamptz,
  closed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Partecipanti
-- -----------------------------------------------------------------------------
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null
    constraint participants_name_check check (char_length(name) between 1 and 60 and name = btrim(name)),
  email text
    constraint participants_email_check check (
      email is null
      or (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    ),
  avatar text not null default 'gift'
    constraint participants_avatar_check check (
      avatar in ('gift', 'tree', 'snowman', 'reindeer', 'star', 'elf', 'bell', 'cookie')
    ),
  photo_path text,
  invited_at timestamptz,
  invite_method text
    constraint participants_invite_method_check check (invite_method is null or invite_method in ('email', 'manual')),
  opened_at timestamptz,
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- La foto deve stare nella cartella dell'evento del partecipante.
  constraint participants_photo_path_check check (
    photo_path is null
    or (char_length(photo_path) <= 200 and photo_path ~ ('^' || event_id::text || '/[A-Za-z0-9_-]+\.(jpg|png|webp)$'))
  ),
  constraint participants_id_event_unique unique (id, event_id)
);

create index participants_event_id_idx on public.participants (event_id);
create unique index participants_event_name_unique on public.participants (event_id, lower(name));
create unique index participants_event_email_unique on public.participants (event_id, lower(email))
  where email is not null;

create trigger participants_set_updated_at
  before update on public.participants
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Token d'invito (link personali)
-- -----------------------------------------------------------------------------
create table public.invite_tokens (
  participant_id uuid primary key references public.participants (id) on delete cascade,
  token text not null unique
    constraint invite_tokens_token_check check (token ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz not null default now()
);

comment on table public.invite_tokens is
  'Token segreti dei link personali. Leggibili solo dagli amministratori.';

-- -----------------------------------------------------------------------------
-- Esclusioni (direzionali: giver non può regalare a receiver)
-- -----------------------------------------------------------------------------
create table public.exclusions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  giver_id uuid not null,
  receiver_id uuid not null,
  created_at timestamptz not null default now(),
  constraint exclusions_no_self check (giver_id <> receiver_id),
  constraint exclusions_unique unique (giver_id, receiver_id),
  constraint exclusions_giver_fk foreign key (giver_id, event_id)
    references public.participants (id, event_id) on delete cascade,
  constraint exclusions_receiver_fk foreign key (receiver_id, event_id)
    references public.participants (id, event_id) on delete cascade
);

create index exclusions_event_id_idx on public.exclusions (event_id);
create index exclusions_receiver_idx on public.exclusions (receiver_id, event_id);

-- -----------------------------------------------------------------------------
-- Abbinamenti (risultato dell'estrazione)
-- -----------------------------------------------------------------------------
create table public.assignments (
  event_id uuid not null references public.events (id) on delete cascade,
  giver_id uuid not null,
  receiver_id uuid not null,
  created_at timestamptz not null default now(),
  constraint assignments_pkey primary key (event_id, giver_id),
  constraint assignments_receiver_unique unique (event_id, receiver_id),
  constraint assignments_no_self check (giver_id <> receiver_id),
  constraint assignments_giver_fk foreign key (giver_id, event_id)
    references public.participants (id, event_id) on delete cascade,
  constraint assignments_receiver_fk foreign key (receiver_id, event_id)
    references public.participants (id, event_id) on delete cascade
);

create index assignments_receiver_idx on public.assignments (receiver_id, event_id);

-- -----------------------------------------------------------------------------
-- Trigger: token generato automaticamente per ogni nuovo partecipante
-- -----------------------------------------------------------------------------
create function public.create_invite_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.invite_tokens (participant_id, token)
  values (new.id, public.generate_invite_token());
  return new;
end;
$$;

create trigger participants_create_invite_token
  after insert on public.participants
  for each row execute function public.create_invite_token();

-- -----------------------------------------------------------------------------
-- Trigger di protezione dello stato.
-- Il lock FOR KEY SHARE sulla riga dell'evento si scontra con il FOR UPDATE preso
-- da save_draw/publish_event: una modifica concorrente attende e poi rilegge lo
-- stato aggiornato, quindi non può infilarsi in un'estrazione già salvata.
-- -----------------------------------------------------------------------------
create function public.guard_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_status public.event_status;
begin
  if tg_op = 'DELETE' then
    v_event_id := old.event_id;
  else
    v_event_id := new.event_id;
  end if;

  select e.status into v_status from public.events e where e.id = v_event_id for key share;
  if not found then
    -- Evento in fase di eliminazione (cascade) oppure inesistente (lo blocca la FK).
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op in ('INSERT', 'DELETE') then
    if v_status <> 'DRAFT' then
      raise exception 'SS_EVENT_LOCKED';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.event_id <> old.event_id then
      raise exception 'SS_INVALID_INPUT';
    end if;
    if v_status = 'CLOSED'
       and (new.name, new.email, new.avatar, new.photo_path)
           is distinct from (old.name, old.email, old.avatar, old.photo_path) then
      raise exception 'SS_EVENT_CLOSED';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger participants_guard
  before insert or update or delete on public.participants
  for each row execute function public.guard_participants();

create function public.guard_exclusions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_status public.event_status;
begin
  if tg_op = 'DELETE' then
    v_event_id := old.event_id;
  else
    v_event_id := new.event_id;
  end if;

  select e.status into v_status from public.events e where e.id = v_event_id for key share;
  if found and v_status <> 'DRAFT' then
    raise exception 'SS_EVENT_LOCKED';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger exclusions_guard
  before insert or update or delete on public.exclusions
  for each row execute function public.guard_exclusions();

-- -----------------------------------------------------------------------------
-- Funzioni amministrative (transazionali)
-- -----------------------------------------------------------------------------

-- Salva un'estrazione calcolata dall'applicazione dopo averla rivalidata
-- interamente rispetto ai dati correnti: tutto o niente.
create function public.save_draw(p_event_id uuid, p_pairs jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
  v_participants integer;
  v_pairs integer;
  v_givers integer;
  v_receivers integer;
  v_self integer;
begin
  if not public.is_admin() then
    raise exception 'SS_FORBIDDEN' using errcode = '42501';
  end if;

  select e.status into v_status from public.events e where e.id = p_event_id for update;
  if not found then
    raise exception 'SS_NOT_FOUND';
  end if;
  if v_status not in ('DRAFT', 'DRAWN') then
    raise exception 'SS_INVALID_STATE';
  end if;

  select count(*) into v_participants from public.participants p where p.event_id = p_event_id;
  if v_participants < 3 then
    raise exception 'SS_TOO_FEW_PARTICIPANTS';
  end if;

  if p_pairs is null or jsonb_typeof(p_pairs) <> 'array' then
    raise exception 'SS_INVALID_DRAW';
  end if;

  select
    count(*),
    count(distinct x.giver_id) filter (where g.id is not null),
    count(distinct x.receiver_id) filter (where r.id is not null),
    count(*) filter (where x.giver_id is not distinct from x.receiver_id)
  into v_pairs, v_givers, v_receivers, v_self
  from jsonb_to_recordset(p_pairs) as x (giver_id uuid, receiver_id uuid)
  left join public.participants g on g.id = x.giver_id and g.event_id = p_event_id
  left join public.participants r on r.id = x.receiver_id and r.event_id = p_event_id;

  -- Ogni partecipante regala esattamente una volta e riceve esattamente una volta.
  if v_pairs <> v_participants
     or v_givers <> v_participants
     or v_receivers <> v_participants
     or v_self > 0 then
    raise exception 'SS_INVALID_DRAW';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_pairs) as x (giver_id uuid, receiver_id uuid)
    join public.exclusions ex on ex.giver_id = x.giver_id and ex.receiver_id = x.receiver_id
  ) then
    raise exception 'SS_DRAW_VIOLATES_EXCLUSIONS';
  end if;

  delete from public.assignments a where a.event_id = p_event_id;

  insert into public.assignments (event_id, giver_id, receiver_id)
  select p_event_id, x.giver_id, x.receiver_id
  from jsonb_to_recordset(p_pairs) as x (giver_id uuid, receiver_id uuid);

  update public.participants p set revealed_at = null
  where p.event_id = p_event_id and p.revealed_at is not null;

  update public.events e
  set status = 'DRAWN', drawn_at = now(), published_at = null, closed_at = null
  where e.id = p_event_id;
end;
$$;

create function public.publish_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
  v_participants integer;
  v_assignments integer;
begin
  if not public.is_admin() then
    raise exception 'SS_FORBIDDEN' using errcode = '42501';
  end if;

  select e.status into v_status from public.events e where e.id = p_event_id for update;
  if not found then
    raise exception 'SS_NOT_FOUND';
  end if;
  if v_status <> 'DRAWN' then
    raise exception 'SS_INVALID_STATE';
  end if;

  select count(*) into v_participants from public.participants p where p.event_id = p_event_id;
  select count(*) into v_assignments from public.assignments a where a.event_id = p_event_id;
  if v_participants < 3 or v_assignments <> v_participants then
    raise exception 'SS_INCOMPLETE_DRAW';
  end if;

  update public.events e set status = 'PUBLISHED', published_at = now() where e.id = p_event_id;
end;
$$;

create function public.close_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
begin
  if not public.is_admin() then
    raise exception 'SS_FORBIDDEN' using errcode = '42501';
  end if;

  select e.status into v_status from public.events e where e.id = p_event_id for update;
  if not found then
    raise exception 'SS_NOT_FOUND';
  end if;
  if v_status <> 'PUBLISHED' then
    raise exception 'SS_INVALID_STATE';
  end if;

  update public.events e set status = 'CLOSED', closed_at = now() where e.id = p_event_id;
end;
$$;

-- Annulla l'estrazione e torna a DRAFT. Se l'estrazione era già pubblicata,
-- serve la conferma esplicita con il nome esatto dell'evento.
create function public.reset_draw(p_event_id uuid, p_confirmation text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'SS_FORBIDDEN' using errcode = '42501';
  end if;

  select e.status, e.name into v_status, v_name from public.events e where e.id = p_event_id for update;
  if not found then
    raise exception 'SS_NOT_FOUND';
  end if;
  if v_status not in ('DRAWN', 'PUBLISHED') then
    raise exception 'SS_INVALID_STATE';
  end if;
  if v_status = 'PUBLISHED'
     and lower(btrim(coalesce(p_confirmation, ''))) <> lower(v_name) then
    raise exception 'SS_CONFIRMATION_MISMATCH';
  end if;

  delete from public.assignments a where a.event_id = p_event_id;

  update public.participants p set revealed_at = null
  where p.event_id = p_event_id and p.revealed_at is not null;

  update public.events e
  set status = 'DRAFT', drawn_at = null, published_at = null, closed_at = null
  where e.id = p_event_id;
end;
$$;

create function public.regenerate_invite_token(p_participant_id uuid)
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

  update public.invite_tokens t
  set token = public.generate_invite_token(), created_at = now()
  where t.participant_id = p_participant_id
  returning t.token into v_token;

  if v_token is null then
    raise exception 'SS_NOT_FOUND';
  end if;

  update public.participants p
  set opened_at = null, invited_at = null, invite_method = null
  where p.id = p_participant_id;

  return v_token;
end;
$$;

-- -----------------------------------------------------------------------------
-- Funzioni per i partecipanti (accessibili con la chiave pubblica + token)
-- -----------------------------------------------------------------------------

-- Restituisce i dati di benvenuto del proprietario del token. Nessun dato sul
-- destinatario. Zero righe se il token non è valido.
create function public.participant_status(p_token text)
returns table (
  participant_name text,
  event_name text,
  event_description text,
  event_budget text,
  event_exchange_date date,
  event_status public.event_status,
  has_revealed boolean
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
  select p.name, e.name, e.description, e.budget, e.exchange_date, e.status, p.revealed_at is not null
  from public.participants p
  join public.events e on e.id = p.event_id
  where p.id = v_participant_id;
end;
$$;

-- Restituisce il destinatario del proprietario del token, solo se l'evento è
-- PUBLISHED o CLOSED. Prima della pubblicazione restituisce solo lo stato.
create function public.participant_reveal(p_token text)
returns table (
  event_status public.event_status,
  recipient_name text,
  recipient_avatar text,
  recipient_photo_path text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_participant_id uuid;
  v_event_id uuid;
  v_status public.event_status;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return;
  end if;

  select t.participant_id, p.event_id, e.status
  into v_participant_id, v_event_id, v_status
  from public.invite_tokens t
  join public.participants p on p.id = t.participant_id
  join public.events e on e.id = p.event_id
  where t.token = p_token;

  if v_participant_id is null then
    return;
  end if;

  if v_status not in ('PUBLISHED', 'CLOSED') then
    return query select v_status, null::text, null::text, null::text;
    return;
  end if;

  update public.participants p
  set revealed_at = now(), opened_at = coalesce(p.opened_at, now())
  where p.id = v_participant_id and p.revealed_at is null;

  return query
  select v_status, r.name, r.avatar, r.photo_path
  from public.assignments a
  join public.participants r on r.id = a.receiver_id
  where a.event_id = v_event_id and a.giver_id = v_participant_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.events enable row level security;
alter table public.participants enable row level security;
alter table public.invite_tokens enable row level security;
alter table public.exclusions enable row level security;
alter table public.assignments enable row level security;

create policy admins_select_self on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy events_admin_select on public.events
  for select to authenticated using ((select public.is_admin()));
create policy events_admin_insert on public.events
  for insert to authenticated with check ((select public.is_admin()));
create policy events_admin_update on public.events
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy events_admin_delete on public.events
  for delete to authenticated using ((select public.is_admin()));

create policy participants_admin_select on public.participants
  for select to authenticated using ((select public.is_admin()));
create policy participants_admin_insert on public.participants
  for insert to authenticated with check ((select public.is_admin()));
create policy participants_admin_update on public.participants
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy participants_admin_delete on public.participants
  for delete to authenticated using ((select public.is_admin()));

create policy invite_tokens_admin_select on public.invite_tokens
  for select to authenticated using ((select public.is_admin()));

create policy exclusions_admin_select on public.exclusions
  for select to authenticated using ((select public.is_admin()));
create policy exclusions_admin_insert on public.exclusions
  for insert to authenticated with check ((select public.is_admin()));
create policy exclusions_admin_delete on public.exclusions
  for delete to authenticated using ((select public.is_admin()));

create policy assignments_admin_select on public.assignments
  for select to authenticated using ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- Privilegi: niente per anon; per authenticated solo le colonne necessarie.
-- Lo stato dell'evento, i token e gli abbinamenti non sono scrivibili direttamente.
-- -----------------------------------------------------------------------------
revoke all on public.admins, public.events, public.participants, public.invite_tokens,
  public.exclusions, public.assignments from anon, authenticated;

grant select on public.admins to authenticated;

grant select, delete on public.events to authenticated;
grant insert (name, description, budget, exchange_date) on public.events to authenticated;
grant update (name, description, budget, exchange_date) on public.events to authenticated;

grant select, delete on public.participants to authenticated;
grant insert (event_id, name, email, avatar, photo_path) on public.participants to authenticated;
grant update (name, email, avatar, photo_path, invited_at, invite_method) on public.participants to authenticated;

grant select on public.invite_tokens to authenticated;

grant select, delete on public.exclusions to authenticated;
grant insert (event_id, giver_id, receiver_id) on public.exclusions to authenticated;

grant select on public.assignments to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.save_draw(uuid, jsonb) to authenticated;
grant execute on function public.publish_event(uuid) to authenticated;
grant execute on function public.close_event(uuid) to authenticated;
grant execute on function public.reset_draw(uuid, text) to authenticated;
grant execute on function public.regenerate_invite_token(uuid) to authenticated;
grant execute on function public.participant_status(text) to anon, authenticated;
grant execute on function public.participant_reveal(text) to anon, authenticated;

-- Le funzioni create in futuro non devono essere eseguibili da anon per default.
alter default privileges in schema public revoke execute on functions from public, anon;

-- -----------------------------------------------------------------------------
-- Storage: bucket delle fotografie
-- Bucket pubblico in sola lettura tramite URL non indovinabili
-- (<event_id>/<uuid casuale>.<ext>); l'elenco dei file e le scritture sono
-- consentiti solo agli amministratori.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy photos_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (select public.is_admin()));
create policy photos_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (select public.is_admin()));
create policy photos_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (select public.is_admin()))
  with check (bucket_id = 'photos' and (select public.is_admin()));
create policy photos_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (select public.is_admin()));
