import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Retire les balises HTML/CSS de la trame pédagogique pour ne garder que le texte
// utile avant de l'envoyer à Claude (même logique que generer-competences).
const stripHtml = (html: string) => {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
};

// Un seul générateur pour les 3 questionnaires d'évaluation (chaud / formateur /
// froid) — le "type" reçu détermine uniquement la consigne donnée à Claude et la
// ligne (formation_id, type) ciblée dans evaluation_questions. Même principe de
// notation 0 (pas du tout) à 4 (tout à fait) que le questionnaire de positionnement,
// pour que le front puisse réutiliser le même composant de notation partout.
const CONSIGNES: Record<string, string> = {
  chaud: `Génère les questions d'un questionnaire de SATISFACTION "À CHAUD", rempli par le stagiaire juste après la fin de la formation (standard Qualiopi).
Couvre les thèmes suivants (une question par thème, formulée comme une affirmation que le stagiaire note de 0 à 4) :
- Atteinte des objectifs pédagogiques annoncés
- Qualité et clarté des contenus abordés
- Qualité pédagogique de l'animation (rythme, interactivité)
- Qualité des supports et outils fournis
- Adéquation de la durée et de l'organisation logistique
- Satisfaction générale vis-à-vis de la formation
Génère entre 6 et 9 questions au total, adaptées au contenu réel de CETTE formation (pas génériques).`,
  formateur: `Génère les questions d'un questionnaire d'ÉVALUATION DU FORMATEUR, rempli par le stagiaire juste après la formation, portant spécifiquement sur l'animateur (et non sur le contenu de la formation).
Couvre les thèmes suivants (une question par thème, formulée comme une affirmation que le stagiaire note de 0 à 4) :
- Maîtrise du sujet par le formateur
- Clarté des explications
- Capacité à s'adapter au niveau des participants
- Disponibilité et qualité des réponses aux questions
- Dynamisme et capacité à maintenir l'attention du groupe
- Qualité de la relation et de l'écoute
Génère entre 5 et 8 questions au total, adaptées au contenu réel de CETTE formation (pas génériques).`,
  froid: `Génère les questions d'un questionnaire d'ÉVALUATION "À FROID" (mesure d'impact, envoyé environ 90 jours après la fin de la formation), rempli par le stagiaire, portant sur la mise en application concrète des acquis dans son activité professionnelle.
Couvre les thèmes suivants (une question par thème, formulée comme une affirmation que le stagiaire note de 0 à 4) :
- Mise en pratique effective des compétences acquises dans le poste
- Changement observable dans les pratiques professionnelles
- Utilité de la formation par rapport aux besoins réels du poste
- Autonomie acquise sur les sujets traités
- Recommandation de la formation à un collègue
Génère entre 5 et 8 questions au total, adaptées au contenu réel de CETTE formation (pas génériques).`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { formation_id, type } = await req.json();
    console.log("generer-questions-evaluation: démarrage pour formation_id =", formation_id, "type =", type);
    if (!formation_id) throw new Error("formation_id requis");
    if (!type || !CONSIGNES[type]) throw new Error("type invalide (attendu: chaud, formateur ou froid)");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: formation, error: fErr } = await supabase
      .from("formations")
      .select("titre, objectifs, programme, prerequis, modalites, duree")
      .eq("id", formation_id)
      .single();

    if (fErr || !formation) throw new Error("Formation introuvable : " + fErr?.message);
    const f = formation as Record<string, string>;

    const { data: trameDoc } = await supabase
      .from("documents_formation")
      .select("contenu_html")
      .eq("formation_id", formation_id)
      .eq("type", "trame_pedagogique")
      .maybeSingle();

    const trameTexte = trameDoc?.contenu_html ? stripHtml(trameDoc.contenu_html).slice(0, 12000) : "";

    const contexteSource = trameTexte
      ? `Voici la TRAME PÉDAGOGIQUE DÉTAILLÉE de cette formation, générée à partir de l'analyse réelle du support et du programme uploadés — base-toi PRIORITAIREMENT sur son contenu réel :\n"""\n${trameTexte}\n"""\n`
      : `Aucune trame pédagogique détaillée n'est encore disponible pour cette formation — base-toi sur les informations ci-dessous :`;

    const prompt = `Tu es expert en ingénierie pédagogique Qualiopi.

${CONSIGNES[type]}

${contexteSource}

Formation :
- Intitulé : ${f.titre}
- Durée : ${f.duree || "non précisée"}
- Objectifs pédagogiques (texte formateur) : ${f.objectifs || "non précisés"}
- Programme (texte formateur) : ${f.programme || "non précisé"}
- Modalités : ${f.modalites || "non précisées"}

Consignes de formulation :
- Chaque question est une affirmation courte (une ligne), en français, sans numérotation, que le stagiaire note de 0 à 4.
- Formulations concrètes et adaptées au contenu réel de cette formation, pas génériques.

Réponds UNIQUEMENT avec un JSON valide de cette forme exacte, sans texte autour, sans markdown :
{"questions": ["...", "..."]}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("generer-questions-evaluation: Claude API a répondu une erreur:", claudeRes.status, err);
      throw new Error(`Claude API error (${claudeRes.status}): ${err}`);
    }

    const claudeData = await claudeRes.json();
    const rawText = (claudeData.content?.[0]?.text || "").trim();

    let parsed: { questions?: string[] };
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch (parseErr) {
      console.error("generer-questions-evaluation: échec parsing JSON:", parseErr);
      throw new Error("Réponse de Claude illisible, réessayez.");
    }

    // Filet de sécurité : jamais plus de 9 questions, quel que soit le type.
    const questions = (Array.isArray(parsed.questions) ? parsed.questions : []).slice(0, 9);
    if (questions.length === 0) throw new Error("Aucune question générée, réessayez.");

    // unique(formation_id, type) est un vrai index unique (pas partiel) : l'upsert
    // onConflict fonctionne ici, contrairement à documents_formation.
    const { error: saveErr } = await supabase
      .from("evaluation_questions")
      .upsert({
        formation_id,
        type,
        questions,
        genere_par: "auto",
        updated_at: new Date().toISOString(),
      }, { onConflict: "formation_id,type" });

    if (saveErr) {
      console.error("generer-questions-evaluation: erreur sauvegarde:", saveErr.message);
      throw new Error("Échec de la sauvegarde des questions : " + saveErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, questions, source: trameTexte ? "trame_pedagogique" : "champs_texte" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generer-questions-evaluation: ERREUR FATALE:", msg, err instanceof Error ? err.stack : "");
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});