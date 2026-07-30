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

// L'attestation de fin de formation est un document légal STRUCTURÉ, propre à un
// STAGIAIRE (contrairement au livret/émargement/devis qui sont propres à une
// session). Pas de rédaction par Claude ici non plus : le texte réglementaire est
// standard et ne doit pas varier d'un stagiaire à l'autre. On y référence les
// compétences travaillées durant la formation (issues de la fiche formation), sans
// divulguer les notes individuelles du questionnaire — l'attestation certifie la
// participation, pas une évaluation chiffrée.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { stagiaire_id } = await req.json();
    console.log("generer-attestation: démarrage pour stagiaire_id =", stagiaire_id);
    if (!stagiaire_id) throw new Error("stagiaire_id requis");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: stagiaire, error: stErr } = await supabase
      .from("stagiaires")
      .select(`
        id, nom, prenom, session_id, doc_emargement, doc_evaluation_chaud, reponses_questionnaire_apres,
        session:session_id (
          id, formation_id, date_debut, date_fin, lieu,
          formation:formation_id ( titre, duree, organismes ( raison_sociale, nda, siret, adresse, telephone, email_contact, logo_url ) )
        )
      `)
      .eq("id", stagiaire_id)
      .single();

    if (stErr || !stagiaire) throw new Error("Stagiaire introuvable : " + stErr?.message);

    // Chantier 5 : blocage — l'attestation ne peut être générée que si
    // l'émargement ET l'évaluation à chaud sont signés par le stagiaire
    // (exigence Qualiopi : traçabilité de l'assiduité + recueil de la
    // satisfaction avant la délivrance de l'attestation).
    const stChk = stagiaire as Record<string, unknown>;
    if (stChk.doc_emargement !== "signe" || stChk.doc_evaluation_chaud !== "signe") {
      return new Response(
        JSON.stringify({ error: "L'émargement et l'évaluation à chaud doivent être signés avant de générer l'attestation." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const st = stagiaire as Record<string, unknown>;
    const session = st.session as Record<string, unknown>;
    const formation = session?.formation as Record<string, unknown>;
    const org = (formation?.organismes as Record<string, string>) || {};

    if (!session || !formation) throw new Error("Session ou formation introuvable pour ce stagiaire");

    // Liste des compétences travaillées durant la formation (fiche formation, pas
    // les notes individuelles du stagiaire).
    const { data: competencesData } = await supabase
      .from("formation_competences")
      .select("competences, objectifs")
      .eq("formation_id", session.formation_id)
      .maybeSingle();
    const competences = (competencesData?.competences as string[]) || [];

    const positionnementFait = !!st.reponses_questionnaire_apres;

    const dateEmission = new Date().toLocaleDateString("fr-FR");
    const numeroAttestation = `ATT-${String(stagiaire_id).slice(0, 8).toUpperCase()}`;

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Attestation de fin de formation — ${esc(st.prenom as string)} ${esc(st.nom as string)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #1a1a2e; padding: 30px; max-width: 800px; margin: 0 auto; }
  .header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #25245e; padding-bottom: 16px; margin-bottom: 28px; }
  .header img { height: 56px; max-width: 140px; object-fit: contain; }
  .header h1 { font-size: 15pt; color: #25245e; margin: 0; }
  .header p { font-size: 9pt; color: #666; margin: 2px 0 0; }
  .titre-doc { text-align: center; font-size: 18pt; color: #25245e; font-weight: bold; margin: 24px 0; text-transform: uppercase; letter-spacing: 1px; }
  .ref { text-align: center; font-size: 9pt; color: #999; margin-bottom: 30px; }
  .corps { font-size: 11.5pt; line-height: 1.8; }
  .corps strong { color: #25245e; }
  .bloc-formation { background: #f8f8fc; border-radius: 6px; padding: 16px 20px; margin: 20px 0; font-size: 10.5pt; }
  .bloc-formation p { margin: 4px 0; }
  h2 { font-size: 11pt; color: #25245e; margin-top: 24px; }
  ul.competences { font-size: 10pt; columns: 2; column-gap: 24px; }
  ul.competences li { margin-bottom: 6px; break-inside: avoid; }
  .mention { font-size: 8.5pt; color: #888; margin-top: 30px; font-style: italic; }
  .signature-zone { margin-top: 40px; text-align: right; font-size: 10pt; }
  .signature-box { display: inline-block; text-align: left; min-width: 220px; }
  .footer { margin-top: 30px; font-size: 8pt; color: #999; text-align: center; }
  .no-print { text-align: center; margin: 20px 0; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="header">
    ${org.logo_url ? `<img src="${esc(org.logo_url)}" alt="Logo" />` : ""}
    <div>
      <h1>${esc(org.raison_sociale || "")}</h1>
      <p>${org.nda ? `Organisme de formation déclaré sous le numéro NDA : ${esc(org.nda)}` : ""}${org.siret ? ` — SIRET : ${esc(org.siret)}` : ""}</p>
      <p>${esc(org.adresse || "")}${org.telephone ? ` — ${esc(org.telephone)}` : ""}${org.email_contact ? ` — ${esc(org.email_contact)}` : ""}</p>
    </div>
  </div>

  <div class="titre-doc">Attestation de fin de formation</div>
  <div class="ref">N° ${esc(numeroAttestation)} — délivrée le ${esc(dateEmission)}</div>

  <div class="corps">
    <p>Je soussigné(e), représentant de <strong>${esc(org.raison_sociale || "l'organisme de formation")}</strong>, atteste que :</p>
    <p style="text-align:center; font-size:13pt; margin: 18px 0;"><strong>${esc(st.prenom as string)} ${esc(st.nom as string)}</strong></p>
    <p>a suivi la formation intitulée :</p>
  </div>

  <div class="bloc-formation">
    <p><strong>${esc(formation?.titre as string)}</strong></p>
    <p>Durée : ${esc(String(formation?.duree || "non précisée"))}</p>
    <p>Dates : du ${esc(formatDateFr(session.date_debut as string))} au ${esc(formatDateFr(session.date_fin as string))}</p>
    <p>Lieu : ${esc(String(session.lieu || "non précisé"))}</p>
  </div>

  ${competences.length > 0 ? `
  <h2>Compétences travaillées durant la formation</h2>
  <ul class="competences">
    ${competences.map(c => `<li>${esc(c)}</li>`).join("")}
  </ul>` : ""}

  <p class="corps">${positionnementFait ? "Un questionnaire d'auto-positionnement a été complété par le stagiaire en fin de formation, permettant de mesurer sa progression sur les compétences ci-dessus." : ""}</p>

  <p class="mention">Cette attestation est délivrée pour faire valoir ce que de droit, conformément aux exigences du référentiel national qualité (Qualiopi).</p>

  <div class="signature-zone">
    <div class="signature-box">
      Fait à ${esc(String(session.lieu || "___________"))}, le ${esc(dateEmission)}<br/>
      Pour ${esc(org.raison_sociale || "l'organisme de formation")}<br/><br/>
      <em>Signature et cachet</em>
    </div>
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
      .eq("stagiaire_id", stagiaire_id)
      .eq("type", "attestation")
      .maybeSingle();

    const docPayload = {
      formation_id: session.formation_id,
      stagiaire_id,
      type: "attestation",
      nom_fichier: `attestation_${stagiaire_id}.html`,
      genere_par: "auto",
      contenu_html: html,
      updated_at: new Date().toISOString(),
    };

    const { error: saveErr } = existingDoc
      ? await supabase.from("documents_formation").update(docPayload).eq("id", existingDoc.id)
      : await supabase.from("documents_formation").insert(docPayload);

    if (saveErr) {
      console.error("generer-attestation: erreur sauvegarde:", saveErr.message);
      throw new Error("Échec de la sauvegarde de l'attestation : " + saveErr.message);
    }

    // Marque le statut du stagiaire comme "envoyé" (document disponible), pour que
    // la colonne Attestation du tableau formateur/client reflète l'état réel au
    // lieu de rester bloquée sur "En attente" indéfiniment.
    const { error: updErr } = await supabase
      .from("stagiaires")
      .update({ doc_attestation: "envoye" })
      .eq("id", stagiaire_id);
    if (updErr) console.error("generer-attestation: erreur mise à jour statut:", updErr.message);

    return new Response(
      JSON.stringify({ success: true, contenu_html: html }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generer-attestation: ERREUR FATALE:", msg, err instanceof Error ? err.stack : "");
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});