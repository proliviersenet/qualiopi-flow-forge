// ============================================================================
// QUALIFLOW — Edge Function : Validation et sauvegarde des corrections
// Fichier : supabase/functions/valider-questionnaire/index.ts
// Déploiement : supabase functions deploy valider-questionnaire
//
// Appelée quand le formateur clique sur "Valider et programmer l'envoi".
// Enregistre chaque modification comme donnée d'apprentissage dans
// corrections_questionnaires, active le questionnaire, et met à jour
// le log de génération avec les métriques de qualité.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SB_SERVICE_ROLE_KEY")!
);

serve(async (req: Request) => {
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
      questionnaire_id,       // id dans questionnaires_types
      formateur_user_id,
      organisme_id,
      formation_id,
      formation_titre,
      formation_thematique,
      formation_objectifs,
      questions_initiales,    // questions telles que générées par l'IA
      questions_finales,      // questions après corrections du formateur
      partage_anonymise,      // boolean : consentement au partage collectif
    } = await req.json();

    if (!questionnaire_id || !questions_finales || !formateur_user_id) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------------------------------
    // 1. Identifier les modifications entre questions initiales et finales
    // --------------------------------------------------------------------
    const initMap = new Map(
      (questions_initiales ?? []).map((q: Record<string, string>) => [q.id, q])
    );
    const finalMap = new Map(
      questions_finales.map((q: Record<string, string>) => [q.id, q])
    );

    const corrections: Record<string, unknown>[] = [];
    let nbGardees = 0;
    let nbModifiees = 0;
    let nbSupprimees = 0;
    let nbAjoutees = 0;

    // Questions supprimées (dans initiales mais pas dans finales)
    for (const [id, qInit] of initMap) {
      if (!finalMap.has(id)) {
        corrections.push({
          questionnaire_type_id: questionnaire_id,
          formateur_user_id,
          organisme_id,
          formation_id: formation_id ?? null,
          formation_titre,
          formation_thematique,
          formation_objectifs,
          action: "question_supprimee",
          question_avant: qInit,
          question_apres: null,
          partage_anonymise: partage_anonymise ?? false,
        });
        nbSupprimees++;
      }
    }

    // Questions ajoutées ou modifiées
    for (const [id, qFinal] of finalMap) {
      const qInit = initMap.get(id);
      if (!qInit) {
        // Question ajoutée par le formateur
        corrections.push({
          questionnaire_type_id: questionnaire_id,
          formateur_user_id,
          organisme_id,
          formation_id: formation_id ?? null,
          formation_titre,
          formation_thematique,
          formation_objectifs,
          action: "question_ajoutee",
          question_avant: null,
          question_apres: qFinal,
          partage_anonymise: partage_anonymise ?? false,
        });
        nbAjoutees++;
      } else if (
        (qInit as Record<string, string>).texte !== (qFinal as Record<string, string>).texte
      ) {
        // Question modifiée
        corrections.push({
          questionnaire_type_id: questionnaire_id,
          formateur_user_id,
          organisme_id,
          formation_id: formation_id ?? null,
          formation_titre,
          formation_thematique,
          formation_objectifs,
          action: "question_modifiee",
          question_avant: qInit,
          question_apres: qFinal,
          partage_anonymise: partage_anonymise ?? false,
        });
        nbModifiees++;
      } else {
        nbGardees++;
      }
    }

    // Si aucune modification, on log quand même la validation sans modif
    if (corrections.length === 0 && questions_finales.length > 0) {
      corrections.push({
        questionnaire_type_id: questionnaire_id,
        formateur_user_id,
        organisme_id,
        formation_id: formation_id ?? null,
        formation_titre,
        formation_thematique,
        formation_objectifs,
        action: "questionnaire_valide_sans_modification",
        question_avant: null,
        question_apres: null,
        partage_anonymise: partage_anonymise ?? false,
      });
      nbGardees = questions_finales.length;
    }

    // --------------------------------------------------------------------
    // 2. Sauvegarder toutes les corrections en base
    // --------------------------------------------------------------------
    if (corrections.length > 0) {
      const { error: corrErr } = await supabase
        .from("corrections_questionnaires")
        .insert(corrections);
      if (corrErr) throw new Error(`Erreur corrections: ${corrErr.message}`);
    }

    // --------------------------------------------------------------------
    // 3. Activer le questionnaire (passer actif = true)
    //    et mettre à jour les questions avec la version finale
    // --------------------------------------------------------------------
    const { error: qtErr } = await supabase
      .from("questionnaires_types")
      .update({
        questions: questions_finales,
        actif: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", questionnaire_id);

    if (qtErr) throw new Error(`Erreur activation questionnaire: ${qtErr.message}`);

    // --------------------------------------------------------------------
    // 4. Mettre à jour le log de génération avec les métriques de qualité
    // --------------------------------------------------------------------
    const nbTotal = (questions_initiales ?? []).length;
    const tauxValidation = nbTotal > 0
      ? parseFloat(((nbGardees) / nbTotal).toFixed(2))
      : 1.0;

    await supabase
      .from("generation_questionnaires_log")
      .update({
        nb_questions_gardees: nbGardees,
        nb_questions_modifiees: nbModifiees,
        nb_questions_ajoutees: nbAjoutees,
        taux_validation: tauxValidation,
        valide_par_formateur: true,
        valide_le: new Date().toISOString(),
      })
      .eq("questionnaire_type_id", questionnaire_id)
      .order("created_at", { ascending: false })
      .limit(1);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          questions_finales: questions_finales.length,
          questions_gardees: nbGardees,
          questions_modifiees: nbModifiees,
          questions_supprimees: nbSupprimees,
          questions_ajoutees: nbAjoutees,
          taux_validation: tauxValidation,
          corrections_enregistrees: corrections.length,
        },
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
    console.error("Erreur valider-questionnaire:", err);
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
