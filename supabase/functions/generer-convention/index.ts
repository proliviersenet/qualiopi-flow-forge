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

// Chantier 5 : la convention de formation professionnelle est propre à UNE SESSION
// (un client, des stagiaires, des dates précises), sur le même modèle que le devis
// et l'émargement. Elle ne peut être générée qu'à la demande du formateur (bouton
// dédié dans ClientDetail.tsx), et seulement une fois que le client a transmis la
// liste des stagiaires — c'est ce qui permet de la préremplir intégralement plutôt
// que de produire un document à compléter à la main.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    if (!session_id) throw new Error("session_id requis");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select(`
        id, formation_id, client_id, date_debut, date_fin, lieu,
        formation:formation_id ( titre, objectifs, programme, modalites, prerequis, duree, tarif, organismes ( raison_sociale, nda, siret, adresse, telephone, email_contact, logo_url ) ),
        client:client_id ( raison_sociale, siret, adresse, contact_nom, contact_email )
      `)
      .eq("id", session_id)
      .single();

    if (sErr || !session) throw new Error("Session introuvable : " + sErr?.message);

    const s = session as Record<string, unknown>;
    const formation = s.formation as Record<string, unknown>;
    const org = (formation?.organismes as Record<string, string>) || {};
    const client = (s.client as Record<string, string>) || {};

    if (!org.email_contact) {
      return new Response(
        JSON.stringify({ error: "L'organisme de formation n'a pas d'email de contact renseigné (Profil > Organisme). Impossible de preparer la signature." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!client.contact_email) {
      return new Response(
        JSON.stringify({ error: "Ce client n'a pas d'email de contact renseigne. Impossible de preparer la signature." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Ne se génère qu'une fois les stagiaires transmis par le client — condition
    // explicite du chantier 5 (la convention se préremplit avec leurs noms).
    const { data: stagiaires, error: stErr } = await supabase
      .from("stagiaires")
      .select("nom, prenom, email_pro")
      .eq("session_id", session_id)
      .order("nom");

    if (stErr) throw new Error("Erreur lecture stagiaires : " + stErr.message);
    if (!stagiaires || stagiaires.length === 0) {
      return new Response(
        JSON.stringify({ error: "Impossible de générer la convention : aucun stagiaire n'a encore été ajouté à cette session. Le client doit d'abord transmettre la liste des stagiaires." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stagiairesRows = (stagiaires as { nom: string; prenom: string; email_pro: string | null }[])
      .map(st => `<tr><td style="padding:6px 10px;border:1px solid #eee;">${esc(st.prenom)} ${esc(st.nom)}</td><td style="padding:6px 10px;border:1px solid #eee;">${esc(st.email_pro) || "—"}</td></tr>`)
      .join("");

    const titre = (formation?.titre as string) || "Formation";
    const duree = (formation?.duree as string) || "non précisée";
    const tarif = (formation?.tarif as string) || "à définir";
    const lieu = (s.lieu as string) || "non précisé";

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Convention de formation — ${esc(titre)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #1a1a2e; padding: 24px; max-width: 800px; margin: 0 auto; font-size: 10.5pt; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #25245e; padding-bottom: 16px; margin-bottom: 24px; }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .header img { height: 52px; max-width: 130px; object-fit: contain; }
  .header h1 { font-size: 14pt; color: #25245e; margin: 0; }
  .header p { font-size: 9pt; color: #666; margin: 2px 0 0; }
  h2 { font-size: 11.5pt; color: #25245e; margin-top: 24px; border-bottom: 1px solid #e5e5ef; padding-bottom: 4px; }
  .bloc-parties { display: flex; gap: 16px; margin-bottom: 20px; }
  .bloc-partie { flex: 1; background: #f8f8fc; border-radius: 6px; padding: 12px 16px; font-size: 9.5pt; }
  .bloc-partie strong { color: #25245e; }
  table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin-top: 8px; }
  .signatures { display: flex; justify-content: space-between; margin-top: 48px; gap: 24px; page-break-before: always; }
  .signature-bloc { flex: 1; text-align: center; }
  .signature-zone { border: 1px dashed #bbb; border-radius: 6px; height: 90px; margin-top: 10px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 9pt; }
  .footer-mention { font-size: 8pt; color: #999; margin-top: 30px; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${org.logo_url ? `<img src="${esc(org.logo_url)}" alt="logo" />` : ""}
      <div>
        <h1>${esc(org.raison_sociale) || "Organisme de formation"}</h1>
        <p>${org.nda ? `NDA : ${esc(org.nda)}` : ""}${org.siret ? ` · SIRET : ${esc(org.siret)}` : ""}</p>
        <p>${esc(org.adresse) || ""}</p>
      </div>
    </div>
    <div class="devis-ref">
      <strong>CONVENTION DE FORMATION</strong><br/>
      Professionnelle continue<br/>
      (Art. L.6353-1 et s. du code du travail)
    </div>
  </div>

  <p>Entre les soussignés :</p>
  <div class="bloc-parties">
    <div class="bloc-partie">
      <strong>${esc(org.raison_sociale) || "L'organisme de formation"}</strong><br/>
      ${org.siret ? `SIRET : ${esc(org.siret)}<br/>` : ""}
      ${org.nda ? `N° de déclaration d'activité : ${esc(org.nda)}<br/>` : ""}
      ${esc(org.adresse) || ""}<br/>
      Ci-après désigné « l'organisme de formation »
    </div>
    <div class="bloc-partie">
      <strong>${esc(client.raison_sociale) || "Le client"}</strong><br/>
      ${client.siret ? `SIRET : ${esc(client.siret)}<br/>` : ""}
      ${esc(client.adresse) || ""}<br/>
      Représenté par : ${esc(client.contact_nom) || "—"}<br/>
      Ci-après désigné « le client »
    </div>
  </div>

  <h2>Article 1 — Objet</h2>
  <p>En exécution de la présente convention, l'organisme de formation organise l'action de formation professionnelle intitulée
  « <strong>${esc(titre)}</strong> » au bénéfice des salariés du client dont la liste figure à l'article 4.</p>

  <h2>Article 2 — Nature et objectifs de l'action</h2>
  <p><strong>Objectifs :</strong> ${esc((formation?.objectifs as string)) || "non précisés"}</p>
  <p><strong>Programme :</strong> ${esc((formation?.programme as string)) || "non précisé"}</p>
  ${formation?.prerequis ? `<p><strong>Prérequis :</strong> ${esc(formation.prerequis as string)}</p>` : ""}
  ${formation?.modalites ? `<p><strong>Modalités pédagogiques et d'évaluation :</strong> ${esc(formation.modalites as string)}</p>` : ""}

  <h2>Article 3 — Dates, durée et lieu</h2>
  <p>Du <strong>${formatDateFr(s.date_debut as string)}</strong> au <strong>${formatDateFr(s.date_fin as string)}</strong>, pour une durée de <strong>${esc(duree)}</strong>.</p>
  <p>Lieu de la formation : <strong>${esc(lieu)}</strong></p>

  <h2>Article 4 — Stagiaires concernés</h2>
  <table>
    <thead><tr><th style="text-align:left;padding:6px 10px;border:1px solid #eee;background:#f8f8fc;">Nom et prenom</th><th style="text-align:left;padding:6px 10px;border:1px solid #eee;background:#f8f8fc;">Email</th></tr></thead>
    <tbody>${stagiairesRows}</tbody>
  </table>

  <h2>Article 5 — Conditions financieres</h2>
  <p>Le prix de cette action de formation est fixe à <strong>${esc(tarif)}</strong>, facturé au client à l'issue de la formation ou selon les modalités convenues entre les parties.</p>

  <h2>Article 6 — Dispositions diverses</h2>
  <p>En cas d'inexécution partielle ou totale de la présente action de formation, l'organisme de formation remboursera au client les sommes indûment perçues, conformément aux dispositions de l'article L.6354-1 du code du travail.
  Toute contestation relative à l'exécution de la présente convention sera, à défaut d'accord amiable, de la compétence du tribunal du lieu du siège social de l'organisme de formation.</p>

  <div class="signatures">
    <div class="signature-bloc">
      <p>Fait pour l'organisme de formation,<br/>${esc(org.raison_sociale) || ""}</p>
      <div class="signature-zone" id="signature-zone-formateur">/signature_formateur/</div>
    </div>
    <div class="signature-bloc">
      <p>Fait pour le client,<br/>${esc(client.raison_sociale) || ""}</p>
      <div class="signature-zone" id="signature-zone-client">/signature_client/</div>
    </div>
  </div>

  <p class="footer-mention">Document généré par QalioFlex — conservé dans l'espace de la session, accessible uniquement à l'organisme de formation et au client.</p>
</body>
</html>`;

    const { data: existingDoc } = await supabase
      .from("documents_formation")
      .select("id")
      .eq("session_id", session_id)
      .eq("type", "convention")
      .maybeSingle();

    const docPayload = {
      formation_id: s.formation_id,
      session_id,
      type: "convention",
      nom_fichier: `convention_${session_id}.html`,
      genere_par: "formateur",
      contenu_html: html,
      updated_at: new Date().toISOString(),
    };

    let documentId: string;
    if (existingDoc) {
      const { error: updErr } = await supabase.from("documents_formation").update(docPayload).eq("id", existingDoc.id);
      if (updErr) throw new Error("Échec de la sauvegarde de la convention : " + updErr.message);
      documentId = (existingDoc as { id: string }).id;
    } else {
      const { data: inserted, error: insErr } = await supabase.from("documents_formation").insert(docPayload).select("id").single();
      if (insErr) throw new Error("Échec de la sauvegarde de la convention : " + insErr.message);
      documentId = (inserted as { id: string }).id;
    }

    return new Response(
      JSON.stringify({
        success: true,
        contenu_html: html,
        document_id: documentId,
        formateur: { email: org.email_contact, nom: org.raison_sociale || "Organisme de formation" },
        client: { email: client.contact_email, nom: client.contact_nom || client.raison_sociale || "Client" },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
