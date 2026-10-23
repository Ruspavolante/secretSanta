-- =============================================================================
-- Secret Santa — account degli organizzatori
--
-- Principi:
--   * Chiunque può creare un account (Supabase Auth) e gestire i PROPRI eventi:
--     ogni evento appartiene a chi l'ha creato (events.created_by).
--   * Un organizzatore non vede né modifica eventi, partecipanti, token, foto o
--     abbinamenti di altri organizzatori: RLS e funzioni controllano owns_event().
--   * La tabella admins non dà più privilegi (resta per compatibilità).
--   * Limiti anti-abuso: 20 eventi per organizzatore, 100 partecipanti per evento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Proprietà degli eventi
-- -----------------------------------------------------------------------------

-- Gli eventi creati prima di questa migrazione senza proprietario vanno al primo admin.
update public.events e
set created_by = (select a.user_id from public.admins a order by a.created_at limit 1)
where e.created_by is null;

-- Eliminando un account si eliminano i suoi eventi (e in cascata tutto il resto).
alter table public.events drop constraint events_created_by_fkey;
alter table public.events
  add constraint events_created_by_fkey foreign key (created_by) references auth.users (id) on delete cascade;

create index events_created_by_idx on public.events (created_by);

create function public.owns_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.created_by = (select auth.uid())
  );
$$;

-- Foto: la prima cartella del percorso è l'id di un evento dell'utente corrente.
create function public.owns_photo_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(p_name, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/|$)'
      then public.owns_event(split_part(p_name, '/', 1)::uuid)
    else false
  end;
$$;

-- -----------------------------------------------------------------------------
-- Limiti anti-abuso (la registrazione è aperta a chiunque)
-- -----------------------------------------------------------------------------
create function public.enforce_event_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Il proprietario è verificato dalla policy RLS (created_by = auth.uid()).
  if new.created_by is null then
    return new;
  end if;
  -- Serializza le creazioni dello stesso organizzatore.
  perform pg_advisory_xact_lock(hashtextextended(new.created_by::text, 0));
  if (select count(*) from public.events e where e.created_by = new.created_by) >= 20 then
    raise exception 'SS_TOO_MANY_EVENTS';
  end if;
  return new;
end;
$$;

create trigger events_enforce_limit
  before insert on public.events
  for each row execute function public.enforce_event_limit();

create function public.enforce_participant_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Il lock sulla riga dell'evento (preso anche da guard_participants) serializza gli inserimenti.
  perform 1 from public.events e where e.id = new.event_id for update;
  if (select count(*) from public.participants p where p.event_id = new.event_id) >= 100 then
    raise exception 'SS_EVENT_FULL';
  end if;
  return new;
end;
$$;

create trigger participants_enforce_limit
  before insert on public.participants
  for each row execute function public.enforce_participant_limit();

-- -----------------------------------------------------------------------------
-- Row Level Security: ognuno vede solo i propri eventi
-- -----------------------------------------------------------------------------
drop policy events_admin_select on public.events;
drop policy events_admin_insert on public.events;
drop policy events_admin_update on public.events;
drop policy events_admin_delete on public.events;
drop policy participants_admin_select on public.participants;
drop policy participants_admin_insert on public.participants;
drop policy participants_admin_update on public.participants;
drop policy participants_admin_delete on public.participants;
drop policy invite_tokens_admin_select on public.invite_tokens;
drop policy exclusions_admin_select on public.exclusions;
drop policy exclusions_admin_insert on public.exclusions;
drop policy exclusions_admin_delete on public.exclusions;
drop policy assignments_admin_select on public.assignments;

create policy events_owner_select on public.events
  for select to authenticated using (created_by = (select auth.uid()));
create policy events_owner_insert on public.events
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy events_owner_update on public.events
  for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy events_owner_delete on public.events
  for delete to authenticated using (created_by = (select auth.uid()));

create policy participants_owner_select on public.participants
  for select to authenticated using (public.owns_event(event_id));
create policy participants_owner_insert on public.participants
  for insert to authenticated with check (public.owns_event(event_id));
create policy participants_owner_update on public.participants
  for update to authenticated using (public.owns_event(event_id)) with check (public.owns_event(event_id));
create policy participants_owner_delete on public.participants
  for delete to authenticated using (public.owns_event(event_id));

create policy invite_tokens_owner_select on public.invite_tokens
  for select to authenticated using (
    exists (
      select 1 from public.participants p
      where p.id = participant_id and public.owns_event(p.event_id)
    )
  );

create policy exclusions_owner_select on public.exclusions
  for select to authenticated using (public.owns_event(event_id));
create policy exclusions_owner_insert on public.exclusions
  for insert to authenticated with check (public.owns_event(event_id));
create policy exclusions_owner_delete on public.exclusions
  for delete to authenticated using (public.owns_event(event_id));

create policy assignments_owner_select on public.assignments
  for select to authenticated using (public.owns_event(event_id));

-- Storage: lettura dell'elenco, caricamento, sostituzione e cancellazione solo
-- nelle cartelle dei propri eventi (la lettura pubblica tramite URL non cambia).
drop policy photos_admin_select on storage.objects;
drop policy photos_admin_insert on storage.objects;
drop policy photos_admin_update on storage.objects;
drop policy photos_admin_delete on storage.objects;

create policy photos_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.owns_photo_path(name));
create policy photos_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public.owns_photo_path(name));
create policy photos_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and public.owns_photo_path(name))
  with check (bucket_id = 'photos' and public.owns_photo_path(name));
create policy photos_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.owns_photo_path(name));

-- -----------------------------------------------------------------------------
-- Eliminazione del proprio account (eventi e dati collegati in cascata).
-- I file delle foto vengono rimossi dall'app prima di chiamare questa funzione.
-- -----------------------------------------------------------------------------
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'SS_FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.events e where e.created_by = v_user;
  delete from auth.users u where u.id = v_user;
end;
$$;

-- -----------------------------------------------------------------------------
-- Funzioni amministrative: il controllo admin diventa "l'evento è tuo"
-- -----------------------------------------------------------------------------

create or replace function public.save_draw(p_event_id uuid, p_pairs jsonb)
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
  if not public.owns_event(p_event_id) then
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

create or replace function public.publish_event(p_event_id uuid)
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
  if not public.owns_event(p_event_id) then
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

create or replace function public.close_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
begin
  if not public.owns_event(p_event_id) then
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

create or replace function public.reset_draw(p_event_id uuid, p_confirmation text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
  v_name text;
begin
  if not public.owns_event(p_event_id) then
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

create or replace function public.regenerate_invite_token(p_participant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not exists (
    select 1 from public.participants p
    where p.id = p_participant_id and public.owns_event(p.event_id)
  ) then
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

create or replace function public.set_signup_open(p_event_id uuid, p_open boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
  v_token text;
begin
  if not public.owns_event(p_event_id) then
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

create or replace function public.regenerate_signup_token(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.owns_event(p_event_id) then
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
-- Privilegi
-- -----------------------------------------------------------------------------
revoke execute on function
  public.owns_event(uuid),
  public.owns_photo_path(text),
  public.enforce_event_limit(),
  public.enforce_participant_limit(),
  public.delete_my_account()
from public, anon, authenticated;

grant execute on function public.owns_event(uuid) to authenticated;
grant execute on function public.owns_photo_path(text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
