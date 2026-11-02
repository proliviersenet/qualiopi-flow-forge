// ============================================================================
// QUALIOFLEX — Edge Function : Pré-audit Qualiopi
// Fichier : supabase/functions/lancer-preaudit/index.ts
// Déploiement : via Supabase Dashboard (Edge Functions)
//
// Réécriture du 17/08/2026 (chantier "pré-audit" — audit MVP du 16/08/2026) :
// la version précédente lisait des tables mortes (documents, enquetes_preformation,
// evaluations_formations, participations, suivi_formation_formateur) qui existent
// encore en base mais ne sont alimentées par aucun écran actuel, et écrivait dans
// des colonnes de `bpf` qui n'existent plus (le BPF a sa propre page BPF.tsx,
// indépendante — cette fonction ne touche plus du tout à `bpf`).
//
// Principe : pour chaque indicateur du référentiel nc_majeure_only qu'on peut
// réellement vérifier avec les données présentes dans QalioFlex, on le vérifie.
// Pour les indicateurs sans source de donnée fiable dans l'app (qualification
// des formateurs, réclamations, financement...), on répond honnêtement
// "à vérifier manuellement" plutôt que d'afficher un faux "conforme" — même
// principe que l'audit du 16/08/2026 (StagiairesList, Dashboard).
//
// Résultats stockés à deux endroits :
//  - `checklist_items` (1 ligne par organisme+indicateur, statut agrégé) : c'est
//    ce que lit déjà l'onglet "Conformité Qualiopi" du Dashboard (jusqu'ici
//    toujours vide car rien n'écrivait dans cette table).
//  - `preaudits` (1 ligne par lancement) : historique consultable sur la page
//    /pre-audit.
//
// Mise à jour 01/11/2026 (suite à l'alerte veille V10 — voir
// docs/VEILLE_QUALIOPI.md) : correction minimale, pas de refonte complète.
//   - "ind_19" et "ind_27" ci-dessous ne correspondaient PAS aux vrais
//     indicateurs officiels 19 et 27 du référentiel (ils portaient sur la
//     veille légale et les dossiers administratifs, alors que les vrais
//     indicateurs 19 et 27 officiels parlent du suivi réel du distanciel et
//     de la sous-traitance). Renommés en "ctrl_veille_legale" et
//     "ctrl_dossiers_admin" pour ne plus laisser croire à une correspondance
//     numérique avec le référentiel officiel.
//   - Ajout d'un contrôle "ctrl_eval_contenus_apprentis" en "à vérifier
//     manuellement" : il correspond au nouvel indicateur 33 officiel
//     (évaluation des contenus de formation par les apprentis, CFA
//     uniquement), pour lequel QualioFlex n'a pas encore de fonctionnalité
//     dédiée — écart fonctionnel à traiter séparément, pas comblé ici.
//   - Cette liste reste un ensemble de contrôles internes QualioFlex, pas une
//     reproduction fidèle et exhaustive des indicateurs officiels du
//     référentiel national qualité (dont la version est passée de V.9 à V10
//     le 01/11/2026) : ne pas annoncer de nombre précis d'"indicateurs" dans
//     les textes destinés aux utilisateurs.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SB_SERVICE_ROLE_KEY")!
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type Source =
  | "formation_champ"
  | "doc_session"
  | "doc_formation_session" // convention + devis, les 2 au niveau session
  | "stagiaire_champ"
  | "stagiaire_reponses"
  | "veille"
  | "historique_preaudit"
  | "clients_check"
  | "organisme_nda"
  | "non_applicable"
  | "manuel";

interface Indicateur {
  code: string;
  libelle: string;
  nc_majeure_only: boolean;
  source: Source;
  champ?: string;
}

// ----------------------------------------------------------------------------
// Contrôles internes du pré-audit QualioFlex, inspirés du référentiel
// national qualité. Numérotation interne conservée de la 1ère version (ne
// correspond plus exactement, pour ind_19 et ind_27, aux vrais numéros
// officiels — voir note du 01/11/2026 ci-dessus).
// ----------------------------------------------------------------------------
const INDICATEURS: Indicateur[] = [
  { code: "ind_1", libelle: "Communication sur les prestations de formation", nc_majeure_only: false, source: "formation_champ", champ: "communication" },
  { code: "ind_2", libelle: "Identification et analyse des besoins", nc_majeure_only: false, source: "stagiaire_champ", champ: "doc_questionnaire_avant" },
  { code: "ind_3", libelle: "Adéquation des prestations aux besoins identifiés", nc_majeure_only: false, source: "formation_champ", champ: "objectifs" },
  { code: "ind_4", libelle: "Objectifs opérationnels et évaluables", nc_majeure_only: true, source: "formation_champ", champ: "objectifs" },
  { code: "ind_5", libelle: "Contenu des prestations adapté aux objectifs", nc_majeure_only: true, source: "formation_champ", champ: "programme" },
  { code: "ind_6", libelle: "Modalités pédagogiques adaptées", nc_majeure_only: true, source: "formation_champ", champ: "modalites" },
  { code: "ind_7", libelle: "Adaptation aux publics bénéficiaires", nc_majeure_only: false, source: "stagiaire_champ", champ: "doc_questionnaire_avant" },
  { code: "ind_8", libelle: "Recueil des besoins spécifiques — situation de handicap", nc_majeure_only: false, source: "manuel" },
  { code: "ind_9", libelle: "Convocation et convention de formation", nc_majeure_only: false, source: "doc_session", champ: "convention" },
  { code: "ind_10", libelle: "Accueil et information des bénéficiaires", nc_majeure_only: true, source: "doc_session", champ: "livret" },
  { code: "ind_11", libelle: "Évaluation des acquis en cours / fin de formation", nc_majeure_only: true, source: "stagiaire_champ", champ: "doc_evaluation_chaud" },
  { code: "ind_12", libelle: "Remise d'une attestation de fin de formation", nc_majeure_only: false, source: "stagiaire_champ", champ: "doc_attestation" },
  { code: "ind_13", libelle: "Évaluation de la satisfaction des bénéficiaires", nc_majeure_only: false, source: "stagiaire_reponses", champ: "reponses_evaluation_chaud" },
  { code: "ind_14", libelle: "Mesure de l'impact de la formation à froid", nc_majeure_only: true, source: "stagiaire_champ", champ: "doc_evaluation_froid" },
  { code: "ind_15", libelle: "Feuilles de présence / émargement", nc_majeure_only: true, source: "stagiaire_champ", champ: "doc_emargement" },
  { code: "ind_16", libelle: "Accessibilité des prestations — situation de handicap", nc_majeure_only: true, source: "manuel" },
  { code: "ind_17", libelle: "Qualification et compétences des formateurs", nc_majeure_only: false, source: "manuel" },
  { code: "ind_18", libelle: "Sous-traitance — sélection et suivi", nc_majeure_only: false, source: "non_applicable" },
  { code: "ctrl_veille_legale", libelle: "Veille légale et réglementaire (référentiel Qualiopi)", nc_majeure_only: false, source: "veille" },
  { code: "ind_20", libelle: "Prise en compte des appréciations et réclamations", nc_majeure_only: true, source: "manuel" },
  { code: "ind_21", libelle: "Amélioration continue des prestations", nc_majeure_only: true, source: "historique_preaudit" },
  { code: "ind_22", libelle: "Formation continue des formateurs", nc_majeure_only: true, source: "manuel" },
  { code: "ind_23", libelle: "Pratique professionnelle des formateurs", nc_majeure_only: false, source: "manuel" },
  { code: "ind_24", libelle: "Veille sur les évolutions des métiers et compétences", nc_majeure_only: false, source: "manuel" },
  { code: "ind_25", libelle: "Coordination avec les entreprises commanditaires", nc_majeure_only: false, source: "clients_check" },
  { code: "ind_26", libelle: "Sécurisation des parcours — financement", nc_majeure_only: true, source: "manuel" },
  { code: "ctrl_dossiers_admin", libelle: "Dossiers administratifs complets", nc_majeure_only: true, source: "doc_formation_session" },
  { code: "ind_28", libelle: "Mesure des indicateurs de résultats", nc_majeure_only: false, source: "stagiaire_reponses", champ: "reponses_evaluation_chaud" },
  { code: "ind_29", libelle: "Communication publique des résultats", nc_majeure_only: true, source: "manuel" },
  { code: "ind_30", libelle: "Usage correct du logo Qualiopi", nc_majeure_only: false, source: "organisme_nda" },
  { code: "ind_31", libelle: "Affichage du certificat Qualiopi", nc_majeure_only: true, source: "organisme_nda" },
  { code: "ind_32", libelle: "Mise à jour au regard des évolutions du référentiel", nc_majeure_only: true, source: "veille" },
  { code: "ctrl_eval_contenus_apprentis", libelle: "Évaluation des contenus de formation par les apprentis (indicateur 33 du référentiel V10, CFA) — aucune fonctionnalité dédiée dans QualioFlex à ce jour", nc_majeure_only: false, source: "manuel" },
];

// statut possibles : "conforme" | "nc_majeure" | "nc_mineure" | "a_verifier" | "non_applicable"
type Statut = "conforme" | "nc_majeure" | "nc_mineure" | "a_verifier" | "non_applicable";

const nonConformeStatut = (nc_majeure_only: boolean): Statut => (nc_majeure_only ? "nc_majeure" : "nc_mineure");

interface Session {
  id: string;
  formation_id: string;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
}
interface Formation {
  id: string;
  titre: string | null;
  objectifs: string | null;
  programme: string | null;
  modalites: string | null;
  tarif: number | null;
  duree: string | null;
  statut: string | null;
}
interface Stagiaire {
  id: string;
  session_id: string;
  doc_questionnaire_avant: string | null;
  doc_evaluation_chaud: string | null;
  doc_evaluation_froid: string | null;
  doc_emargement: string | null;
  doc_attestation: string | null;
  reponses_evaluation_chaud: { notes?: Record<string, number> } | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { organisme_id, periode_debut, periode_fin } = await req.json();

    if (!organisme_id || !periode_debut || !periode_fin) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants : organisme_id, periode_debut, periode_fin" }),
        { status: 400, headers: CORS }
      );
    }

    // 1. Formations de l'organisme (pour scoper sessions + vérifier les champs
    //    "formation_champ" — l'app n'a pas de RLS role-based fiable côté anon,
    //    donc on scope explicitement comme partout ailleurs dans le code).
    const { data: formationsData } = await supabase
      .from("formations")
      .select("id, titre, objectifs, programme, modalites, tarif, duree, statut")
      .eq("organisme_id", organisme_id);
    const formations = (formationsData ?? []) as Formation[];
    const formationById: Record<string, Formation> = {};
    formations.forEach(f => { formationById[f.id] = f; });
    const formationIds = formations.map(f => f.id);

    // 2. Dossiers (sessions terminées) de la période, sur ces formations
    let sessions: Session[] = [];
    if (formationIds.length > 0) {
      const { data: sessionsData } = await supabase
        .from("sessions")
        .select("id, formation_id, date_debut, date_fin, statut")
        .in("formation_id", formationIds)
        .eq("statut", "terminee")
        .gte("date_debut", periode_debut)
        .lte("date_fin", periode_fin);
      sessions = (sessionsData ?? []) as Session[];
    }
    const sessionIds = sessions.map(s => s.id);

    // 3. Stagiaires de ces dossiers
    let stagiaires: Stagiaire[] = [];
    if (sessionIds.length > 0) {
      const { data: stagData } = await supabase
        .from("stagiaires")
        .select("id, session_id, doc_questionnaire_avant, doc_evaluation_chaud, doc_evaluation_froid, doc_emargement, doc_attestation, reponses_evaluation_chaud")
        .in("session_id", sessionIds);
      stagiaires = (stagData ?? []) as Stagiaire[];
    }
    const stagiairesBySession: Record<string, Stagiaire[]> = {};
    stagiaires.forEach(s => {
      if (!stagiairesBySession[s.session_id]) stagiairesBySession[s.session_id] = [];
      stagiairesBySession[s.session_id].push(s);
    });

    // 4. Documents (documents_formation) au niveau session ET formation
    const orParts: string[] = [];
    if (formationIds.length > 0) orParts.push(`formation_id.in.(${formationIds.join(",")})`);
    if (sessionIds.length > 0) orParts.push(`session_id.in.(${sessionIds.join(",")})`);
    let docsBySession: Record<string, Set<string>> = {};
    const docsByFormation: Record<string, Set<string>> = {};
    if (orParts.length > 0) {
      const { data: docsData } = await supabase
        .from("documents_formation")
        .select("formation_id, session_id, stagiaire_id, type")
        .or(orParts.join(","));
      (docsData ?? []).forEach((d: { formation_id: string | null; session_id: string | null; stagiaire_id: string | null; type: string }) => {
        if (d.stagiaire_id) return; // pas pertinent ici (ex: attestations, déjà couvertes via stagiaires.doc_attestation)
        if (d.session_id) {
          if (!docsBySession[d.session_id]) docsBySession[d.session_id] = new Set();
          docsBySession[d.session_id].add(d.type);
        } else if (d.formation_id) {
          if (!docsByFormation[d.formation_id]) docsByFormation[d.formation_id] = new Set();
          docsByFormation[d.formation_id].add(d.type);
        }
      });
    }

    // 5. Vérifications "organisme entier" (indépendantes des dossiers)
    const [{ data: org }, { data: clientsOrg }, { data: veilleLog }, { count: nbPreauditsPrecedents }] = await Promise.all([
      supabase.from("organismes").select("nda").eq("id", organisme_id).single(),
      supabase.from("clients").select("id, contact_email").eq("organisme_id", organisme_id),
      supabase.from("veille_qualiopi_log").select("date_verification").order("date_verification", { ascending: false }).limit(1),
      supabase.from("preaudits").select("id", { count: "exact", head: true }).eq("organisme_id", organisme_id),
    ]);

    const ndaPresent = !!org?.nda;
    const clientsAvecContact = (clientsOrg ?? []).filter((c: { contact_email: string | null }) => !!c.contact_email).length;
    const dernierReleveVeille = veilleLog?.[0]?.date_verification ? new Date(veilleLog[0].date_verification) : null;
    const veilleRecente = dernierReleveVeille
      ? (Date.now() - dernierReleveVeille.getTime()) < 40 * 24 * 60 * 60 * 1000
      : false;
    const dejaLanceAuMoinsUneFois = (nbPreauditsPrecedents ?? 0) > 0;

    // ----------------------------------------------------------------------
    // Analyse d'UN indicateur pour UN dossier (session) donné.
    // Retourne null si l'indicateur ne s'applique pas à ce dossier précis
    // (ex : pas de stagiaire importé) — exclu de l'agrégat pour ce dossier.
    // ----------------------------------------------------------------------
    const analyserIndicateurPourDossier = (ind: Indicateur, session: Session): Statut | null => {
      const formation = formationById[session.formation_id];
      const stagsSession = stagiairesBySession[session.id] ?? [];

      switch (ind.source) {
        case "formation_champ": {
          if (!formation) return "a_verifier";
          if (ind.champ === "communication") {
            const ok = !!(formation.titre && formation.objectifs && formation.objectifs.length > 10 && formation.tarif != null && formation.duree);
            return ok ? "conforme" : nonConformeStatut(ind.nc_majeure_only);
          }
          const val = ind.champ ? (formation[ind.champ as keyof Formation] as string | null) : null;
          return val && val.length > 10 ? "conforme" : nonConformeStatut(ind.nc_majeure_only);
        }

        case "doc_session": {
          const has = docsBySession[session.id]?.has(ind.champ ?? "") ?? false;
          return has ? "conforme" : nonConformeStatut(ind.nc_majeure_only);
        }

        case "doc_formation_session": {
          const hasConvention = docsBySession[session.id]?.has("convention") ?? false;
          const hasDevis = docsBySession[session.id]?.has("devis") ?? false;
          return (hasConvention && hasDevis) ? "conforme" : nonConformeStatut(ind.nc_majeure_only);
        }

        case "stagiaire_champ": {
          if (stagsSession.length === 0) return null;
          const champ = ind.champ as keyof Stagiaire;
          const complets = stagsSession.filter(s => s[champ] === "signe" || s[champ] === "envoye").length;
          if (complets === stagsSession.length) return "conforme";
          return nonConformeStatut(ind.nc_majeure_only);
        }

        case "stagiaire_reponses": {
          if (stagsSession.length === 0) return null;
          const auMoinsUneReponse = stagsSession.some(s => {
            const notes = s.reponses_evaluation_chaud?.notes;
            return notes && Object.values(notes).some(v => typeof v === "number");
          });
          return auMoinsUneReponse ? "conforme" : nonConformeStatut(ind.nc_majeure_only);
        }

        // Indicateurs "organisme entier" : même résultat pour tous les dossiers.
        case "veille":
          return veilleRecente ? "conforme" : nonConformeStatut(ind.nc_majeure_only);
        case "historique_preaudit":
          return dejaLanceAuMoinsUneFois ? "conforme" : nonConformeStatut(ind.nc_majeure_only);
        case "clients_check":
          return clientsAvecContact > 0 ? "conforme" : nonConformeStatut(ind.nc_majeure_only);
        case "organisme_nda":
          return ndaPresent ? "conforme" : nonConformeStatut(ind.nc_majeure_only);

        case "non_applicable":
          return "non_applicable";
        case "manuel":
          return "a_verifier";
        default:
          return "a_verifier";
      }
    };

    // 6. Agrégation par indicateur sur l'ensemble des dossiers de la période
    const resultatsGlobaux = INDICATEURS.map(ind => {
      // Indicateurs organisme-entier : pas besoin de dossiers pour être évalués.
      const orgWide: Source[] = ["veille", "historique_preaudit", "clients_check", "organisme_nda", "non_applicable", "manuel"];
      if (orgWide.includes(ind.source)) {
        const statut = analyserIndicateurPourDossier(ind, { id: "", formation_id: "", date_debut: null, date_fin: null, statut: "" });
        return {
          indicateur: ind.code,
          libelle: ind.libelle,
          statut,
          nb_dossiers_conformes: 0,
          nb_dossiers_nc_majeures: 0,
          nb_dossiers_nc_mineures: 0,
          nb_dossiers_analyses: 0,
        };
      }

      const parDossier = sessions
        .map(s => analyserIndicateurPourDossier(ind, s))
        .filter((s): s is Statut => s !== null);

      if (parDossier.length === 0) {
        return {
          indicateur: ind.code, libelle: ind.libelle, statut: "a_verifier" as Statut,
          nb_dossiers_conformes: 0, nb_dossiers_nc_majeures: 0, nb_dossiers_nc_mineures: 0, nb_dossiers_analyses: 0,
        };
      }

      const ncMajeures = parDossier.filter(s => s === "nc_majeure").length;
      const ncMineures = parDossier.filter(s => s === "nc_mineure").length;
      const conformes = parDossier.filter(s => s === "conforme").length;

      let statut: Statut = "conforme";
      if (ncMajeures > 0) statut = "nc_majeure";
      else if (ncMineures > 0) statut = "nc_mineure";

      return {
        indicateur: ind.code,
        libelle: ind.libelle,
        statut,
        nb_dossiers_conformes: conformes,
        nb_dossiers_nc_majeures: ncMajeures,
        nb_dossiers_nc_mineures: ncMineures,
        nb_dossiers_analyses: parDossier.length,
      };
    });

    // 7. Score de conformité — les indicateurs "non_applicable" et "a_verifier"
    //    sont exclus du calcul (on ne pénalise pas Olivier pour une donnée que
    //    l'app ne sait pas encore vérifier automatiquement).
    const indicateursNotables = resultatsGlobaux.filter(r => r.statut !== "non_applicable" && r.statut !== "a_verifier");
    const nbConformes = indicateursNotables.filter(r => r.statut === "conforme").length;
    const nbNcMajeures = indicateursNotables.filter(r => r.statut === "nc_majeure").length;
    const nbNcMineures = indicateursNotables.filter(r => r.statut === "nc_mineure").length;
    const nbAVerifier = resultatsGlobaux.filter(r => r.statut === "a_verifier").length;
    const scoreConformite = indicateursNotables.length > 0
      ? Math.round((nbConformes / indicateursNotables.length) * 100)
      : 0;

    // 8. Recommandations prioritaires (non-conformités, majeures d'abord)
    const recommandations = resultatsGlobaux
      .filter(r => r.statut === "nc_majeure" || r.statut === "nc_mineure")
      .sort((a, b) => (b.statut === "nc_majeure" ? 1 : 0) - (a.statut === "nc_majeure" ? 1 : 0))
      .slice(0, 8)
      .map(r => ({
        indicateur: r.indicateur,
        libelle: r.libelle,
        priorite: r.statut === "nc_majeure" ? "critique" : "importante",
        nb_dossiers_concernes: r.nb_dossiers_nc_majeures + r.nb_dossiers_nc_mineures,
      }));

    // 9. Enregistrer le pré-audit (historique)
    const { data: preaudit, error: paError } = await supabase
      .from("preaudits")
      .insert({
        organisme_id,
        periode_debut,
        periode_fin,
        nb_dossiers_analyses: sessions.length,
        nb_dossiers_conformes: nbConformes,
        nb_nc_majeures: nbNcMajeures,
        nb_nc_mineures: nbNcMineures,
        score_conformite: scoreConformite,
        statut: "termine",
        resultats: resultatsGlobaux,
        recommandations,
        lance_le: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (paError) throw new Error(`Erreur enregistrement pré-audit: ${paError.message}`);

    // 10. Mettre à jour checklist_items (lu par l'onglet "Conformité Qualiopi"
    //     du Dashboard) — select puis insert/update, pas d'upsert onConflict
    //     car aucune contrainte d'unicité connue sur (organisme_id, indicateur_code).
    const statutChecklist: Record<Statut, string> = {
      conforme: "ok",
      nc_majeure: "nc_majeure",
      nc_mineure: "nc_mineure",
      a_verifier: "a_verifier",
      non_applicable: "non_applicable",
    };
    for (const r of resultatsGlobaux) {
      const { data: existing } = await supabase
        .from("checklist_items")
        .select("id")
        .eq("organisme_id", organisme_id)
        .eq("indicateur_code", r.indicateur)
        .maybeSingle();

      const payload = {
        organisme_id,
        indicateur_code: r.indicateur,
        label: r.libelle,
        statut: statutChecklist[r.statut as Statut],
        commentaire: r.nb_dossiers_analyses > 0
          ? `${r.nb_dossiers_conformes}/${r.nb_dossiers_analyses} dossier(s) conforme(s) sur la période analysée.`
          : null,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from("checklist_items").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("checklist_items").insert(payload);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        preaudit_id: preaudit.id,
        score_conformite: scoreConformite,
        nb_nc_majeures: nbNcMajeures,
        nb_nc_mineures: nbNcMineures,
        nb_a_verifier: nbAVerifier,
        nb_dossiers_analyses: sessions.length,
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
