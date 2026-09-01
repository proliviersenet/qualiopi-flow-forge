import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    console.log("generer-livret: démarrage pour session_id =", session_id);
    if (!session_id) throw new Error("session_id requis");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Récupérer la session + la formation + l'organisme + le client, pour disposer
    // de toutes les infos pratiques (dates, lieu, contacts) nécessaires au livret.
    const { data: sessionData, error: sErr } = await supabase
      .from("sessions")
      .select("*, formation:formation_id(*, organismes(raison_sociale, nda, adresse, telephone, email_contact, logo_url, site_web)), client:client_id(raison_sociale, adresse, contact_nom, contact_email)")
      .eq("id", session_id)
      .single();

    if (sErr || !sessionData) throw new Error("Session introuvable : " + sErr?.message);
    console.log("generer-livret: session récupérée");

    const s = sessionData as Record<string, unknown>;
    const formation = (s.formation as Record<string, unknown>) || {};
    const org = (formation.organismes as Record<string, string>) || {};
    const client = (s.client as Record<string, string>) || {};

    const titre = (formation.titre as string) || "";
    const objectifs = (formation.objectifs as string) || "";
    const modalites = (formation.modalites as string) || "";
    const prerequis = (formation.prerequis as string) || "";
    const duree = (formation.duree as string) || "";
    const dateDebut = s.date_debut ? new Date(s.date_debut as string).toLocaleDateString("fr-FR") : "";
    const dateFin = s.date_fin ? new Date(s.date_fin as string).toLocaleDateString("fr-FR") : "";
    const lieu = (s.lieu as string) || "";
    const lienVisio = (s.lien_visio as string) || "";

    const prompt = `Tu es expert Qualiopi en ingénierie de formation. Rédige le contenu d'un LIVRET D'ACCUEIL destiné à un stagiaire, pour la formation et la session ci-dessous.

Organisme de formation :
- Raison sociale : ${org.raison_sociale || "—"}
- N° de déclaration d'activité : ${org.nda || "—"}
- Adresse : ${org.adresse || "—"}
- Téléphone : ${org.telephone || "—"}
- Email de contact : ${org.email_contact || "—"}
- Site web : ${org.site_web || "—"}

Formation :
- Intitulé : ${titre}
- Durée : ${duree}
- Objectifs pédagogiques : ${objectifs || "non précisés"}
- Prérequis : ${prerequis || "aucun"}
- Modalités : ${modalites || "non précisées"}

Session :
- Dates : du ${dateDebut || "—"} au ${dateFin || dateDebut || "—"}
- Lieu : ${lieu || (lienVisio ? "à distance (visio)" : "non précisé")}
${lienVisio ? `- Lien visio : ${lienVisio}` : ""}

Client (entreprise du stagiaire) : ${client.raison_sociale || "—"}

Rédige un livret d'accueil complet et professionnel avec les sections suivantes (utilise des <h2>/<h3> pour les titres, <p> et <ul>/<li> pour le contenu) :
1. Mot de bienvenue personnalisé (mentionne l'intitulé de la formation)
2. Présentation de l'organisme de formation
3. Informations pratiques de la session (dates, horaires habituels à préciser par le formateur, lieu ou modalités de connexion, ce qu'il faut apporter)
4. Déroulement et modalités pédagogiques de la formation
5. Accessibilité et situation de handicap — texte indiquant que toute situation de handicap doit être signalée en amont à l'organisme (via l'email de contact ci-dessus) afin d'adapter au mieux l'accueil et le déroulement
6. Modalités d'évaluation (questionnaire de positionnement avant/après, évaluation à chaud en fin de formation)
7. Réclamations et litiges — décrit une procédure simple : toute réclamation est à adresser par écrit à l'organisme (email de contact ci-dessus) qui s'engage à y répondre sous un délai raisonnable
8. Règlement intérieur résumé — assiduité (émargement obligatoire), respect des horaires, comportement, usage du matériel, confidentialité
9. Contacts utiles

Consignes :
- Contenu factuel et professionnel, adapté aux informations fournies ci-dessus. N'invente pas d'informations non fournies (ex : horaires précis) — indique plutôt qu'elles seront confirmées ou communiquées par le formateur.
- Ne mentionne PAS que ce document a été généré par une IA.
- Retourne UNIQUEMENT le HTML du corps (pas de balises html/head/body), commence directement par le premier <h2>.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("generer-livret: Claude API a répondu une erreur:", claudeRes.status, err);
      throw new Error(`Claude API error (${claudeRes.status}): ${err}`);
    }

    const claudeData = await claudeRes.json();
    const corpsHTML = claudeData.content?.[0]?.text || "";
    console.log("generer-livret: réponse Claude reçue, longueur =", corpsHTML.length);

    const contenuHTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Livret d'accueil — ${titre}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #1a1a2e; line-height: 1.5; }
  .page { max-width: 900px; margin: 0 auto; padding: 24px; }
  .header { background: #25245e; color: #fff; padding: 24px; border-radius: 4px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 18pt; }
  .header .logo { max-height: 55px; max-width: 130px; object-fit: contain; background: #fff; border-radius: 4px; padding: 4px; }
  h2 { color: #25245e; font-size: 13pt; margin: 22px 0 8px; border-bottom: 2px solid #f2901e; padding-bottom: 4px; }
  h3 { color: #25245e; font-size: 11pt; margin: 14px 0 6px; }
  p { margin-bottom: 8px; }
  ul { margin: 6px 0 10px 22px; }
  li { margin-bottom: 4px; }
  .footer { text-align: center; margin-top: 30px; font-size: 8pt; color: #aaa; border-top: 1px solid #eee; padding-top: 12px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      ${org.logo_url ? `<img src="${org.logo_url}" alt="Logo" class="logo" style="margin-bottom:8px;">` : ""}
      <h1>Livret d'accueil</h1>
      <p style="font-size:11pt;opacity:0.85;">${titre}</p>
    </div>
    <div style="text-align:right;font-size:9pt;opacity:0.75;">
      <p>${org.raison_sociale || ""}</p>
      <p>NDA : ${org.nda || "—"}</p>
    </div>
  </div>

  ${corpsHTML}

  <div class="no-print" style="text-align:center;margin:24px 0;">
    <button onclick="window.print()" style="background:#f2901e;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:11pt;font-weight:bold;cursor:pointer;">
      🖨️ Imprimer / Enregistrer en PDF
    </button>
  </div>

  <div class="footer">
    ${org.raison_sociale || ""} — Livret d'accueil généré par QualioFlex
  </div>
</div>
</body>
</html>`;

    // Sauvegarder en base, rattaché à la SESSION (formation_id conservé pour rester
    // compatible avec les policies RLS existantes qui vérifient l'appartenance via
    // formation_id -> organisme).
    //
    // IMPORTANT : on ne peut PAS utiliser .upsert(..., {onConflict:"session_id,type"})
    // ici. L'index unique sur (session_id, type) est PARTIEL (WHERE session_id IS NOT
    // NULL) — PostgREST envoie un simple "ON CONFLICT (session_id, type)" sans le
    // prédicat, que Postgres ne sait pas faire correspondre à un index partiel
    // (erreur 42P10 "no unique or exclusion constraint matching the ON CONFLICT
    // specification"). Ça faisait échouer silencieusement TOUTES les sauvegardes de
    // documents de session/stagiaire depuis l'ajout de ces index. On fait donc un
    // SELECT puis INSERT/UPDATE explicite, qui n'a pas ce problème.
    const { data: existingDoc } = await supabase
      .from("documents_formation")
      .select("id")
      .eq("session_id", session_id)
      .eq("type", "livret")
      .maybeSingle();

    const docPayload = {
      formation_id: s.formation_id,
      session_id,
      type: "livret",
      nom_fichier: `Livret_accueil_${titre.replace(/[^a-zA-Z0-9]/g, "_")}.html`,
      genere_par: "auto",
      contenu_html: contenuHTML,
      updated_at: new Date().toISOString(),
    };

    const { error: docErr } = existingDoc
      ? await supabase.from("documents_formation").update(docPayload).eq("id", existingDoc.id)
      : await supabase.from("documents_formation").insert(docPayload);

    if (docErr) {
      console.error("Erreur sauvegarde livret:", docErr.message);
      throw new Error("Échec de la sauvegarde du livret : " + docErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, contenu_html: contenuHTML }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generer-livret: ERREUR FATALE:", msg, err instanceof Error ? err.stack : "");
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});