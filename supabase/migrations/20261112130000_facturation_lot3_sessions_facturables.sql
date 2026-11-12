-- =====================================================================
-- Chantier facturation — LOT 3 : sessions facturées (3 € HT) — 12/11/2026
-- Règles validées par Olivier :
--  * une session est facturable dès qu'elle est créée ET affectée à un client ;
--  * payeur = organisme propriétaire de la formation (donneur d'ordre, y
--    compris en sous-traitance) ;
--  * elle devient due à J-48h de sa date de début (ou dès l'affectation si
--    celle-ci intervient moins de 48 h avant) ;
--  * seul cas de non-facturation : annulation / suppression / désaffectation
--    AVANT J-48h → « annulee_sans_frais » ;
--  * sessions de la période d'essai facturées sur la première facture ;
--  * ambassadeurs : session enregistrée « exemptee », jamais facturée ;
--  * facturation coupée (bêta) : rien n'est enregistré.
-- Les sessions dues sont ajoutées à la facture d'abonnement du mois par le
-- webhook Stripe (invoice.created), une ligne par session.
-- =====================================================================

alter table public.sessions_facturables add column stripe_invoice_id text;

create or replace function public.fn_sync_session_facturable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session sessions%rowtype;
  v_org uuid;
  v_ligne sessions_facturables%rowtype;
  v_type text;
  v_montant integer;
  v_libelle text;
  v_due timestamptz;
  v_retiree boolean;
begin
  if tg_op = 'DELETE' then v_session := old; else v_session := new; end if;

  select organisme_id into v_org from formations where id = v_session.formation_id;
  if v_org is null then return coalesce(new, old); end if;

  select * into v_ligne from sessions_facturables where session_id = v_session.id;

  -- Session retirée : supprimée, annulée ou désaffectée de son client
  v_retiree := tg_op = 'DELETE' or v_session.statut = 'annulee' or v_session.client_id is null;

  if v_retiree then
    if v_ligne.id is not null and v_ligne.statut = 'en_attente' and now() < v_ligne.facturable_le then
      update sessions_facturables
        set statut = 'annulee_sans_frais', updated_at = now()
        where id = v_ligne.id;
    end if;
    -- Après J-48h : la ligne reste « en_attente » et sera facturée.
    return coalesce(new, old);
  end if;

  -- Session active et affectée à un client
  v_due := greatest(
    now(),
    case when v_session.date_debut is not null
      then (v_session.date_debut::timestamp at time zone 'Europe/Paris') - interval '48 hours'
      else now() end
  );

  select coalesce(f.titre, 'Formation') || ' — ' || coalesce(c.raison_sociale, 'Client') ||
         coalesce(' — ' || to_char(v_session.date_debut, 'DD/MM/YYYY'), '')
    into v_libelle
    from formations f left join clients c on c.id = v_session.client_id
    where f.id = v_session.formation_id;
  v_libelle := 'Session : ' || v_libelle;

  if v_ligne.id is null then
    if not fn_facturation_active_pour(v_org) then
      return coalesce(new, old);  -- bêta : rien n'est facturé
    end if;
    select coalesce(type_compte, 'standard') into v_type from abonnements_organismes where organisme_id = v_org;
    select montant_ht_centimes into v_montant from tarifs where code = 'session' and actif;
    insert into sessions_facturables
      (session_id, organisme_id, libelle, date_debut_session, montant_ht_centimes, facturable_le, statut)
    values
      (v_session.id, v_org, v_libelle, v_session.date_debut, coalesce(v_montant, 0), v_due,
       case when v_type = 'super_ambassadeur' then 'exemptee' else 'en_attente' end);

  elsif v_ligne.statut = 'en_attente' and now() < v_ligne.facturable_le then
    -- Pas encore due : on suit les changements de date et de libellé
    update sessions_facturables
      set facturable_le = v_due, date_debut_session = v_session.date_debut, libelle = v_libelle, updated_at = now()
      where id = v_ligne.id;

  elsif v_ligne.statut = 'annulee_sans_frais' then
    -- Session réactivée / réaffectée : à nouveau facturable
    update sessions_facturables
      set statut = 'en_attente', facturable_le = v_due, date_debut_session = v_session.date_debut,
          libelle = v_libelle, updated_at = now()
      where id = v_ligne.id;
  end if;
  -- Ligne déjà due, facturée ou exemptée : figée.

  return coalesce(new, old);
end;
$$;

create trigger trg_sync_session_facturable_iu
  after insert or update of client_id, date_debut, statut, formation_id on public.sessions
  for each row execute function public.fn_sync_session_facturable();

-- BEFORE DELETE : la ligne doit être traitée avant que la clé étrangère ne
-- passe session_id à NULL.
create trigger trg_sync_session_facturable_d
  before delete on public.sessions
  for each row execute function public.fn_sync_session_facturable();

revoke execute on function public.fn_sync_session_facturable() from public, anon, authenticated;
