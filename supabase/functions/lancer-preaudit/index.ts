// ============================================================================
// QUALIFLOW — Edge Function : Pré-audit Qualiopi + génération BPF
// Fichier : supabase/functions/lancer-preaudit/index.ts
// Déploiement : supabase functions deploy lancer-preaudit
//
// Logique :
//   1. Sélectionne aléatoirement 10 dossiers (sessions + participations)
//      depuis la période de référence (comme un vrai auditeur Certifopac)
//   2. Analyse chaque dossier sur les 32 indicateurs Qualiopi V7
//   3. Génère le score de conformité + liste des NC + recommandations
//   4. Met à jour le BPF de l'année en cours
//   5. Stocke les résultats dans la table preaudits
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SB_SERVICE_ROLE_KEY")!
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// ----------------------------------------------------------------------------
// Définition des 32 indicateurs Qualiopi V7
// Marqués NC_MAJEURE_ONLY si leur non-conformité est toujours majeure
// ----------------------------------------------------------------------------
const INDICATEURS = [
  { code: "ind_1", libelle: "Communication sur les prestations de formation", nc_majeure_only: false, verifie_sur: "documents", champ: "programme" },
  { code: "ind_2", libelle: "Identification et analyse des besoins", nc_majeure_only: false, verifie_sur: "enquetes", champ: "positionnement_avant" },
  { code: "ind_3", libelle: "Adéquation des prestations aux besoins identifiés", nc_majeure_only: false, verifie_sur: "formations", champ: "objectifs" },
  { code: "ind_4", libelle: "Objectifs opérationnels et évaluables", nc_majeure_only: true, verifie_sur: "formations", champ: "objectifs" },
  { code: "ind_5", libelle: "Contenu des prestations adapté aux objectifs", nc_majeure_only: true, verifie_sur: "formations", champ: "programme" },
  { code: "ind_6", libelle: "Modalités pédagogiques adaptées", nc_majeure_only: true, verifie_sur: "sessions", champ: "modalite" },
  { code: "ind_7", libelle: "Adaptation aux publics bénéficiaires", nc_majeure_only: false, verifie_sur: "enquetes", champ: "positionnement_avant" },
  { code: "ind_8", libelle: "Recueil des besoins spécifiques — handicap", nc_majeure_only: false, verifie_sur: "organismes", champ: "referent_handicap" },
  { code: "ind_9", libelle: "Convocation et convention de formation", nc_majeure_only: false, verifie_sur: "documents", champ: "convention" },
  { code: "ind_10", libelle: "Accueil et information des bénéficiaires", nc_majeure_only: true, verifie_sur: "documents", champ: "livret_accueil" },
  { code: "ind_11", libelle: "Évaluation des acquis en cours / fin de formation", nc_majeure_only: true, verifie_sur: "enquetes", champ: "eval_chaud" },
  { code: "ind_12", libelle: "Remise d'une attestation de fin de formation", nc_majeure_only: false, verifie_sur: "documents", champ: "attestation" },
  { code: "ind_13", libelle: "Évaluation de la satisfaction des bénéficiaires", nc_majeure_only: false, verifie_sur: "evaluations_formations", champ: "note_globale" },
  { code: "ind_14", libelle: "Mesure de l'impact de la formation", nc_majeure_only: true, verifie_sur: "enquetes", champ: "eval_froid" },
  { code: "ind_15", libelle: "Feuilles de présence / émargement", nc_majeure_only: true, verifie_sur: "documents", champ: "emargement" },
  { code: "ind_16", libelle: "Accessibilité des prestations — handicap", nc_majeure_only: true, verifie_sur: "organismes", champ: "referent_handicap" },
  { code: "ind_17", libelle: "Qualification et développement des formateurs", nc_majeure_only: false, verifie_sur: "suivi_formation_formateur", champ: "delivree" },
  { code: "ind_18", libelle: "Sous-traitance — sélection et suivi", nc_majeure_only: false, verifie_sur: "na", champ: "" },
  { code: "ind_19", libelle: "Veille légale et réglementaire", nc_majeure_only: false, verifie_sur: "suivi_formation_formateur", champ: "recue" },
  { code: "ind_20", libelle: "Prise en compte des appréciations et réclamations", nc_majeure_only: true, verifie_sur: "evaluations_formations", champ: "synthese" },
  { code: "ind_21", libelle: "Amélioration continue des prestations", nc_majeure_only: true, verifie_sur: "checklist", champ: "ok" },
  { code: "ind_22", libelle: "Formation continue des formateurs", nc_majeure_only: true, verifie_sur: "suivi_formation_formateur", champ: "recue" },
  { code: "ind_23", libelle: "Pratique professionnelle des formateurs", nc_majeure_only: false, verifie_sur: "suivi_formation_formateur", champ: "delivree" },
  { code: "ind_24", libelle: "Veille sur les évolutions des métiers et compétences", nc_majeure_only: false, verifie_sur: "suivi_formation_formateur", champ: "recue" },
  { code: "ind_25", libelle: "Coordination avec les entreprises commanditaires", nc_majeure_only: false, verifie_sur: "clients", champ: "" },
  { code: "ind_26", libelle: "Sécurisation des parcours — financement", nc_majeure_only: true, verifie_sur: "sessions", champ: "statut" },
  { code: "ind_27", libelle: "Dossiers administratifs complets", nc_majeure_only: true, verifie_sur: "documents", champ: "convention" },
  { code: "ind_28", libelle: "Indicateurs de résultats", nc_majeure_only: false, verifie_sur: "evaluations_formations", champ: "note_globale" },
  { code: "ind_29", libelle: "Communication des résultats", nc_majeure_only: true, verifie_sur: "evaluations_formations", champ: "note_globale" },
  { code: "ind_30", libelle: "Usage correct du logo Qualiopi", nc_majeure_only: false, verifie_sur: "organismes", champ: "nda" },
  { code: "ind_31", libelle: "Affichage du certificat Qualiopi", nc_majeure_only: true, verifie_sur: "organismes", champ: "nda" },
  { code: "ind_32", libelle: "Mise à jour du référentiel national qualité", nc_majeure_only: true, verifie_sur: "checklist", champ: "ok" },
];

// ----------------------------------------------------------------------------
// Analyse un dossier (session + participations) sur tous les indicateurs
// ----------------------------------------------------------------------------
async function analyserDossier(
  sessionId: string,
  organismeId: string
): Promise<Record<string, string>> {
  const resultats: Record<string, string> = {};

  // Récupérer les données du dossier
  const { data: session } = await supabase
    .from("sessions")
    .select("*, formations(*)")
    .eq("id", sessionId)
    .single();

  const { data: docs } = await supabase
    .from("documents")
    .select("type, statut")
    .eq("session_id", sessionId);

  const { data: enquetes } = await supabase
    .from("enquetes_preformation")
    .select("questionnaire_type, complete")
    .eq("session_id", sessionId);

  const { data: evals } = await supabase
    .from("evaluations_formations")
    .select("note_globale, synthese")
    .eq("session_id", sessionId);

  const { data: suivi } = await supabase
    .from("suivi_formation_formateur")
    .select("sens, nature")
    .eq("organisme_id", organismeId);

  const { data: org } = await supabase
    .from("organismes")
    .select("nda, referent_handicap: email_contact")
    .eq("id", organismeId)
    .single();

  // Helpers
  const hasDoc = (type: string) =>
    docs?.some(d => d.type === type && d.statut === "pret") ?? false;
  const hasEnquete = (type: string) =>
    enquetes?.some(e => e.questionnaire_type === type && e.complete) ?? false;
  const hasSuivi = (sens: string) =>
    (suivi?.filter(s => s.sens === sens)?.length ?? 0) > 0;
  const formation = session?.formations as Record<string, string> | null;

  // Analyse indicateur par indicateur
  for (const ind of INDICATEURS) {
    let statut = "conforme";

    if (ind.verifie_sur === "na") {
      statut = "non_applicable";
    } else if (ind.verifie_sur === "documents") {
      statut = hasDoc(ind.champ) ? "conforme" : (ind.nc_majeure_only ? "nc_majeure" : "nc_mineure");
    } else if (ind.verifie_sur === "enquetes") {
      statut = hasEnquete(ind.champ) ? "conforme" : (ind.nc_majeure_only ? "nc_majeure" : "nc_mineure");
    } else if (ind.verifie_sur === "formations") {
      const val = formation?.[ind.champ];
      statut = val && val.length > 10 ? "conforme" : (ind.nc_majeure_only ? "nc_majeure" : "nc_mineure");
    } else if (ind.verifie_sur === "sessions") {
      statut = session?.statut ? "conforme" : "nc_mineure";
    } else if (ind.verifie_sur === "evaluations_formations") {
      statut = (evals?.length ?? 0) > 0 ? "conforme" : (ind.nc_majeure_only ? "nc_majeure" : "nc_mineure");
    } else if (ind.verifie_sur === "suivi_formation_formateur") {
      statut = hasSuivi(ind.champ) ? "conforme" : (ind.nc_majeure_only ? "nc_majeure" : "nc_mineure");
    } else if (ind.verifie_sur === "organismes") {
      const val = org?.[ind.champ as keyof typeof org];
      statut = val ? "conforme" : (ind.nc_majeure_only ? "nc_majeure" : "nc_mineure");
    } else if (ind.verifie_sur === "checklist") {
      statut = "conforme"; // optimiste par défaut, affiné si checklist disponible
    } else if (ind.verifie_sur === "clients") {
      statut = "conforme";
    }

    resultats[ind.code] = statut;
  }

  return resultats;
}

// ----------------------------------------------------------------------------
// Point d'entrée principal
// ----------------------------------------------------------------------------
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const {
      organisme_id,
      periode_debut,
      periode_fin,
      annee_bpf,
    } = await req.json();

    if (!organisme_id || !periode_debut || !periode_fin) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants : organisme_id, periode_debut, periode_fin" }),
        { status: 400, headers: CORS }
      );
    }

    // 1. Récupérer les sessions de la période
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, date_debut, date_fin, formations!inner(organisme_id, titre)")
      .eq("formations.organisme_id", organisme_id)
      .gte("date_debut", periode_debut)
      .lte("date_fin", periode_fin)
      .eq("statut", "terminee");

    const totalSessions = sessions?.length ?? 0;

    // 2. Échantillonnage aléatoire — 10 dossiers minimum comme l'audit réel
    const NB_ECHANTILLON = Math.min(totalSessions, Math.max(10, totalSessions));
    const shuffled = [...(sessions ?? [])].sort(() => Math.random() - 0.5);
    const echantillon = shuffled.slice(0, NB_ECHANTILLON);

    // 3. Créer l'entrée pré-audit en base
    const { data: preaudit, error: paError } = await supabase
      .from("preaudits")
      .insert({
        organisme_id,
        periode_debut,
        periode_fin,
        nb_dossiers_analyses: echantillon.length,
        statut: "en_cours",
      })
      .select("id")
      .single();

    if (paError) throw new Error(`Erreur création pré-audit: ${paError.message}`);

    // 4. Analyser chaque dossier
    const resultatsParDossier: Record<string, Record<string, string>> = {};
    for (const session of echantillon) {
      resultatsParDossier[session.id] = await analyserDossier(session.id, organisme_id);
    }

    // 5. Agréger les résultats par indicateur
    const resultatsGlobaux = INDICATEURS.map(ind => {
      const statutsParDossier = echantillon.map(s =>
        resultatsParDossier[s.id]?.[ind.code] ?? "conforme"
      );
      const ncMajeures = statutsParDossier.filter(s => s === "nc_majeure").length;
      const ncMineures = statutsParDossier.filter(s => s === "nc_mineure").length;
      const conformes = statutsParDossier.filter(s => s === "conforme").length;
      const na = statutsParDossier.filter(s => s === "non_applicable").length;

      let statut = "conforme";
      if (ncMajeures > 0) statut = "nc_majeure";
      else if (ncMineures > 0) statut = "nc_mineure";
      else if (na === echantillon.length) statut = "non_applicable";

      return {
        indicateur: ind.code,
        libelle: ind.libelle,
        statut,
        nc_majeure_only: ind.nc_majeure_only,
        nb_dossiers_nc_majeures: ncMajeures,
        nb_dossiers_nc_mineures: ncMineures,
        nb_dossiers_conformes: conformes,
      };
    });

    // 6. Calculer le score global
    const indicateursApplicables = resultatsGlobaux.filter(r => r.statut !== "non_applicable");
    const nbConformes = indicateursApplicables.filter(r => r.statut === "conforme").length;
    const nbNcMajeures = indicateursApplicables.filter(r => r.statut === "nc_majeure").length;
    const nbNcMineures = indicateursApplicables.filter(r => r.statut === "nc_mineure").length;
    const scoreConformite = Math.round((nbConformes / indicateursApplicables.length) * 100);

    // 7. Générer les recommandations prioritaires
    const recommandations = resultatsGlobaux
      .filter(r => r.statut !== "conforme" && r.statut !== "non_applicable")
      .sort((a, b) => (b.statut === "nc_majeure" ? 1 : 0) - (a.statut === "nc_majeure" ? 1 : 0))
      .slice(0, 5)
      .map(r => ({
        indicateur: r.indicateur,
        libelle: r.libelle,
        priorite: r.statut === "nc_majeure" ? "critique" : "importante",
        action: `Corriger la non-conformité sur l'indicateur ${r.indicateur.replace("ind_", "")} — ${r.libelle}`,
        nb_dossiers_concernes: r.nb_dossiers_nc_majeures + r.nb_dossiers_nc_mineures,
      }));

    // 8. Mettre à jour le pré-audit en base
    await supabase
      .from("preaudits")
      .update({
        nb_dossiers_conformes: nbConformes,
        nb_nc_majeures: nbNcMajeures,
        nb_nc_mineures: nbNcMineures,
        score_conformite: scoreConformite,
        statut: "termine",
        resultats: resultatsGlobaux,
        recommandations,
      })
      .eq("id", preaudit.id);

    // 9. Générer / mettre à jour le BPF de l'année
    const annee = annee_bpf ?? new Date().getFullYear();
    const { data: benefData } = await supabase
      .from("participations")
      .select("id, sessions!inner(date_debut, formations!inner(organisme_id, duree))")
      .eq("sessions.formations.organisme_id", organisme_id)
      .gte("sessions.date_debut", `${annee}-01-01`)
      .lte("sessions.date_debut", `${annee}-12-31`);

    const { data: evalData } = await supabase
      .from("evaluations_formations")
      .select("note_globale, sessions!inner(formations!inner(organisme_id))")
      .eq("sessions.formations.organisme_id", organisme_id);

    const notes = (evalData ?? []).map(e => e.note_globale).filter(Boolean);
    const tauxSat = notes.length > 0
      ? Math.round((notes.reduce((a: number, b: number) => a + b, 0) / notes.length / 5) * 100)
      : 0;

    await supabase
      .from("bpf")
      .upsert({
        organisme_id,
        annee,
        nb_stagiaires: benefData?.length ?? 0,
        nb_sessions: totalSessions,
        taux_satisfaction: tauxSat,
        genere_le: new Date().toISOString(),
      }, { onConflict: "organisme_id,annee" });

    return new Response(
      JSON.stringify({
        success: true,
        preaudit_id: preaudit.id,
        score_conformite: scoreConformite,
        nb_nc_majeures: nbNcMajeures,
        nb_nc_mineures: nbNcMineures,
        nb_dossiers_analyses: echantillon.length,
        recommandations,
        resultats: resultatsGlobaux,
      }),
      { status: 200, headers: CORS }
    );
  } catch (err) {
    console.error("Erreur lancer-preaudit:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue" }),
      { status: 500, headers: CORS }
    );
  }
});
