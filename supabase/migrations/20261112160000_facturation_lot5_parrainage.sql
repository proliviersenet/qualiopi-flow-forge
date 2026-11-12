-- Chantier facturation, lot 5 : parrainage (12/11/2026)
--
-- Règle (décision Olivier) : 1 mois d'abonnement offert au parrain ET au
-- filleul. Le parrainage est confirmé quand le filleul règle sa première
-- facture payante (fin d'essai) : pas de mois offert pour un essai abandonné.
-- Le mois offert est déduit de la facture du 1er du mois suivant (ligne
-- négative du montant de l'abonnement ; les sessions restent facturées).
--
-- Tables existantes (lot 1) : codes_parrainage, parrainages, mois_offerts
-- (registre append-only), v_solde_mois_offerts.
-- Ici : génération du code, synthèse pour l'écran, vérification d'un code.

-- Organisme du formateur connecté (titulaire, sinon rattachement)
create or replace function public.fn_mon_organisme()
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select o.id from organismes o where o.owner_user_id = auth.uid() limit 1),
    (select p.organisme_id from profiles p where p.id = auth.uid())
  );
$$;
revoke all on function public.fn_mon_organisme() from public, anon;
grant execute on function public.fn_mon_organisme() to authenticated;

-- Code lisible et unique : 6 premières lettres de la raison sociale + 3 chiffres
create or replace function public.fn_code_parrainage(p_organisme_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_code text;
  v_base text;
  v_essai int := 0;
begin
  select code into v_code from codes_parrainage where organisme_id = p_organisme_id;
  if v_code is not null then return v_code; end if;

  select upper(regexp_replace(translate(coalesce(raison_sociale, 'QUALIO'),
           'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC'), '[^A-Za-z]', '', 'g'))
    into v_base from organismes where id = p_organisme_id;
  v_base := left(coalesce(nullif(v_base, ''), 'QUALIO'), 6);

  loop
    v_essai := v_essai + 1;
    v_code := v_base || '-' || lpad((floor(random() * 1000))::int::text, 3, '0');
    begin
      insert into codes_parrainage (organisme_id, code, type)
      values (p_organisme_id, v_code,
              case when exists (select 1 from abonnements_organismes a
                                where a.organisme_id = p_organisme_id and a.type_compte = 'super_ambassadeur')
                   then 'super_ambassadeur' else 'standard' end);
      return v_code;
    exception when unique_violation then
      -- code déjà pris (ou organisme déjà doté par un appel concurrent)
      select code into v_code from codes_parrainage where organisme_id = p_organisme_id;
      if v_code is not null then return v_code; end if;
      if v_essai > 20 then raise exception 'Impossible de générer un code de parrainage unique'; end if;
    end;
  end loop;
end;
$$;
revoke all on function public.fn_code_parrainage(uuid) from public, anon, authenticated;

-- Synthèse « Parrainage » pour la page Abonnement et factures
create or replace function public.mon_parrainage()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid := fn_mon_organisme();
  v_solde record;
begin
  if v_org is null then return jsonb_build_object('disponible', false); end if;
  if not fn_facturation_active_pour(v_org) then
    return jsonb_build_object('disponible', false);
  end if;
  select coalesce(mois_gagnes, 0) as gagnes, coalesce(mois_restants, 0) as restants
    into v_solde from v_solde_mois_offerts where organisme_id = v_org;
  return jsonb_build_object(
    'disponible', true,
    'code', fn_code_parrainage(v_org),
    'filleuls_en_attente', (select count(*) from parrainages where parrain_organisme_id = v_org and statut = 'en_attente'),
    'filleuls_confirmes', (select count(*) from parrainages where parrain_organisme_id = v_org and statut = 'confirme'),
    'mois_gagnes', coalesce(v_solde.gagnes, 0),
    'mois_restants', coalesce(v_solde.restants, 0),
    'parrain', (select o.raison_sociale from parrainages pa join organismes o on o.id = pa.parrain_organisme_id
                where pa.filleul_organisme_id = v_org and pa.statut <> 'annule')
  );
end;
$$;
revoke all on function public.mon_parrainage() from public, anon;
grant execute on function public.mon_parrainage() to authenticated;

-- Vérifie un code saisi au démarrage de l'essai (ne révèle que le nom du parrain)
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
  return jsonb_build_object('valide', true, 'parrain', v_code.raison_sociale);
end;
$$;
revoke all on function public.verifier_code_parrainage(text) from public, anon;
grant execute on function public.verifier_code_parrainage(text) to authenticated;
