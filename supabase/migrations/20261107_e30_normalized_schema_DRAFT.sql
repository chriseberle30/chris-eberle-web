-- E30 / i30 — Fase 1: esquema normalizado en paralelo
-- BORRADOR. NO EJECUTAR EN PRODUCCION TODAVIA.
-- Requiere: export completo verificable de public.e30_kv, restauracion probada,
-- pruebas con una copia/staging y frontend preparado para dual-read/dual-write.
-- Este archivo NO migra ni modifica los datos actuales de e30_kv.

begin;

create table if not exists public.e30_branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  phone text,
  active boolean not null default true,
  legacy_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.e30_customers (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  phone text,
  email text,
  notes text,
  legacy_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists e30_customers_phone_idx on public.e30_customers(phone);

create table if not exists public.e30_orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint not null unique,
  branch_id uuid references public.e30_branches(id),
  customer_id uuid references public.e30_customers(id),
  status text not null default 'Recibido',
  device_brand text,
  device_model text,
  issue text,
  work_description text,
  order_type text,
  total numeric(14,2) not null default 0,
  received_at timestamptz not null default now(),
  delivered_at timestamptz,
  deleted_at timestamptz,
  legacy_id text unique,
  legacy_data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists e30_orders_status_idx on public.e30_orders(status);
create index if not exists e30_orders_branch_date_idx on public.e30_orders(branch_id, received_at desc);
create index if not exists e30_orders_customer_idx on public.e30_orders(customer_id);
create index if not exists e30_orders_active_idx on public.e30_orders(received_at desc) where deleted_at is null;

-- Contador central: bloquea la fila durante la asignacion y evita numeros repetidos
-- cuando dos telefonos/notebooks crean ordenes al mismo tiempo.
create table if not exists public.e30_sequences (
  sequence_key text primary key,
  last_value bigint not null check (last_value >= 0),
  updated_at timestamptz not null default now()
);
insert into public.e30_sequences(sequence_key,last_value)
values ('orders', 0)
on conflict (sequence_key) do nothing;

create or replace function public.e30_next_order_number()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare allocated bigint;
begin
  insert into public.e30_sequences(sequence_key,last_value)
  values ('orders', 1)
  on conflict (sequence_key)
  do update set last_value = public.e30_sequences.last_value + 1,
                updated_at = now()
  returning last_value into allocated;
  return allocated;
end;
$$;

create table if not exists public.e30_order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.e30_orders(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  method text,
  paid_at timestamptz not null default now(),
  note text,
  legacy_id text unique,
  legacy_data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists e30_order_payments_order_idx on public.e30_order_payments(order_id, paid_at);

create table if not exists public.e30_order_costs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.e30_orders(id) on delete restrict,
  concept text not null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  supplier text,
  legacy_id text unique,
  legacy_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists e30_order_costs_order_idx on public.e30_order_costs(order_id);

create table if not exists public.e30_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.e30_orders(id) on delete restrict,
  event_type text not null,
  title text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists e30_order_events_order_idx on public.e30_order_events(order_id, created_at desc);

-- Papelera reversible: no borrar fisicamente ordenes, pagos ni ventas.
create table if not exists public.e30_recycle_bin (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  snapshot jsonb not null,
  deleted_by uuid default auth.uid(),
  deleted_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid
);
create index if not exists e30_recycle_bin_deleted_idx on public.e30_recycle_bin(deleted_at desc) where restored_at is null;

create table if not exists public.e30_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid default auth.uid(),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists e30_audit_log_entity_idx on public.e30_audit_log(entity_type, entity_id, created_at desc);

create table if not exists public.e30_products (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  sku text,
  name text not null,
  category text,
  cost numeric(14,2) not null default 0,
  sale_price numeric(14,2) not null default 0,
  active boolean not null default true,
  legacy_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.e30_stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.e30_products(id) on delete restrict,
  branch_id uuid references public.e30_branches(id),
  quantity numeric(14,3) not null,
  movement_type text not null,
  reference text,
  legacy_data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists e30_stock_product_branch_idx on public.e30_stock_movements(product_id, branch_id, created_at desc);

create table if not exists public.e30_sales (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  branch_id uuid references public.e30_branches(id),
  customer_id uuid references public.e30_customers(id),
  total numeric(14,2) not null default 0,
  payment_method text,
  sold_at timestamptz not null default now(),
  legacy_data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.e30_cash_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.e30_branches(id),
  movement_type text not null,
  category text,
  concept text,
  amount numeric(14,2) not null,
  payment_method text,
  moved_at timestamptz not null default now(),
  legacy_id text unique,
  legacy_data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid()
);

create table if not exists public.e30_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

-- Todas las tablas quedan cerradas a anon y limitadas al usuario dueño autenticado.
do $$
declare t text;
begin
  foreach t in array array[
    'e30_branches','e30_customers','e30_orders','e30_sequences',
    'e30_order_payments','e30_order_costs','e30_order_events',
    'e30_recycle_bin','e30_audit_log','e30_products',
    'e30_stock_movements','e30_sales','e30_cash_movements','e30_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists e30_owner_all on public.%I', t);
    execute format(
      'create policy e30_owner_all on public.%I for all to authenticated using ((auth.jwt() ->> ''email'') = ''chriseberlecontacto@gmail.com'') with check ((auth.jwt() ->> ''email'') = ''chriseberlecontacto@gmail.com'')',
      t
    );
  end loop;
end $$;

grant usage, select on sequence public.e30_audit_log_id_seq to authenticated;
revoke all on function public.e30_next_order_number() from public, anon;
grant execute on function public.e30_next_order_number() to authenticated;

commit;

-- NOTAS DE CORTE:
-- 1) Inicializar e30_sequences con MAX(order_number) real importado, no con cero.
-- 2) Importar cada conjunto desde export completo, preservando legacy_id y legacy_data.
-- 3) Comparar cantidades, totales, saldos y numeros entre KV y tablas nuevas.
-- 4) Activar dual-write y luego lectura nueva en una rama de prueba.
-- 5) Mantener e30_kv intacta hasta validar impresiones, reportes, caja, stock y dos dispositivos.
