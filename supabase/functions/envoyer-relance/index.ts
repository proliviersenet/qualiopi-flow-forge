import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
    if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY manquant");

    const { prenom, nom, email, telephone, formation_titre, motif, canal, lien: lienOverride } = await req.json();

    const motifAction: Record<string, string> = {
      convention: "signer votre convention de formation",
      emargement: "compléter votre feuille d'émargement",
      attestation: "signer votre attestation de fin de formation",
      questionnaire_avant: "compléter votre questionnaire de positionnement avant formation",
      questionnaire_apres: "compléter votre questionnaire de positionnement après formation",
      evaluation_chaud: "compléter votre évaluation à chaud",
      evaluation_formateur: "compléter votre évaluation du formateur",
      evaluation_froid: "compléter votre évaluation à froid",
      livret: "consulter votre livret d'accueil",
    };

    const action = motifAction[motif] ?? motif;
    const titre = formation_titre ?? "votre formation";
    // Correctif audit du 01/08 (test grandeur réelle) : pour un stagiaire (qui n'a
    // pas de compte QualioFlex), le lien générique vers /espace-client ne mène nulle
    // part d'utilisable — seul le lien direct par token (/positionnement/:token,
    // /emargement/:token, etc., même construction que relance-documents-auto) lui
    // permet d'agir. Les appelants concernés (declencher-flow-session,
    // positionnement-public) passent maintenant ce lien explicitement ; à défaut on
    // garde /espace-client par défaut (toujours correct pour les motifs côté client,
    // ex. "convention").
    const lien = (typeof lienOverride === "string" && lienOverride) || "https://qualioflex.fr/espace-client";

    // Correctif audit du 31/07 : l'opt-in RGPD (préférences de contact email/SMS)
    // n'était recueilli que dans le questionnaire de positionnement — trop tardif,
    // car le motif "livret" est envoyé en même temps et constitue en pratique le
    // tout premier contact avec le stagiaire après son import. On informe donc
    // dès ce premier email de l'usage des données et du moment où ses préférences
    // lui seront demandées, sans dupliquer ici la collecte elle-même (qui reste
    // dans positionnement-public, seul endroit où un choix explicite est recueilli).
    const estPremierContact = motif === "livret";
    const blocRgpdHtml = estPremierContact
      ? `<div style="background:#f7f7fb;border-radius:6px;padding:14px 18px;margin:20px 0;font-size:12px;color:#555;line-height:1.5;">
      <strong>Vos données personnelles :</strong> elles sont utilisées uniquement dans le cadre du suivi de votre formation (envoi de documents, rappels, évaluations), conformément au RGPD. Vous pourrez indiquer vos préférences de contact (email / SMS) lors du questionnaire de positionnement qui vous sera transmis prochainement. Pour exercer vos droits d'accès, de rectification ou d'opposition, contactez
      <a href="mailto:olivier@exsenco.fr" style="color:#25245e;">olivier@exsenco.fr</a>.
    </div>`
      : "";
    const blocRgpdTxt = estPremierContact
      ? " Vos données sont utilisées uniquement pour le suivi de votre formation, conformément au RGPD ; vos préférences de contact (email/SMS) vous seront demandées via le questionnaire de positionnement à venir."
      : "";

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#25245e;padding:20px 30px;border-radius:8px 8px 0 0;">
    <a href="https://qualioflex.fr" style="text-decoration:none;">
      <h1 style="color:#fff;margin:0;font-size:20px;">QualioFlex</h1>
      <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:12px;">by ExSenCo</p>
    </a>
  </div>
  <div style="background:#fff;border:1px solid #eee;padding:30px;border-radius:0 0 8px 8px;">
    <p>Bonjour <strong>${prenom} ${nom}</strong>,</p>
    <p>Une action est en attente pour votre formation <strong>"${titre}"</strong>.</p>
    <p>👉 Il vous reste à <strong>${action}</strong>.</p>
    <div style="text-align:center;margin:30px 0;">
      <a href="${lien}" style="background:#f2901e;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;">
        Accéder à mon espace →
      </a>
    </div>
    ${blocRgpdHtml}
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="font-size:13px;color:#777;">Besoin d'aide ?
      <a href="mailto:olivier@exsenco.fr" style="color:#25245e;font-weight:bold;">olivier@exsenco.fr</a>
    </p>
    <p style="font-size:11px;color:#aaa;margin-top:20px;">QualioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin</p>
  </div>
</body></html>`;

    const txt = `Bonjour ${prenom} ${nom}, ${action} pour "${titre}" est en attente. Lien : ${lien} —${blocRgpdTxt} Aide : olivier@exsenco.fr`;
    const sms = `QualioFlex : Bonjour ${prenom}, ${action} pour "${titre}" est en attente. ${lien}`;

    const results: Record<string, boolean> = {};
    const errors: string[] = [];

    if ((canal === "email" || canal === "les_deux") && email) {
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "QualioFlex by ExSenCo", email: "olivier@exsenco.fr" },
          to: [{ email, name: `${prenom} ${nom}` }],
          subject: `[QualioFlex] Rappel — action en attente`,
          htmlContent: html,
          textContent: txt,
        }),
      });
      const rb = await r.text();
      results.email = r.ok;
      if (!r.ok) errors.push(`Email(${r.status}): ${rb}`);
    }

    if ((canal === "sms" || canal === "les_deux") && telephone) {
      const cleaned = telephone.replace(/\s/g, "");
      // Format Brevo : 33607467409 (sans +, sans 0 initial)
      const phoneIntl = cleaned.startsWith("+33") ? cleaned.slice(1)
        : cleaned.startsWith("33") ? cleaned
        : cleaned.startsWith("0") ? "33" + cleaned.slice(1)
        : "33" + cleaned;
      const r = await fetch("https://api.brevo.com/v3/transactionalSMS/send", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: "QualioFlex",
          recipient: phoneIntl,
          content: `QualioFlex : Bonjour ${prenom}, une action est en attente pour votre formation. Connectez-vous sur qualioflex.fr`,
          type: "transactional",
          unicodeEnabled: false,
        }),
      });
      const rb = await r.text();
      results.sms = r.ok;
      if (!r.ok) errors.push(`SMS(${r.status}): ${rb}`);
    }

    if (!results.email && !results.sms && errors.length > 0) {
      throw new Error(errors.join(" | "));
    }

    return new Response(
      JSON.stringify({ success: true, results, errors }),
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
