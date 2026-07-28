-- Onboarding & aide contextuelle (Qualios) — table générique pour mémoriser,
-- par utilisateur, les popups d'aide déjà vues (tour de bienvenue, aide BPF,
-- aide préparation d'audit, etc.), afin de ne jamais les réafficher automatiquement
-- une fois qu'elles ont été vues/fermées. Chaque "hint" est identifié par une clé
-- libre (hint_key), ce qui permet d'ajouter de nouvelles popups sans migration.
create table if not exists public.ui_hints_seen (
  user_id uuid not null references auth.users(id) on delete cascade,
  hint_key text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, hint_key)
);

alter table public.ui_hints_seen enable row level security;

create policy "Users can view their own seen hints"
  on public.ui_hints_seen for select
  using (auth.uid() = user_id);

create policy "Users can insert their own seen hints"
  on public.ui_hints_seen for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own seen hints"
  on public.ui_hints_seen for delete
  using (auth.uid() = user_id);
