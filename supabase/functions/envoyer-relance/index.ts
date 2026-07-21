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

    const { prenom, nom, email, telephone, formation_titre, motif, canal } = await req.json();
    
    // Debug
    console.log(`DEBUG: prenom=${prenom}, email=${email}, telephone="${telephone}", canal=${canal}`);

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
    const lien = "https://qualioflex.fr/espace-client";

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#25245e;padding:20px 30px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:20px;">QalioFlex</h1>
    <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:12px;">by ExSenCo</p>
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
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="font-size:13px;color:#777;">Besoin d'aide ?
      <a href="mailto:olivier@exsenco.fr" style="color:#25245e;font-weight:bold;">olivier@exsenco.fr</a>
    </p>
    <p style="font-size:11px;color:#aaa;margin-top:20px;">QalioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin</p>
  </div>
</body></html>`;

    const txt = `Bonjour ${prenom} ${nom}, ${action} pour "${titre}" est en attente. Lien : ${lien} — Aide : olivier@exsenco.fr`;
    const sms = `QalioFlex : Bonjour ${prenom}, ${action} pour "${titre}" est en attente. ${lien}`;

    const results: Record<string, boolean> = {};
    const errors: string[] = [];

    if ((canal === "email" || canal === "les_deux") && email) {
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "QalioFlex by ExSenCo", email: "olivier@exsenco.fr" },
          to: [{ email, name: `${prenom} ${nom}` }],
          subject: `[QalioFlex] Rappel — action en attente`,
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
          sender: "QalioFlex",
          recipient: phoneIntl,
          content: `QalioFlex : Bonjour ${prenom}, une action est en attente pour votre formation. Connectez-vous sur qualioflex.fr`,
          type: "transactional",
          unicodeEnabled: false,
        }),
      });
      const rb = await r.text();
      console.log(`SMS Brevo response: status=${r.status}, ok=${r.ok}, body=${rb}`);
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
