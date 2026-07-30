// ============================================================================
// QUALIFLOW — Edge Function : Génération de questionnaires par IA
// Fichier : supabase/functions/generer-questionnaire/index.ts
// Déploiement : supabase functions deploy generer-questionnaire
//
// Flux :
//   1. Reçoit les données de la formation (titre, objectifs, thématique,
//      programme texte extrait optionnel)
//   2. Récupère les corrections précédentes du formateur sur thématiques proches
//   3. Récupère les corrections collectives anonymisées
//   4. Appelle Claude API (claude-sonnet-4-6) pour générer les questions
//   5. Retourne le questionnaire structuré prêt pour validation formateur
//   6. Log la génération dans generation_questionnaires_log
//
// Variables d'environnement requises (Supabase Secrets) :
//   ANTHROPIC_API_KEY     = sk-ant-...
//   SB_SERVICE_ROLE_KEY   = sb_secret_...
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SB_SERVICE_ROLE_KEY")!
);

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
interface Question {
  id: string;
  texte: string;
  categorie: "competence" | "objectif";
  type_reponse: "echelle_0_4";
  source: "ia" | "correction_propre" | "correction_collective" | "bibliotheque";
  ordre: number;
}

interface QuestionnaireGenere {
  formation_titre: string;
  questions: Question[];
  meta: {
    corrections_propres_utilisees: number;
    corrections_collectives_utilisees: number;
    questions_bibliotheque: number;
    questions_ia: number;
    modele: string;
  };
}

// ----------------------------------------------------------------------------
// Récupérer les corrections précédentes pertinentes
// Cherche les corrections sur la même thématique, triées par fréquence
// ----------------------------------------------------------------------------
async function getCorrections(
  formateurUserId: string,
  thematique: string,
  limit = 20
): Promise<{ propres: Question[]; collectives: Question[] }> {
  // Corrections du formateur sur cette thématique
  const { data: propres } = await supabase
    .from("corrections_questionnaires")
    .select("question_apres, action")
    .eq("formateur_user_id", formateurUserId)
    .eq("formation_thematique", thematique)
    .in("action", ["question_ajoutee", "question_modifiee"])
    .not("question_apres", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Corrections collectives anonymisées sur cette thématique
  const { data: collectives } = await supabase
    .from("corrections_questionnaires")
    .select("question_apres, action")
    .eq("formation_thematique", thematique)
    .eq("partage_anonymise", true)
    .neq("formateur_user_id", formateurUserId)
    .in("action", ["question_ajoutee", "question_modifiee"])
    .not("question_apres", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  const toQuestions = (
    rows: Record<string, unknown>[] | null,
    source: Question["source"]
  ): Question[] =>
    (rows ?? []).map((r, i) => ({
      id: `${source}_${i}`,
      texte: (r.question_apres as Record<string, string>)?.texte ?? "",
      categorie: (r.question_apres as Record<string, string>)?.categorie as
        | "competence"
        | "objectif" ?? "competence",
      type_reponse: "echelle_0_4",
      source,
      ordre: i,
    })).filter(q => q.texte.length > 0);

  return {
    propres: toQuestions(propres, "correction_propre"),
    collectives: toQuestions(collectives, "correction_collective"),
  };
}

// ----------------------------------------------------------------------------
// Appel Claude API pour générer les questions
// ----------------------------------------------------------------------------
async function genererAvecClaude(params: {
  formationTitre: string;
  formationObjectifs: string;
  formationThematique: string;
  programmeTexte?: string;
  correctionsPropres: Question[];
  correctionsCollectives: Question[];
}): Promise<{ competences: string[]; objectifs: string[] }> {
  const {
    formationTitre,
    formationObjectifs,
    formationThematique,
    programmeTexte,
    correctionsPropres,
    correctionsCollectives,
  } = params;

  // Construire le contexte des corrections pour le prompt
  const ctxPropres = correctionsPropres.length > 0
    ? `\nCorrections précédentes de ce formateur sur des formations similaires (à privilégier) :\n${
        correctionsPropres.map(q => `- [${q.categorie}] ${q.texte}`).join("\n")
      }`
    : "";

  const ctxCollectives = correctionsCollectives.length > 0
    ? `\nCorrections d'autres formateurs sur cette thématique (à utiliser si pertinent) :\n${
        correctionsCollectives.slice(0, 10).map(q => `- [${q.categorie}] ${q.texte}`).join("\n")
      }`
    : "";

  const ctxProgramme = programmeTexte
    ? `\nContenu du programme de formation (extrait) :\n${programmeTexte.slice(0, 2000)}`
    : "";

  const prompt = `Tu es un expert en ingénierie pédagogique et en certification Qualiopi.
Tu dois générer un questionnaire de positionnement AVANT formation pour le référentiel Qualiopi (indicateur 8).

Formation : "${formationTitre}"
Thématique : ${formationThematique}
Objectifs pédagogiques : ${formationObjectifs}
${ctxProgramme}
${ctxPropres}
${ctxCollectives}

Génère exactement :
- 8 à 12 questions sur les COMPÉTENCES ACTUELLES du stagiaire (auto-évaluation de ce qu'il sait déjà faire)
- 3 à 6 questions sur les OBJECTIFS DE LA FORMATION (auto-évaluation de sa maîtrise des objectifs visés)

Toutes les questions sont évaluées sur une échelle de 0 à 4 :
0 = non maîtrisé, 1 = notions, 2 = maîtrise partielle, 3 = bonne maîtrise, 4 = maîtrise parfaite

Règles impératives :
- Les questions doivent être précises, opérationnelles et directement liées au contenu de la formation
- Commencer par un verbe d'action (Utiliser, Maîtriser, Connaître, Appliquer, Structurer...)
- Pas de questions fermées (oui/non), uniquement des compétences mesurables sur 0-4
- Si des corrections précédentes sont fournies, intègre-les en priorité si elles sont pertinentes
- Les questions compétences portent sur ce que le stagiaire SAIT DÉJÀ
- Les questions objectifs portent sur ce qu'il SAURA FAIRE après la formation

Réponds UNIQUEMENT en JSON valide, sans markdown ni explication :
{
  "competences": ["question1", "question2", ...],
  "objectifs": ["objectif1", "objectif2", ...]
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Erreur Claude API: ${response.status} ${err}`);
  }

  const data = await response.json();
  const texte = data.content?.[0]?.text ?? "";

  // Nettoyage du JSON si Claude a ajouté des backticks
  const json = texte
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    return JSON.parse(json);
  } catch {
    throw new Error(`Réponse Claude non parseable: ${texte.slice(0, 200)}`);
  }
}

// ----------------------------------------------------------------------------
// Assembler le questionnaire final
// Fusionne questions IA + corrections propres + corrections collectives
// en évitant les doublons (similarité textuelle simple)
// ----------------------------------------------------------------------------
function assemblerQuestionnaire(
  questionsIA: { competences: string[]; objectifs: string[] },
  correctionsPropres: Question[],
  correctionsCollectives: Question[],
  formationTitre: string
): QuestionnaireGenere {
  const questions: Question[] = [];
  let ordre = 0;

  // Dédoublonnage simple par mots-clés
  const dejaVus = new Set<string>();
  const cleNormalise = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9àâéèêëîïôùûüç]/g, " ").trim();
  const estDoublon = (texte: string): boolean => {
    const cle = cleNormalise(texte).slice(0, 40);
    if (dejaVus.has(cle)) return true;
    dejaVus.add(cle);
    return false;
  };

  // 1. Questions issues des corrections propres du formateur (priorité absolue)
  for (const q of correctionsPropres.slice(0, 4)) {
    if (!estDoublon(q.texte)) {
      questions.push({ ...q, ordre: ordre++ });
    }
  }

  // 2. Questions générées par l'IA — compétences
  for (const texte of questionsIA.competences) {
    if (!estDoublon(texte)) {
      questions.push({
        id: `ia_c_${ordre}`,
        texte,
        categorie: "competence",
        type_reponse: "echelle_0_4",
        source: "ia",
        ordre: ordre++,
      });
    }
  }

  // 3. Questions issues des corrections collectives (max 3)
  let nbCollectives = 0;
  for (const q of correctionsCollectives) {
    if (nbCollectives >= 3) break;
    if (!estDoublon(q.texte)) {
      questions.push({ ...q, source: "correction_collective", ordre: ordre++ });
      nbCollectives++;
    }
  }

  // 4. Questions générées par l'IA — objectifs
  for (const texte of questionsIA.objectifs) {
    if (!estDoublon(texte)) {
      questions.push({
        id: `ia_o_${ordre}`,
        texte,
        categorie: "objectif",
        type_reponse: "echelle_0_4",
        source: "ia",
        ordre: ordre++,
      });
    }
  }

  const nbIA = questions.filter(q => q.source === "ia").length;
  const nbPropres = questions.filter(q => q.source === "correction_propre").length;
  const nbColl = questions.filter(q => q.source === "correction_collective").length;
  const nbBiblio = questions.filter(q => q.source === "bibliotheque").length;

  return {
    formation_titre: formationTitre,
    questions,
    meta: {
      corrections_propres_utilisees: nbPropres,
      corrections_collectives_utilisees: nbColl,
      questions_bibliotheque: nbBiblio,
      questions_ia: nbIA,
      modele: "claude-sonnet-4-6",
    },
  };
}

// ----------------------------------------------------------------------------
// Point d'entrée principal
// ----------------------------------------------------------------------------
serve(async (req: Request) => {
  // CORS pour l'appel depuis le frontend
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    const {
      formation_id,
      formation_titre,
      formation_objectifs,
      formation_thematique,
      programme_texte,
      formateur_user_id,
      organisme_id,
      type_questionnaire = "positionnement_avant",
      source_generation = "saisie_formateur",
    } = await req.json();

    if (!formation_titre || !formation_objectifs || !formateur_user_id) {
      return new Response(
        JSON.stringify({
          error: "Paramètres manquants : formation_titre, formation_objectifs, formateur_user_id",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Récupérer les corrections précédentes
    const { propres, collectives } = await getCorrections(
      formateur_user_id,
      formation_thematique ?? "vente",
      15
    );

    // 2. Générer les questions avec Claude
    const questionsIA = await genererAvecClaude({
      formationTitre: formation_titre,
      formationObjectifs: formation_objectifs,
      formationThematique: formation_thematique ?? "vente",
      programmeTexte: programme_texte,
      correctionsPropres: propres,
      correctionsCollectives: collectives,
    });

    // 3. Assembler le questionnaire final
    const questionnaire = assemblerQuestionnaire(
      questionsIA,
      propres,
      collectives,
      formation_titre
    );

    // 4. Sauvegarder dans questionnaires_types (statut: brouillon avant validation)
    const { data: qtSaved, error: qtError } = await supabase
      .from("questionnaires_types")
      .insert({
        formation_id: formation_id ?? null,
        organisme_id,
        type: type_questionnaire,
        titre: `Positionnement — ${formation_titre}`,
        questions: questionnaire.questions,
        actif: false, // devient true après validation formateur
      })
      .select("id")
      .single();

    if (qtError) throw new Error(`Erreur sauvegarde questionnaire: ${qtError.message}`);

    // 5. Logger la génération
    await supabase.from("generation_questionnaires_log").insert({
      questionnaire_type_id: qtSaved.id,
      formateur_user_id,
      formation_id: formation_id ?? null,
      source_generation,
      nb_questions_generees: questionnaire.questions.length,
      corrections_propres_utilisees: questionnaire.meta.corrections_propres_utilisees,
      corrections_collectives_utilisees: questionnaire.meta.corrections_collectives_utilisees,
    });

    return new Response(
      JSON.stringify({
        success: true,
        questionnaire_id: qtSaved.id,
        questionnaire,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Erreur generer-questionnaire:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erreur inconnue",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
