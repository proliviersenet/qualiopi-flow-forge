alter table public.tarifs
  add column stripe_product_id text,
  add column stripe_tax_rate_id text,
  add column stripe_mode text check (stripe_mode in ('test', 'live')),
  add column synchronise_le timestamptz;
