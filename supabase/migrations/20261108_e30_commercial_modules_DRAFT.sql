-- E30 / i30 — Modulos comerciales complementarios
-- BORRADOR. Ejecutar unicamente junto con el esquema normalizado base,
-- despues de backup/restauracion y en entorno de prueba.

begin;

create table if not exists public.e30_budgets (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  budget_number bigint unique,
  branch_id uuid references public.e30_branches(id),
  customer_id uuid references public.e30_customers(id),
  device_brand text,
  device_model text,
  description text,
  total numeric(14,2) not null default 0,
  status text not null default 'Pendiente',
  valid_until date,
  issued_at timestamptz not null default now(),
  legacy_data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.e30_guild_accounts (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  customer_id uuid references public.e30_customers(id),
  display_name text not null,
  credit_limit numeric(14,2),
  active boolean not null default true,
  notes text,
  legacy_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.e30_guild_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.e30_guild_accounts(id) on delete restrict,
  entry_type text not null check (entry_type in ('cargo','pago','ajuste')),
  amount numeric(14,2) not null check (amount > 0),
  description text,
  order_id uuid references public.e30_orders(id) on delete restrict,
  payment_id uuid references public.e30_order_payments(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  legacy_id text unique,
  legacy_data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists e30_guild_ledger_account_idx on public.e30_guild_ledger(account_id, occurred_at desc);

create table if not exists public.e30_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.e30_sales(id) on delete restrict,
  product_id uuid references public.e30_products(id) on delete restrict,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  legacy_data jsonb not null default '{}'::jsonb
);
create index if not exists e30_sale_items_sale_idx on public.e30_sale_items(sale_id);

do $$
declare t text;
begin
  foreach t in array array['e30_budgets','e30_guild_accounts','e30_guild_ledger','e30_sale_items'] loop
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

commit;
