-- Chantier facturation, lot 6 : animation du parrainage et pilotage (12/11/2026)
--
-- Décisions Olivier (12/11) :
--  - 5 filleuls maximum par parrain et par année civile ;
--  - 3 filleuls confirmés = badge Membre Argent + 1 mois offert en bonus ;
--  - 5 filleuls confirmés = badge Membre Or + sessions offertes pendant 1 an
--    à compter de l'obtention du badge ;
--  - un Membre Or ne peut plus parrainer tant qu'il bénéficie de ses sessions
--    offertes (pas de cumul) ;
--  - relance régulière des formateurs (progression et badge sur le tableau de bord) ;
--  - mois offerts manuels par l'administrateur : 2 maximum par organisme et par an.
-- Un filleul « confirmé » = a réglé sa première facture (cf. lot 5).
-- Les seuils sont réglables depuis le superadmin (parametres_plateforme).

-- 1. Règles du parrainage
insert into parametres_plateforme (cle, valeur, description)
values ('parrainage_regles',
        '{"max_filleuls_par_an": 5, "seuil_argent": 3, "seuil_or": 5, "duree_sessions_offertes_mois": 12}'::jsonb,
        'Parrainage : quota annuel de filleuls par parrain, seuils des badges Argent / Or, durée des sessions offertes (badge Or)')
on conflict (cle) do nothing;

create or replace function public.fn_regle_parrainage(p_cle text)
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce((select (valeur ->> p_cle)::int from parametres_plateforme where cle = 'parrainage_regles'),
                  case p_cle when 'max_filleuls_par_an' then 5 when 'seuil_argent' then 3
                             when 'seuil_or' then 5 when 'duree_sessions_offertes_mois' then 12 end);
$$;
revoke all on function public.fn_regle_parrainage(text) from public, anon;

-- 2. Badges
create table if not exists public.badges_parrainage (
  id uuid primary key default gen_random_uuid(),
  organisme_id uuid not null references organismes(id) on delete cascade,
  niveau text not null check (niveau in ('argent', 'or')),
  obtenu_le timestamptz not null default now(),
  filleuls_confirmes int not null,
  sessions_offertes_jusqu_au timestamptz,
  created_at timestamptz not null default now(),
  unique (organisme_id, niveau)
);
alter table public.badges_parrainage enable row level security;
drop policy if exists badges_parrainage_select_membre on public.badges_parrainage;
create policy badges_parrainage_select_membre on public.badges_parrainage
  for select to authenticated using (fn_est_membre_organisme(organisme_id));

-- 3. Nouveaux motifs / notifications
alter table public.mois_offerts drop constraint if exists mois_offerts_motif_check;
alter table public.mois_offerts add constraint mois_offerts_motif_check
  check (motif in ('parrainage_parrain', 'parrainage_filleul', 'offert_ambassadeur', 'ajustement_manuel', 'bonus_badge_argent'));

alter table public.notifications_abonnement drop constraint if exists notifications_abonnement_type_check;
alter table public.notifications_abonnement add constraint notifications_abonnement_type_check
  check (type in ('fin_essai_rappel', 'impaye_alerte', 'impaye_relance_j2', 'coupure', 'reactivation',
                  'resiliation_confirmee', 'carte_expiration', 'parrainage_confirme', 'bienvenue_filleul',
                  'parrainage_relance', 'badge_argent', 'badge_or'));

-- 4. Quota annuel : parrainages (en essai ou confirmés) de l'année civile en cours
create or replace function public.fn_parrainages_annee(p_parrain uuid)
returns int
language sql stable security definer set search_path = public
as $$
  select count(*)::int from parrainages
   where parrain_organisme_id = p_parrain and statut <> 'annule'
     and date_trunc('year', inscrit_le at time zone 'Europe/Paris') = date_trunc('year', now() at time zone 'Europe/Paris');
$$;
revoke all on function public.fn_parrainages_annee(uuid) from public, anon;

-- Sessions offertes (badge Or) : date de fin, ou null
create or replace function public.fn_sessions_offertes_jusqu_au(p_organisme_id uuid)
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select sessions_offertes_jusqu_au from badges_parrainage where organisme_id = p_organisme_id and niveau = 'or';
$$;
revoke all on function public.fn_sessions_offertes_jusqu_au(uuid) from public, anon;

-- Parrainage en pause : Membre Or pendant ses sessions offertes (date de fin, ou null)
create or replace function public.fn_parrainage_en_pause_jusqu_au(p_organisme_id uuid)
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select sessions_offertes_jusqu_au from badges_parrainage
   where organisme_id = p_organisme_id and niveau = 'or' and sessions_offertes_jusqu_au > now();
$$;
revoke all on function public.fn_parrainage_en_pause_jusqu_au(uuid) from public, anon;

-- Mois offerts manuellement (administrateur) dans l'année civile en cours
create or replace function public.fn_mois_manuels_annee(p_organisme_id uuid)
returns int
language sql stable security definer set search_path = public
as $$
  select count(*)::int from mois_offerts
   where organisme_id = p_organisme_id and motif in ('ajustement_manuel', 'offert_ambassadeur')
     and date_trunc('year', accorde_le at time zone 'Europe/Paris') = date_trunc('year', now() at time zone 'Europe/Paris');
$$;
revoke all on function public.fn_mois_manuels_annee(uuid) from public, anon;

-- 5. Synthèse « Parrainage » enrichie (page Abonnement et tableau de bord)
create or replace function public.mon_parrainage()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid := fn_mon_organisme();
  v_solde record;
  v_confirmes int;
begin
  if v_org is null then return jsonb_build_object('disponible', false); end if;
  if not fn_facturation_active_pour(v_org) then
    return jsonb_build_object('disponible', false);
  end if;
  select coalesce(mois_gagnes, 0) as gagnes, coalesce(mois_restants, 0) as restants
    into v_solde from v_solde_mois_offerts where organisme_id = v_org;
  select count(*) into v_confirmes from parrainages where parrain_organisme_id = v_org and statut = 'confirme';
  return jsonb_build_object(
    'disponible', true,
    'code', fn_code_parrainage(v_org),
    'filleuls_en_attente', (select count(*) from parrainages where parrain_organisme_id = v_org and statut = 'en_attente'),
    'filleuls_confirmes', v_confirmes,
    'filleuls_annee', fn_parrainages_annee(v_org),
    'max_filleuls_par_an', fn_regle_parrainage('max_filleuls_par_an'),
    'seuil_argent', fn_regle_parrainage('seuil_argent'),
    'seuil_or', fn_regle_parrainage('seuil_or'),
    'badge', (select niveau from badges_parrainage where organisme_id = v_org
              order by case niveau when 'or' then 1 else 2 end limit 1),
    'sessions_offertes_jusqu_au', fn_sessions_offertes_jusqu_au(v_org),
    'parrainage_en_pause_jusqu_au', fn_parrainage_en_pause_jusqu_au(v_org),
    'mois_gagnes', coalesce(v_solde.gagnes, 0),
    'mois_restants', coalesce(v_solde.restants, 0),
    'parrain', (select o.raison_sociale from parrainages pa join organismes o on o.id = pa.parrain_organisme_id
                where pa.filleul_organisme_id = v_org and pa.statut <> 'annule')
  );
end;
$$;
revoke all on function public.mon_parrainage() from public, anon;
grant execute on function public.mon_parrainage() to authenticated;

-- 6. Vérification d'un code : + quota annuel du parrain
create or replace function public.verifier_code_parrainage(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_org uuid := fn_mon_organisme();
  v_code record;
begin
  select c.organisme_id, o.raison_sociale into v_code
    from codes_parrainage c join organismes o on o.id = c.organisme_id
   where c.code = upper(trim(p_code)) and c.actif;
  if v_code.organisme_id is null then
    return jsonb_build_object('valide', false, 'raison', 'Code inconnu.');
  end if;
  if v_code.organisme_id = v_org then
    return jsonb_build_object('valide', false, 'raison', 'Vous ne pouvez pas utiliser votre propre code.');
  end if;
  if exists (select 1 from abonnements_organismes where organisme_id = v_org and stripe_subscription_id is not null) then
    return jsonb_build_object('valide', false, 'raison', 'Le parrainage est réservé aux nouveaux abonnés.');
  end if;
  if fn_parrainage_en_pause_jusqu_au(v_code.organisme_id) is not null then
    return jsonb_build_object('valide', false, 'raison', 'Ce parrain (Membre Or) ne peut pas parrainer pour le moment.');
  end if;
  if fn_parrainages_annee(v_code.organisme_id) >= fn_regle_parrainage('max_filleuls_par_an') then
    return jsonb_build_object('valide', false, 'raison', 'Ce parrain a atteint son nombre maximum de filleuls pour cette année.');
  end if;
  return jsonb_build_object('valide', true, 'parrain', v_code.raison_sociale);
end;
$$;
revoke all on function public.verifier_code_parrainage(text) from public, anon;
grant execute on function public.verifier_code_parrainage(text) to authenticated;
