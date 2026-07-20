import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const { stagiaire_id, session_id, motif, canal } = await req.json();

    if (!stagiaire_id) throw new Error("stagiaire_id manquant");
    if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY non configuré");

    // Récupérer le stagiaire
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: s, error: sErr } = await supabase
      .from("stagiaires")
      .select("nom, prenom, email_pro, telephone, session_id")
      .eq("id", stagiaire_id)
      .single();

    if (sErr || !s) throw new Error("Stagiaire introuvable: " + (sErr?.message ?? "null"));

    const prenom = s.prenom ?? "";
    const nom = s.nom ?? "";
    const email = s.email_pro ?? "";
    const phone = s.telephone ?? "";
    const sid = s.session_id ?? session_id;

    // Titre formation
    let formationTitre = "votre formation";
    if (sid) {
      const { data: sess } = await supabase
        .from("sessions")
        .select("formations(titre)")
        .eq("id", sid)
        .single();
      const titre = (sess?.formations as Record<string, string>)?.titre;
      if (titre) formationTitre = titre;
    }

    const motifAction: Record<string, string> = {
      convention: "signer votre convention de formation",
      emargement: "compléter votre feuille d'émargement",
      attestation: "signer votre attestation de fin de formation",
      questionnaire: "compléter votre questionnaire de satisfaction",
    };

    const lienAction = "https://qualioflex.fr/espace-client";
    const sujet = `[QalioFlex] Rappel — action en attente`;
    const action = motifAction[motif] ?? motif;

    const htmlContent = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#25245e;padding:20px 30px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:20px;">QalioFlex</h1>
  </div>
  <div style="background:#fff;border:1px solid #eee;padding:30px;border-radius:0 0 8px 8px;">
    <p>Bonjour <strong>${prenom} ${nom}</strong>,</p>
    <p>Vous n'avez pas encore répondu à une action concernant <strong>"${formationTitre}"</strong>.</p>
    <p>👉 Il vous reste à <strong>${action}</strong>.</p>
    <div style="text-align:center;margin:30px 0;">
      <a href="${lienAction}" style="background:#f2901e;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;">Accéder à mon espace →</a>
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="font-size:13px;color:#777;">Besoin d'aide ? <a href="mailto:olivier@exsenco.fr" style="color:#25245e;font-weight:bold;">olivier@exsenco.fr</a></p>
  </div>
</body></html>`;

    const results: Record<string, boolean> = {};
    const errors: string[] = [];

    // Email
    if ((canal === "email" || canal === "les_deux") && email) {
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "QalioFlex by ExSenCo", email: "olivier@exsenco.fr" },
          to: [{ email, name: `${prenom} ${nom}` }],
          subject: sujet,
          htmlContent,
          textContent: `Bonjour ${prenom} ${nom}, il vous reste à ${action} pour "${formationTitre}". Lien : ${lienAction} — Aide : olivier@exsenco.fr`,
        }),
      });
      const rb = await r.text();
      results.email = r.ok;
      if (!r.ok) errors.push(`Email(${r.status}): ${rb}`);
    }

    // SMS
    if ((canal === "sms" || canal === "les_deux") && phone) {
      const cleaned = phone.replace(/\s/g, "");
      const phoneIntl = cleaned.startsWith("+33") ? cleaned
        : "+33" + (cleaned.startsWith("0") ? cleaned.slice(1) : cleaned);
      const r = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: "QalioFlex",
          recipient: phoneIntl,
          content: `QalioFlex : Bonjour ${prenom}, ${action} pour "${formationTitre}" est en attente. qualioflex.fr — Aide : olivier@exsenco.fr`,
          type: "transactional",
        }),
      });
      const rb = await r.text();
      results.sms = r.ok;
      if (!r.ok) errors.push(`SMS(${r.status}): ${rb}`);
    }

    if (errors.length > 0 && !results.email && !results.sms) {
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
