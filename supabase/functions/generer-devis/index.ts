import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string | null | undefined) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const formatDateFr = (iso: string | null | undefined) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR") : "non précisée";

// Le devis est propre à UNE SESSION (un client, des dates précises) — contrairement
// à l'ancien rattachement par formation, qui aurait partagé le même devis entre
// tous les clients suivant la même formation. On le stocke donc avec session_id,
// sur le même modèle que le livret et l'émargement.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    console.log("generer-devis: démarrage pour session_id =", session_id);
    if (!session_id) throw new Error("session_id requis");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select(`
        id, formation_id, client_id, date_debut, date_fin, lieu,
        formation:formation_id ( titre, objectifs, programme, duree, tarif, organismes ( raison_sociale, nda, siret, adresse, telephone, email_contact, logo_url ) ),
        client:client_id ( raison_sociale, adresse, contact_nom, contact_email )
      `)
      .eq("id", session_id)
      .single();

    if (sErr || !session) throw new Error("Session introuvable : " + sErr?.message);
    const s = session as Record<string, unknown>;
    const formation = s.formation as Record<string, unknown>;
    const org = (formation?.organismes as Record<string, string>) || {};
    const client = (s.client as Record<string, string>) || {};

    const { count: nbStagiaires } = await supabase
      .from("stagiaires")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session_id);

    let objetTexte = `Formation « ${formation?.titre as string} » — ${formation?.objectifs || "voir programme détaillé"}.`;
    try {
      const prompt = `Rédige UNE SEULE phrase commerciale courte (30 mots maximum), en français, professionnelle, décrivant l'objet d'un devis de formation professionnelle intitulée "${formation?.titre}". Objectifs pédagogiques : ${formation?.objectifs || "non précisés"}. Réponds UNIQUEMENT avec la phrase, sans guillemets, sans markdown.`;
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 200, messages: [{ role: "user", content: prompt }] }),
      });
      if (claudeRes.ok) {
        const claudeData = await claudeRes.json();
        const texte = (claudeData.content?.[0]?.text || "").trim();
        if (texte) objetTexte = texte;
      } else {
        console.error("generer-devis: Claude API non-ok, fallback utilisé:", claudeRes.status);
      }
    } catch (aiErr) {
      console.error("generer-devis: échec appel Claude, fallback utilisé:", aiErr);
    }

    const tarif = String(formation?.tarif || "").trim();
    const nb = nbStagiaires ?? 0;
    const dateDevis = new Date().toLocaleDateString("fr-FR");
    const numeroDevis = `DEV-${session_id.slice(0, 8).toUpperCase()}`;

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Devis — ${esc(formation?.titre as string)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #1a1a2e; padding: 24px; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #25245e; padding-bottom: 16px; margin-bottom: 24px; }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .header img { height: 52px; max-width: 130px; object-fit: contain; }
  .header h1 { font-size: 15pt; color: #25245e; margin: 0; }
  .header p { font-size: 9pt; color: #666; margin: 2px 0 0; }
  .devis-ref { text-align: right; font-size: 10pt; color: #444; }
  .devis-ref strong { color: #25245e; font-size: 13pt; }
  .bloc-client { background: #f8f8fc; border-radius: 6px; padding: 14px 18px; margin-bottom: 20px; font-size: 10pt; }
  h2 { font-size: 12pt; color: #25245e; margin-top: 24px; }
  .objet { font-size: 10.5pt; line-height: 1.5; }
  table { border-collapse: collapse; width: 100%; font-size: 10pt; margin-top: 10px; }
  th, td { border: 1px solid #ccc; padding: 10px 12px; text-align: left; }
  th { background: #25245e; color: #fff; font-size: 9pt; }
  td.montant { text-align: right; font-weight: bold; }
  .a-verifier { background: #fff8e6; border: 1px solid #f2d98a; border-radius: 6px; padding: 10px 14px; font-size: 9.5pt; color: #8a6d1a; margin-top: 14px; }
  .signature-zone { margin-top: 36px; display: flex; justify-content: space-between; font-size: 9.5pt; }
  .signature-box { border: 1px solid #ccc; border-radius: 6px; padding: 12px; width: 45%; min-height: 70px; }
  .footer { margin-top: 30px; font-size: 8pt; color: #999; text-align: center; }
  .no-print { text-align: center; margin: 20px 0; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${org.logo_url ? `<img src="${esc(org.logo_url)}" alt="Logo" />` : ""}
      <div>
        <h1>${esc(org.raison_sociale || "")}</h1>
        <p>${org.nda ? `NDA : ${esc(org.nda)}` : ""}${org.siret ? ` — SIRET : ${esc(org.siret)}` : ""}</p>
        <p>${esc(org.adresse || "")}${org.telephone ? ` — ${esc(org.telephone)}` : ""}${org.email_contact ? ` — ${esc(org.email_contact)}` : ""}</p>
      </div>
    </div>
    <div class="devis-ref">
      <strong>DEVIS</strong><br/>
      N° ${esc(numeroDevis)}<br/>
      Date : ${esc(dateDevis)}<br/>
      Valable 30 jours
    </div>
  </div>

  <div class="bloc-client">
    <p><strong>Client :</strong> ${esc(client.raison_sociale || "")}</p>
    ${client.contact_nom ? `<p>À l'attention de : ${esc(client.contact_nom)}</p>` : ""}
    ${client.adresse ? `<p>${esc(client.adresse)}</p>` : ""}
    ${client.contact_email ? `<p>${esc(client.contact_email)}</p>` : ""}
  </div>

  <h2>Objet</h2>
  <p class="objet">${esc(objetTexte)}</p>
  <p class="objet">Durée : ${esc(String(formation?.duree || "non précisée"))} — Dates prévisionnelles : du ${esc(formatDateFr(s.date_debut as string))} au ${esc(formatDateFr(s.date_fin as string))} — Lieu : ${esc(String(s.lieu || "non précisé"))}.</p>

  <h2>Détail de la prestation</h2>
  <table>
    <thead>
      <tr><th>Désignation</th><th>Nombre de stagiaires</th><th>Tarif</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${esc(formation?.titre as string)}</td>
        <td>${nb > 0 ? nb : "à confirmer"}</td>
        <td class="montant">${tarif ? esc(tarif) : "à confirmer avec le formateur"}</td>
      </tr>
    </tbody>
  </table>

  ${!tarif || nb === 0 ? `<div class="a-verifier">⚠️ ${!tarif ? "Aucun tarif n'est renseigné sur la fiche formation — complétez-le avant l'envoi. " : ""}${nb === 0 ? "Aucun stagiaire n'est encore importé pour cette session." : ""}</div>` : ""}

  <div class="signature-zone">
    <div class="signature-box"><strong>${esc(org.raison_sociale || "L'organisme de formation")}</strong><br/>Date, cachet et signature</div>
    <div class="signature-box"><strong>${esc(client.raison_sociale || "Le client")}</strong><br/>Bon pour accord — Date et signature</div>
  </div>

  <div class="no-print">
    <button onclick="window.print()" style="background:#25245e;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:bold;cursor:pointer;">🖨️ Imprimer / Enregistrer en PDF</button>
  </div>
  <div class="footer">Document généré par QalioFlex — ${esc(org.raison_sociale || "")}</div>
</body>
</html>`;

    const { data: existingDoc } = await supabase
      .from("documents_formation")
      .select("id")
      .eq("session_id", session_id)
      .eq("type", "devis")
      .maybeSingle();

    const docPayload = {
      formation_id: s.formation_id,
      session_id,
      type: "devis",
      nom_fichier: `devis_${session_id}.html`,
      genere_par: "auto",
      contenu_html: html,
      updated_at: new Date().toISOString(),
    };

    const { error: saveErr } = existingDoc
      ? await supabase.from("documents_formation").update(docPayload).eq("id", existingDoc.id)
      : await supabase.from("documents_formation").insert(docPayload);

    if (saveErr) {
      console.error("generer-devis: erreur sauvegarde:", saveErr.message);
      throw new Error("Échec de la sauvegarde du devis : " + saveErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, contenu_html: html }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generer-devis: ERREUR FATALE:", msg, err instanceof Error ? err.stack : "");
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});