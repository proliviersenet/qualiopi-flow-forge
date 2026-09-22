import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Prototype "création de formation par upload de document" (piste remontée
// par Baptiste Leber, CR beta test du 22/09). PDF d'abord (choix Olivier du
// 22/09) : on réutilise le pattern déjà en prod de generer-trame, qui envoie
// le PDF directement à Claude en base64 — Claude lit le PDF nativement,
// aucune bibliothèque d'extraction de texte séparée n'est nécessaire.
//
// Règle stricte actée avec Olivier (note d'architecture du 21/09) : le prix
// n'est JAMAIS pré-rempli automatiquement dans le formulaire, même s'il est
// détecté dans le document — c'est le formateur qui le saisit, toujours.
// Cette fonction renvoie donc le tarif détecté séparément, à titre
// purement informatif ; c'est au front de ne jamais l'assigner au champ
// "tarif" du formulaire.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { documents } = await req.json();

    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error("Au moins un document (PDF) est requis.");
    }
    if (documents.length > 2) {
      throw new Error("Deux documents maximum (programme + support).");
    }
    for (const d of documents) {
      if (!d?.base64 || !d?.type) throw new Error("Chaque document doit avoir un type et un contenu.");
      if (!["programme", "support"].includes(d.type)) throw new Error("Type de document invalide.");
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

    const prompt = `Tu es expert en ingénierie pédagogique Qualiopi. Analyse le(s) document(s) PDF fourni(s) (programme de formation et/ou support pédagogique) et extrais UNIQUEMENT les informations qui apparaissent EXPLICITEMENT dans le texte. N'invente et ne déduis RIEN.

Extrais ces champs :
- "titre" : titre de la formation
- "objectifs" : objectifs pédagogiques
- "programme" : résumé du contenu / déroulé de la formation (2 à 5 phrases)
- "duree" : durée annoncée (ex: "2 jours (14h)", "21 heures")
- "public_vise" : public concerné / cible de la formation
- "prerequis" : prérequis mentionnés
- "tarif_detecte" : UNIQUEMENT si un prix est explicitement écrit dans le document (nombre en euros, sans symbole ni texte). Sinon null. Ce champ est purement informatif : il ne sera jamais rempli automatiquement dans le formulaire du formateur.

RÈGLE STRICTE : si une information n'est pas explicitement présente dans le document, retourne exactement la chaîne "non trouvé" pour ce champ (ou null pour tarif_detecte). N'invente jamais, ne déduis jamais à partir d'informations implicites.

Réponds UNIQUEMENT avec un JSON valide de cette forme exacte, sans texte autour, sans markdown :
{"titre": "...", "objectifs": "...", "programme": "...", "duree": "...", "public_vise": "...", "prerequis": "...", "tarif_detecte": null}`;

    const content: Record<string, unknown>[] = documents.map((d: { type: "programme" | "support"; base64: string }) => ({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: d.base64 },
      title: d.type === "programme" ? "Programme de formation" : "Support pédagogique",
    }));
    content.push({ type: "text", text: prompt });

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
        messages: [{ role: "user", content }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      throw new Error(`Claude API error: ${err}`);
    }

    const claudeData = await claudeRes.json();
    const rawText = (claudeData.content?.[0]?.text || "").trim();

    let parsed: Record<string, unknown>;
    try {
      // Claude répond parfois avec du texte autour malgré la consigne : on isole le JSON.
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      throw new Error("Réponse de l'analyse illisible, réessayez.");
    }

    const nonTrouve = (v: unknown) =>
      typeof v !== "string" ||
      v.trim() === "" ||
      v.trim().toLowerCase() === "non trouvé" ||
      v.trim().toLowerCase() === "non trouve";

    const champs = {
      titre: nonTrouve(parsed.titre) ? "" : String(parsed.titre),
      objectifs: nonTrouve(parsed.objectifs) ? "" : String(parsed.objectifs),
      programme: nonTrouve(parsed.programme) ? "" : String(parsed.programme),
      duree: nonTrouve(parsed.duree) ? "" : String(parsed.duree),
      public_vise: nonTrouve(parsed.public_vise) ? "" : String(parsed.public_vise),
      prerequis: nonTrouve(parsed.prerequis) ? "" : String(parsed.prerequis),
    };

    // Le prix n'est jamais auto-rempli : on ne renvoie qu'une valeur numérique
    // informative si Claude en a explicitement trouvé une, jamais de texte
    // libre qui pourrait finir par erreur dans le formulaire.
    const tarif_detecte = typeof parsed.tarif_detecte === "number" ? parsed.tarif_detecte : null;

    const champs_non_trouves = Object.entries(champs)
      .filter(([, v]) => !v)
      .map(([k]) => k);

    return new Response(
      JSON.stringify({ success: true, champs, tarif_detecte, champs_non_trouves }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
