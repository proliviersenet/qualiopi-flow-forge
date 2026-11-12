-- =====================================================================
-- Chantier facturation — LOT 2 : interrupteur de facturation + statut
-- 12/11/2026. La commercialisation démarre courant 2027 (après la bêta) :
-- tant que facturation_active = false, AUCUN formateur n'est concerné par
-- l'abonnement (bêta-testeurs gratuits). Pour tester avant le lancement,
-- on peut activer la facturation pour une liste d'organismes de test.
-- =====================================================================

create table public.parametres_plateforme (
  cle text primary key,
  valeur jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.parametres_plateforme (cle, valeur, description) values
  ('facturation_active', 'false'::jsonb,
   'Interrupteur global : true = abonnement obligatoire pour les formateurs non exemptés (lancement commercial).'),
  ('facturation_organismes_test', '[]'::jsonb,
   'Liste d''organisme_id pour lesquels la facturation est active même si l''interrupteur global est coupé (tests).'),
  ('stripe_portail_configuration', 'null'::jsonb,
   'Identifiant de la configuration du portail client Stripe (créée automatiquement au premier usage).');

alter table public.parametres_plateforme enable row level security;
-- Aucune policy : lecture/écriture réservées aux fonctions serveur (service_role).

-- Journal d'audit : fn_journaliser_modification lit new.id (uuid), absent ici
-- (clé texte) → fonction dédiée.
create or replace function public.fn_journaliser_parametres()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.journal_modifications
    (table_source, operation, enregistrement_id, ancien_contenu, nouveau_contenu, utilisateur_id)
  values (
    'parametres_plateforme', tg_op, null,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;
create trigger trg_journal_parametres_plateforme after insert or update or delete on public.parametres_plateforme
  for each row execute function public.fn_journaliser_parametres();

-- La facturation s'applique-t-elle à cet organisme ?
create or replace function public.fn_facturation_active_pour(p_organisme_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (valeur)::text = 'true' from parametres_plateforme where cle = 'facturation_active'), false)
      or exists (
        select 1 from parametres_plateforme
        where cle = 'facturation_organismes_test'
          and valeur ? p_organisme_id::text
      );
$$;

-- Statut d'abonnement de l'organisme de l'utilisateur connecté (garde + page)
--   acces_requis = true  → le formateur doit souscrire pour utiliser l'app
create or replace function public.mon_statut_abonnement()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_ab record;
  v_active boolean;
  v_statut text;
begin
  select o.id into v_org from organismes o where o.owner_user_id = auth.uid() limit 1;
  if v_org is null then
    select p.organisme_id into v_org from profiles p where p.id = auth.uid();
  end if;
  if v_org is null then
    return jsonb_build_object('organisme_id', null, 'facturation_active', false, 'statut', 'aucun', 'acces_requis', false);
  end if;

  v_active := fn_facturation_active_pour(v_org);
  select * into v_ab from abonnements_organismes where organisme_id = v_org;
  v_statut := coalesce(v_ab.statut, 'aucun');

  return jsonb_build_object(
    'organisme_id', v_org,
    'facturation_active', v_active,
    'statut', v_statut,
    'type_compte', coalesce(v_ab.type_compte, 'standard'),
    'fin_essai', v_ab.fin_essai,
    'resiliation_effective_le', v_ab.resiliation_effective_le,
    'coupure_prevue_le', v_ab.coupure_prevue_le,
    'a_un_moyen_de_paiement', v_ab.stripe_subscription_id is not null,
    -- Accès bloqué seulement si la facturation s'applique, que le compte
    -- n'est pas exempté et qu'aucun abonnement en cours n'existe.
    'acces_requis', v_active
      and coalesce(v_ab.type_compte, 'standard') <> 'super_ambassadeur'
      and v_statut not in ('essai', 'actif', 'impaye', 'resiliation_programmee', 'exempte')
  );
end;
$$;

revoke execute on function public.fn_facturation_active_pour(uuid) from public, anon;
revoke execute on function public.mon_statut_abonnement() from public, anon;
grant execute on function public.fn_facturation_active_pour(uuid) to authenticated, service_role;
grant execute on function public.mon_statut_abonnement() to authenticated, service_role;
