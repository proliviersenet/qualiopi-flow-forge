import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Pilotage superadmin de la facturation (lot 6, 12/11/2026) : abonnements et
// parrainage. Même modèle de sécurité que les autres fonctions superadmin :
// JWT vérifié, email comparé à ADMIN_EMAIL, puis client service-role.
//
// Actions (body.action) :
//  - tableau : KPI abonnements + parrainage, liste des abonnés et des parrains,
//    paramètres (interrupteur, organismes de test, règles), tarifs ;
//  - parametre { cle, valeur } : facturation_active (bool),
//    facturation_organismes_test (uuid[]), parrainage_regles (objet) ;
//  - type_compte { organisme_id, type : super_ambassadeur | standard } ;
//  - mois_offert { organisme_id, motif : ajustement_manuel | offert_ambassadeur, commentaire } :
//    2 mois manuels maximum par organisme et par année civile ;
//  - tarif { code, montant_ht_centimes } : nouveau prix + synchronisation Stripe.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const ADMIN_EMAIL = "olivier@exsenco.fr";
const MAX_MOIS_MANUELS_PAR_AN = 2;

const reponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const somme = <T>(l: T[], f: (x: T) => number) => l.reduce((t, x) => t + (f(x) || 0), 0);

async function tableau(admin: SupabaseClient) {
  const maintenant = new Date();
  const debutMois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1)).toISOString();
  const il_y_a_12_mois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 11, 1)).toISOString();

  const [
    { data: parametres }, { data: tarifs }, { data: abonnements }, { data: organismes },
    { data: factures }, { data: sessions }, { data: parrainages }, { data: codes },
    { data: mois }, { data: badges },
  ] = await Promise.all([
    admin.from("parametres_plateforme").select("cle, valeur, updated_at"),
    admin.from("tarifs").select("code, libelle, montant_ht_centimes, taux_tva, actif, stripe_price_id, synchronise_le").order("code"),
    admin.from("abonnements_organismes").select("organisme_id, statut, type_compte, debut_essai, fin_essai, resiliation_effective_le, coupure_prevue_le, impaye_depuis, date_resiliation, stripe_subscription_id, created_at"),
    admin.from("organismes").select("id, raison_sociale, email_contact, created_at"),
    admin.from("factures").select("organisme_id, statut, montant_ht_centimes, montant_ttc_centimes, payee_le, emise_le, mois_offert"),
    admin.from("sessions_facturables").select("organisme_id, statut, montant_ht_centimes, facturable_le, periode_facturation"),
    admin.from("parrainages").select("id, parrain_organisme_id, filleul_organisme_id, statut, inscrit_le, confirme_le"),
    admin.from("codes_parrainage").select("organisme_id, code"),
    admin.from("mois_offerts").select("organisme_id, motif, consomme_le, accorde_le"),
    admin.from("badges_parrainage").select("organisme_id, niveau, obtenu_le, sessions_offertes_jusqu_au"),
  ]);

  const param = (cle: string) => (parametres ?? []).find((p) => p.cle === cle)?.valeur;
  const prix = (code: string) => (tarifs ?? []).find((t) => t.code === code)?.montant_ht_centimes ?? 0;
  const nomOrg = new Map((organismes ?? []).map((o) => [o.id, o]));
  const ab = abonnements ?? [];
  const fact = factures ?? [];
  const payees = fact.filter((f) => f.statut === "payee");

  // ── Abonnements ──
  const parStatut: Record<string, number> = {};
  for (const a of ab) {
    const cle = a.type_compte === "super_ambassadeur" ? "ambassadeur" : a.statut;
    parStatut[cle] = (parStatut[cle] ?? 0) + 1;
  }
  const payants = ab.filter((a) => a.type_compte !== "super_ambassadeur" && ["actif", "impaye", "resiliation_programmee"].includes(a.statut));
  const essais = ab.filter((a) => a.statut === "essai");
  const dansSeptJours = new Date(maintenant.getTime() + 7 * 86400_000);
  const avecEssai = ab.filter((a) => a.debut_essai);
  const convertis = avecEssai.filter((a) => payees.some((f) => f.organisme_id === a.organisme_id && f.montant_ttc_centimes > 0));

  const caParMois: Record<string, number> = {};
  for (const f of payees) {
    if (!f.payee_le || f.payee_le < il_y_a_12_mois) continue;
    const m = f.payee_le.slice(0, 7);
    caParMois[m] = (caParMois[m] ?? 0) + f.montant_ht_centimes;
  }
  const sess = sessions ?? [];
  const sessionsMois = sess.filter((s) => s.statut === "facturee" && (s.periode_facturation ?? "") >= debutMois.slice(0, 10));

  const kpisAbonnements = {
    par_statut: parStatut,
    payants: payants.length,
    essais_en_cours: essais.length,
    essais_finissant_7j: essais.filter((a) => a.fin_essai && new Date(a.fin_essai) <= dansSeptJours).length,
    mrr_ht_centimes: payants.length * prix("abonnement_mensuel"),
    ca_mois_ht_centimes: caParMois[maintenant.toISOString().slice(0, 7)] ?? 0,
    ca_12_mois_ht_centimes: somme(Object.values(caParMois), (x) => x),
    ca_par_mois: caParMois,
    sessions_facturees_mois: sessionsMois.length,
    sessions_en_attente: sess.filter((s) => s.statut === "en_attente").length,
    impayes_ttc_centimes: somme(fact.filter((f) => ["impayee", "ouverte"].includes(f.statut)), (f) => f.montant_ttc_centimes),
    taux_conversion_essai: avecEssai.length ? Math.round((convertis.length / avecEssai.length) * 100) : null,
    resiliations_mois: ab.filter((a) => a.date_resiliation && a.date_resiliation >= debutMois.slice(0, 10)).length,
  };

  // ── Parrainage ──
  const pa = (parrainages ?? []).filter((p) => p.statut !== "annule");
  const confirmes = pa.filter((p) => p.statut === "confirme");
  const filleulsConfirmes = new Set(confirmes.map((p) => p.filleul_organisme_id));
  const mo = mois ?? [];
  const consommes = mo.filter((m) => m.consomme_le);
  const sessionsOffertes = sess.filter((s) => s.statut === "offerte");
  const caFilleuls = somme(payees.filter((f) => filleulsConfirmes.has(f.organisme_id)), (f) => f.montant_ht_centimes);
  const coutMois = consommes.filter((m) => m.motif !== "ajustement_manuel" && m.motif !== "offert_ambassadeur").length * prix("abonnement_mensuel");
  const coutSessions = somme(sessionsOffertes, (s) => s.montant_ht_centimes);
  const cout = coutMois + coutSessions;
  const engagement = mo.filter((m) => !m.consomme_le && m.motif.startsWith("parrainage") || !m.consomme_le && m.motif === "bonus_badge_argent").length * prix("abonnement_mensuel");
  const bdg = badges ?? [];

  const kpisParrainage = {
    parrainages_total: pa.length,
    parrainages_en_essai: pa.filter((p) => p.statut === "en_attente").length,
    parrainages_confirmes: confirmes.length,
    parrains: new Set(pa.map((p) => p.parrain_organisme_id)).size,
    membres_argent: bdg.filter((b) => b.niveau === "argent").length,
    membres_or: bdg.filter((b) => b.niveau === "or").length,
    mois_offerts_accordes: mo.length,
    mois_offerts_consommes: consommes.length,
    mois_offerts_a_venir: mo.length - consommes.length,
    sessions_offertes: sessionsOffertes.length,
    ca_filleuls_ht_centimes: caFilleuls,
    cout_ht_centimes: cout,
    engagement_ht_centimes: engagement,
    roi_pourcent: cout > 0 ? Math.round(((caFilleuls - cout) / cout) * 100) : null,
  };

  // ── Listes ──
  const soldeMois = (org: string) => mo.filter((m) => m.organisme_id === org && !m.consomme_le).length;
  const badgeDe = (org: string) => bdg.some((b) => b.organisme_id === org && b.niveau === "or") ? "or"
    : bdg.some((b) => b.organisme_id === org && b.niveau === "argent") ? "argent" : null;
  const anneeEnCours = String(maintenant.getFullYear());

  const abonnes = ab.map((a) => {
    const o = nomOrg.get(a.organisme_id);
    return {
      organisme_id: a.organisme_id,
      nom: o?.raison_sociale ?? "—",
      email: o?.email_contact ?? null,
      statut: a.statut,
      type_compte: a.type_compte,
      fin_essai: a.fin_essai,
      resiliation_effective_le: a.resiliation_effective_le,
      coupure_prevue_le: a.coupure_prevue_le,
      ca_ht_centimes: somme(payees.filter((f) => f.organisme_id === a.organisme_id), (f) => f.montant_ht_centimes),
      sessions_facturees: sess.filter((s) => s.organisme_id === a.organisme_id && s.statut === "facturee").length,
      mois_offerts_restants: soldeMois(a.organisme_id),
      mois_manuels_annee: mo.filter((m) => m.organisme_id === a.organisme_id && ["ajustement_manuel", "offert_ambassadeur"].includes(m.motif)
        && (m.accorde_le ?? "").startsWith(anneeEnCours)).length,
      badge: badgeDe(a.organisme_id),
      stripe: !!a.stripe_subscription_id,
    };
  }).sort((x, y) => x.nom.localeCompare(y.nom, "fr"));

  // Organismes sans ligne d'abonnement (bêta-testeurs) : pour pouvoir les nommer ambassadeurs
  const sansAbonnement = (organismes ?? []).filter((o) => !ab.some((a) => a.organisme_id === o.id))
    .map((o) => ({ organisme_id: o.id, nom: o.raison_sociale ?? "—", email: o.email_contact }))
    .sort((x, y) => x.nom.localeCompare(y.nom, "fr"));

  const parrains = [...new Set(pa.map((p) => p.parrain_organisme_id))].map((id) => {
    const siens = pa.filter((p) => p.parrain_organisme_id === id);
    const filleuls = new Set(siens.filter((p) => p.statut === "confirme").map((p) => p.filleul_organisme_id));
    return {
      organisme_id: id,
      nom: nomOrg.get(id)?.raison_sociale ?? "—",
      code: (codes ?? []).find((c) => c.organisme_id === id)?.code ?? null,
      confirmes: siens.filter((p) => p.statut === "confirme").length,
      en_essai: siens.filter((p) => p.statut === "en_attente").length,
      cette_annee: siens.filter((p) => (p.inscrit_le ?? "").startsWith(anneeEnCours)).length,
      badge: badgeDe(id),
      mois_gagnes: mo.filter((m) => m.organisme_id === id).length,
      mois_restants: soldeMois(id),
      ca_filleuls_ht_centimes: somme(payees.filter((f) => filleuls.has(f.organisme_id)), (f) => f.montant_ht_centimes),
    };
  }).sort((x, y) => y.confirmes - x.confirmes);

  return {
    parametres: {
      facturation_active: param("facturation_active") === true,
      facturation_organismes_test: (param("facturation_organismes_test") as string[] | null) ?? [],
      parrainage_regles: param("parrainage_regles") ?? {},
      max_mois_manuels_par_an: MAX_MOIS_MANUELS_PAR_AN,
    },
    tarifs: tarifs ?? [],
    kpis_abonnements: kpisAbonnements,
    kpis_parrainage: kpisParrainage,
    abonnes,
    sans_abonnement: sansAbonnement,
    parrains,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
      return reponse({ error: "Action réservée à l'administrateur QualioFlex." }, 403);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));

    switch (body.action ?? "tableau") {
      case "tableau":
        return reponse(await tableau(admin));

      case "parametre": {
        const { cle, valeur } = body;
        if (cle === "facturation_active" && typeof valeur !== "boolean") throw new Error("Valeur attendue : vrai / faux.");
        if (cle === "facturation_organismes_test" && !Array.isArray(valeur)) throw new Error("Liste d'organismes attendue.");
        if (cle === "parrainage_regles") {
          for (const k of ["max_filleuls_par_an", "seuil_argent", "seuil_or", "duree_sessions_offertes_mois"]) {
            if (!Number.isInteger(valeur?.[k]) || valeur[k] < 1) throw new Error(`Règle ${k} invalide.`);
          }
          if (valeur.seuil_or <= valeur.seuil_argent) throw new Error("Le seuil Or doit être supérieur au seuil Argent.");
        }
        if (!["facturation_active", "facturation_organismes_test", "parrainage_regles"].includes(cle)) throw new Error("Paramètre inconnu.");
        const { error } = await admin.from("parametres_plateforme")
          .update({ valeur, updated_at: new Date().toISOString() }).eq("cle", cle);
        if (error) throw error;
        return reponse({ success: true });
      }

      case "type_compte": {
        const { organisme_id, type } = body;
        if (!organisme_id || !["super_ambassadeur", "standard"].includes(type)) throw new Error("Paramètres invalides.");
        const { data: ab } = await admin.from("abonnements_organismes")
          .select("id, stripe_subscription_id, statut").eq("organisme_id", organisme_id).maybeSingle();
        if (type === "super_ambassadeur") {
          if (ab?.stripe_subscription_id && ["essai", "actif", "impaye", "coupe", "resiliation_programmee"].includes(ab.statut)) {
            throw new Error("Cet organisme a un abonnement Stripe en cours : résiliez-le d'abord (ou attendez sa fin) avant de le nommer ambassadeur.");
          }
          const { error } = await admin.from("abonnements_organismes").upsert({
            organisme_id, type_compte: "super_ambassadeur", statut: "exempte", montant_centimes: 0,
            periodicite: "mensuel", updated_at: new Date().toISOString(),
          }, { onConflict: "organisme_id" });
          if (error) throw error;
          await admin.from("codes_parrainage").update({ type: "super_ambassadeur" }).eq("organisme_id", organisme_id);
        } else {
          if (!ab) return reponse({ success: true });
          if (ab.stripe_subscription_id) {
            await admin.from("abonnements_organismes").update({ type_compte: "standard", updated_at: new Date().toISOString() }).eq("id", ab.id);
          } else {
            // Ambassadeur sans abonnement Stripe : on retire la ligne, il démarrera un essai normal
            await admin.from("abonnements_organismes").delete().eq("id", ab.id);
          }
          await admin.from("codes_parrainage").update({ type: "standard" }).eq("organisme_id", organisme_id);
        }
        return reponse({ success: true });
      }

      case "mois_offert": {
        const { organisme_id, motif, commentaire } = body;
        if (!organisme_id || !["ajustement_manuel", "offert_ambassadeur"].includes(motif)) throw new Error("Paramètres invalides.");
        const { data: dejaAccordes } = await admin.rpc("fn_mois_manuels_annee", { p_organisme_id: organisme_id });
        if ((dejaAccordes ?? 0) >= MAX_MOIS_MANUELS_PAR_AN) {
          throw new Error(`Limite atteinte : ${MAX_MOIS_MANUELS_PAR_AN} mois offerts manuellement maximum par organisme et par an.`);
        }
        const { error } = await admin.from("mois_offerts").insert({ organisme_id, motif, commentaire: commentaire || "Accordé par l'administrateur" });
        if (error) throw error;
        return reponse({ success: true });
      }

      case "tarif": {
        const { code, montant_ht_centimes } = body;
        if (!["abonnement_mensuel", "session", "export_donnees"].includes(code)) throw new Error("Tarif inconnu.");
        if (!Number.isInteger(montant_ht_centimes) || montant_ht_centimes < 0) throw new Error("Montant invalide.");
        const { error } = await admin.from("tarifs").update({ montant_ht_centimes, updated_at: new Date().toISOString() }).eq("code", code);
        if (error) throw error;
        // Nouveau prix Stripe (les abonnements existants gardent l'ancien prix tant qu'ils ne sont pas migrés)
        const r = await fetch(`${SUPABASE_URL}/functions/v1/stripe-synchroniser-tarifs`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET }, body: "{}",
        });
        return reponse({ success: true, synchronisation_stripe: r.ok });
      }

      default:
        return reponse({ error: "Action inconnue." }, 400);
    }
  } catch (e) {
    console.error("Erreur superadmin-facturation:", e);
    return reponse({ error: (e as Error).message || "Erreur serveur." }, 400);
  }
});
