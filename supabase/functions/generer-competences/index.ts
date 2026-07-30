import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Retire les balises HTML/CSS de la trame pédagogique pour ne garder que le texte
// utile (thèmes, phases, notions, exercices) avant de l'envoyer à Claude.
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { formation_id } = await req.json();
    console.log("generer-competences: démarrage pour formation_id =", formation_id);
    if (!formation_id) throw new Error("formation_id requis");

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
    console.log("generer-competences: formation récupérée, titre =", f.titre);

    // La trame pédagogique est générée en analysant le VRAI contenu des PDF
    // (support + programme) — c'est donc la source la plus fiable pour savoir ce qui
    // est concrètement enseigné. On la réutilise ici plutôt que de repartir des seuls
    // champs texte de la formation, souvent trop courts/génériques (ex: "blabla").
    const { data: trameDoc } = await supabase
      .from("documents_formation")
      .select("contenu_html")
      .eq("formation_id", formation_id)
      .eq("type", "trame_pedagogique")
      .maybeSingle();

    const trameTexte = trameDoc?.contenu_html ? stripHtml(trameDoc.contenu_html).slice(0, 12000) : "";
    console.log("generer-competences: trame disponible =", trameTexte.length > 0, "longueur =", trameTexte.length);

    const contexteSource = trameTexte
      ? `Voici la TRAME PÉDAGOGIQUE DÉTAILLÉE de cette formation, générée à partir de l'analyse réelle du support et du programme uploadés (thèmes, phases, notions, exercices) — base-toi PRIORITAIREMENT sur son contenu réel pour identifier les compétences concrètement travaillées, et non sur les champs texte génériques ci-dessous :\n"""\n${trameTexte}\n"""\n`
      : `Aucune trame pédagogique détaillée n'est encore disponible pour cette formation (support/programme pas encore analysés) — base-toi sur les informations ci-dessous :`;

    const prompt = `Tu es expert en ingénierie pédagogique Qualiopi. Génère la liste des COMPÉTENCES et des OBJECTIFS à évaluer dans un questionnaire de positionnement (avant/après formation), sur le modèle des questionnaires Qualiopi classiques : le stagiaire note chaque item de 0 (non maîtrisé) à 4 (parfaitement maîtrisé).

${contexteSource}

Formation :
- Intitulé : ${f.titre}
- Durée : ${f.duree || "non précisée"}
- Objectifs pédagogiques (texte formateur) : ${f.objectifs || "non précisés"}
- Programme (texte formateur) : ${f.programme || "non précisé"}
- Prérequis : ${f.prerequis || "aucun"}
- Modalités : ${f.modalites || "non précisées"}

Consignes :
- IMPORTANT : le questionnaire complet (compétences + objectifs additionnés) ne doit JAMAIS dépasser 15 questions au total — un stagiaire qui doit noter plus de 15 items abandonne le questionnaire avant la fin.
- "competences" : liste de 7 à 10 compétences opérationnelles et concrètes MAXIMUM, qui correspondent aux savoir-faire les plus représentatifs RÉELLEMENT travaillés dans cette formation d'après la trame pédagogique (pas génériques, pas hors-sujet). Formulées comme des savoir-faire (ex: "Mise en place d'une prospection organisée et récurrente"). Si la trame couvre plus de compétences que cela, sélectionne les plus structurantes plutôt que de tout lister.
- "objectifs" : liste de 3 à 5 objectifs pédagogiques MAXIMUM, les plus importants, cohérents avec les objectifs annoncés et avec le contenu réel de la trame.
- Si la trame couvre plusieurs thèmes/modules distincts, répartis les compétences retenues pour couvrir chacun d'eux plutôt que de te concentrer sur un seul.
- Formulations courtes (une ligne), en français, sans numérotation.

Réponds UNIQUEMENT avec un JSON valide de cette forme exacte, sans texte autour, sans markdown :
{"competences": ["...", "..."], "objectifs": ["...", "..."]}`;

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
      console.error("generer-competences: Claude API a répondu une erreur:", claudeRes.status, err);
      throw new Error(`Claude API error (${claudeRes.status}): ${err}`);
    }

    const claudeData = await claudeRes.json();
    const rawText = (claudeData.content?.[0]?.text || "").trim();
    console.log("generer-competences: réponse Claude brute =", rawText.slice(0, 200));

    let parsed: { competences?: string[]; objectifs?: string[] };
    try {
      // Claude répond parfois avec du texte autour malgré la consigne : on isole le JSON.
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch (parseErr) {
      console.error("generer-competences: échec parsing JSON:", parseErr);
      throw new Error("Réponse de Claude illisible, réessayez.");
    }

    // Filet de sécurité : même si Claude ignore la consigne des 15 questions max,
    // on tronque ici pour garantir qu'un stagiaire n'a jamais plus de 15 items à noter.
    const competences = (Array.isArray(parsed.competences) ? parsed.competences : []).slice(0, 10);
    const objectifs = (Array.isArray(parsed.objectifs) ? parsed.objectifs : []).slice(0, 5);
    if (competences.length === 0) throw new Error("Aucune compétence générée, réessayez.");

    const { error: saveErr } = await supabase
      .from("formation_competences")
      .upsert({
        formation_id,
        competences,
        objectifs,
        genere_par: "auto",
        updated_at: new Date().toISOString(),
      }, { onConflict: "formation_id" });

    if (saveErr) console.error("generer-competences: erreur sauvegarde:", saveErr.message);

    return new Response(
      JSON.stringify({ success: true, competences, objectifs, source: trameTexte ? "trame_pedagogique" : "champs_texte" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generer-competences: ERREUR FATALE:", msg, err instanceof Error ? err.stack : "");
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});