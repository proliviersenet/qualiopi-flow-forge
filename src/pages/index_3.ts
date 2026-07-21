import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf";

// Cap de sécurité pour éviter d'envoyer un texte disproportionné à Claude
// si un PDF est anormalement long (ex: fichier corrompu ou mal converti).
const MAX_CHARS_PAR_DOCUMENT = 150000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { formation_id } = await req.json();
    console.log("generer-trame: démarrage pour formation_id =", formation_id);
    if (!formation_id) throw new Error("formation_id requis");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    console.log("generer-trame: env OK ?", {
      hasAnthropicKey: !!ANTHROPIC_API_KEY,
      hasSupabaseUrl: !!SUPABASE_URL,
      hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
    });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Récupérer les données de la formation + organisme
    const { data: formation, error: fErr } = await supabase
      .from("formations")
      .select("*, organismes(raison_sociale, nda, adresse, logo_url, telephone, email_contact)")
      .eq("id", formation_id)
      .single();

    if (fErr || !formation) throw new Error("Formation introuvable: " + fErr?.message);
    console.log("generer-trame: formation récupérée, titre =", (formation as Record<string, string>).titre);

    const org = (formation as Record<string, unknown>).organismes as Record<string, string> || {};
    const titre = (formation as Record<string, string>).titre || "";
    const objectifs = (formation as Record<string, string>).objectifs || "";
    const programme = (formation as Record<string, string>).programme || "";
    const duree = (formation as Record<string, string>).duree || "";
    const modalites = (formation as Record<string, string>).modalites || "";

    // Télécharger le support et le programme (PDF) uploadés pour cette formation,
    // puis en extraire le texte (plutôt que d'envoyer le PDF entier à Claude en mode
    // "vision" page par page) — nettement plus rapide, ce qui évite de flirter avec
    // la limite d'exécution des Edge Functions (150s sur le plan gratuit Supabase).
    const telechargerEtExtraireTexte = async (type: "support" | "programme") => {
      const path = `formations/${formation_id}/${type}/${type}.pdf`;
      console.log(`generer-trame: téléchargement ${path}`);
      const { data, error } = await supabase.storage.from("documents-qualiopi").download(path);
      if (error || !data) {
        console.error(`generer-trame: échec téléchargement ${path} :`, error?.message);
        throw new Error(
          `${type === "support" ? "Le support pédagogique" : "Le programme détaillé"} (PDF) est introuvable. ` +
          `Uploadez-le au format PDF depuis la fiche formation avant de générer la trame.`
        );
      }
      console.log(`generer-trame: ${path} téléchargé, taille = ${data.size} octets`);

      const buffer = await data.arrayBuffer();
      try {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { totalPages, text } = await extractText(pdf, { mergePages: true });
        const texteFinal = text.length > MAX_CHARS_PAR_DOCUMENT
          ? text.slice(0, MAX_CHARS_PAR_DOCUMENT) + "\n[...texte tronqué, document trop long...]"
          : text;
        console.log(`generer-trame: ${path} — ${totalPages} page(s), ${text.length} caractères extraits`);
        return texteFinal.trim();
      } catch (extractErr) {
        const extractMsg = extractErr instanceof Error ? extractErr.message : String(extractErr);
        console.error(`generer-trame: échec extraction texte ${path} :`, extractMsg);
        throw new Error(
          `Impossible de lire le contenu du ${type === "support" ? "support pédagogique" : "programme détaillé"} ` +
          `(PDF illisible ou corrompu) : ${extractMsg}`
        );
      }
    };

    const [texteSupport, texteProgramme] = await Promise.all([
      telechargerEtExtraireTexte("support"),
      telechargerEtExtraireTexte("programme"),
    ]);
    console.log("generer-trame: texte des 2 PDF extrait, appel Claude API...");

    // Appel Claude API pour générer la trame, à partir de l'analyse réelle des 2 PDF
    const prompt = `Tu es expert en ingénierie pédagogique et en formations professionnelles Qualiopi.

Voici le texte extrait de deux documents :

--- DÉBUT SUPPORT PÉDAGOGIQUE (diaporama/support de cours) ---
${texteSupport || "(aucun texte détecté dans ce document — probablement un support essentiellement visuel)"}
--- FIN SUPPORT PÉDAGOGIQUE ---

--- DÉBUT PROGRAMME DÉTAILLÉ ---
${texteProgramme || "(aucun texte détecté dans ce document)"}
--- FIN PROGRAMME DÉTAILLÉ ---

Analyse en profondeur leur contenu (sections, notions abordées, exercices, ordre de progression, durée implicite de chaque partie si mentionnée) pour générer une TRAME PÉDAGOGIQUE COMPLÈTE et fidèle au contenu réel de ces documents — pas une trame générique.

Métadonnées de la formation (à utiliser pour le cadrage, la cohérence des horaires et en complément si les PDF sont peu détaillés sur un point) :
**Titre** : ${titre}
**Durée** : ${duree}
**Objectifs** : ${objectifs}
**Programme (texte saisi par le formateur)** : ${programme}
**Modalités** : ${modalites}

La trame doit être structurée en tableau HTML avec les colonnes :
- Thème (regroupement thématique, basé sur les sections réelles du support/programme)
- Phase (intitulé de la séquence)
- Objectif spécifique / Message à transmettre
- Outils / Approche pédagogique (identifie dans le support si un exercice, cas pratique, quiz, etc. est prévu)
- Horaire (ex: Jour 1 - 9h00)
- Durée (ex: 30')
- Observations / Notes formateur

Règles :
- Base la trame sur le contenu réel et l'ordre des documents fournis, ne l'invente pas
- Couvre l'intégralité de la durée annoncée avec des horaires réalistes (pauses café 15min, déjeuner 90min)
- Alterne les modalités pédagogiques (magistral, participatif, ateliers, mises en situation, exercices)
- Commence par un accueil/introduction et termine par une synthèse/clôture
- Intègre les éléments Qualiopi : questionnaire de positionnement, évaluation à chaud en fin de formation
- Sois précis et opérationnel pour que le formateur puisse animer directement depuis cette trame

Retourne UNIQUEMENT le HTML du tableau (pas de markdown, pas de balises html/body/head), commence directement par <table>.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("generer-trame: Claude API a répondu une erreur:", claudeRes.status, err);
      throw new Error(`Claude API error (${claudeRes.status}): ${err}`);
    }

    const claudeData = await claudeRes.json();
    const tableauHTML = claudeData.content?.[0]?.text || "";
    console.log("generer-trame: réponse Claude reçue, longueur tableau HTML =", tableauHTML.length);

    // Générer le HTML complet de la trame
    const contenuHTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Trame Pédagogique — ${titre}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #1a1a2e; }
  .page { max-width: 1100px; margin: 0 auto; padding: 24px; }
  .header { background: #25245e; color: #fff; padding: 20px 24px; border-radius: 4px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 16pt; }
  .header .logo { max-height: 50px; max-width: 120px; object-fit: contain; background: #fff; border-radius: 4px; padding: 4px; }
  .meta { background: #f5f5f8; border-radius: 4px; padding: 14px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 9pt; }
  .meta .item label { color: #888; display: block; font-size: 8pt; text-transform: uppercase; }
  .meta .item span { font-weight: 600; }
  .confidential { background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 8px 12px; font-size: 9pt; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { background: #25245e; color: #fff; padding: 8px 6px; text-align: left; font-size: 8pt; }
  td { padding: 6px; border: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) td { background: #f9f9fb; }
  tr.pause td { background: #fff3cd; font-weight: bold; text-align: center; font-size: 8pt; }
  .footer { text-align: center; margin-top: 20px; font-size: 8pt; color: #aaa; border-top: 1px solid #eee; padding-top: 12px; }
  .badge-confidentiel { display: inline-block; background: #dc3545; color: #fff; border-radius: 3px; padding: 2px 8px; font-size: 8pt; font-weight: bold; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .no-print { display: none; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      ${org.logo_url ? `<img src="${org.logo_url}" alt="Logo" class="logo" style="margin-bottom:8px;">` : ""}
      <h1>Trame Pédagogique</h1>
      <p style="font-size:11pt;opacity:0.8;">${titre}</p>
    </div>
    <div style="text-align:right;font-size:9pt;opacity:0.7;">
      <p>${org.raison_sociale || ""}</p>
      <p>NDA : ${org.nda || "—"}</p>
    </div>
  </div>

  <div class="confidential">
    🔒 <span class="badge-confidentiel">DOCUMENT CONFIDENTIEL</span>
    Usage exclusif du formateur — Ne pas diffuser aux stagiaires ou clients.
  </div>

  <div class="meta">
    <div class="item"><label>Formation</label><span>${titre}</span></div>
    <div class="item"><label>Durée</label><span>${duree || "—"}</span></div>
    <div class="item"><label>Modalités</label><span>${modalites || "—"}</span></div>
    <div class="item"><label>Organisme</label><span>${org.raison_sociale || "—"}</span></div>
    <div class="item"><label>Formateur</label><span>${org.email_contact || "—"}</span></div>
    <div class="item"><label>Générée le</label><span>${new Date().toLocaleDateString("fr-FR")}</span></div>
  </div>

  <h2 style="color:#25245e;font-size:12pt;margin-bottom:12px;">Déroulé pédagogique détaillé</h2>

  ${tableauHTML}

  <div class="no-print" style="text-align:center;margin:20px 0;">
    <button onclick="window.print()" style="background:#f2901e;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:11pt;font-weight:bold;cursor:pointer;">
      🖨️ Imprimer / Enregistrer en PDF
    </button>
  </div>

  <div class="footer">
    Trame pédagogique générée par QalioFlex by ExSenCo — ${new Date().toLocaleDateString("fr-FR")}
  </div>
</div>
</body>
</html>`;

    // Sauvegarder en base
    const { error: docErr } = await supabase
      .from("documents_formation")
      .upsert({
        formation_id,
        type: "trame_pedagogique",
        nom_fichier: `Trame_pedagogique_${titre.replace(/[^a-zA-Z0-9]/g, "_")}.html`,
        genere_par: "auto",
        contenu_html: contenuHTML,
        updated_at: new Date().toISOString(),
      }, { onConflict: "formation_id,type" });

    if (docErr) console.error("Erreur sauvegarde trame:", docErr.message);

    return new Response(
      JSON.stringify({ success: true, contenu_html: contenuHTML }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generer-trame: ERREUR FATALE:", msg, err instanceof Error ? err.stack : "");
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
