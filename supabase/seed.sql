-- =============================================================================
-- Seed SOLO per lo sviluppo locale (`supabase db reset`).
-- Non viene mai applicato al progetto cloud da `supabase db push`.
--
--   Admin locale:        admin@example.com / password-locale-123
--   Utente NON admin:    utente@example.com / password-locale-123  (per i test di sicurezza)
-- =============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'admin@example.com',
    extensions.crypt('password-locale-123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'utente@example.com',
    extensions.crypt('password-locale-123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  );

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  (
    gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
    '{"sub":"11111111-1111-4111-8111-111111111111","email":"admin@example.com","email_verified":true}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222',
    '{"sub":"22222222-2222-4222-8222-222222222222","email":"utente@example.com","email_verified":true}',
    'email', now(), now(), now()
  );

-- Solo il primo utente è amministratore.
insert into public.admins (user_id) values ('11111111-1111-4111-8111-111111111111');

-- Evento dimostrativo.
insert into public.events (id, name, description, budget, exchange_date, created_by)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Natale tra amici (demo)',
  'Cena e scambio dei regali a casa di Giulia. Portate qualcosa di dolce!',
  '25 €',
  date '2026-12-20',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.participants (id, event_id, name, email, avatar)
values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Mario', 'mario@example.com', 'reindeer'),
  ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Giulia', 'giulia@example.com', 'star'),
  ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Luca', 'luca@example.com', 'snowman'),
  ('a0000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Sara', null, 'tree'),
  ('a0000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Paolo', null, 'elf');

-- Mario e Giulia sono una coppia: non si fanno il regalo a vicenda.
-- Luca non può regalare a Sara (esclusione in una sola direzione).
insert into public.exclusions (event_id, giver_id, receiver_id)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004');
