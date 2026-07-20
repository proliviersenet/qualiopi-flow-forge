import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    console.log("=== envoyer-relance START ===");

    // Env vars dans le handler (pas au niveau module)
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    console.log("BREVO_API_KEY présent:", BREVO_API_KEY.length > 0);
    console.log("SUPABASE_URL présent:", SUPABASE_URL.length > 0);

    const body = await req.json();
    console.log("Body reçu:", JSON.stringify(body));

    const { stagiaire_id, session_id, motif, canal, envoye_par } = body;

    if (!stagiaire_id) {
      return new Response(JSON.stringify({ error: "stagiaire_id manquant" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Récupérer les infos du stagiaire
    const { data: stagiaire, error: stagErr } = await supabase
      .from("stagiaires")
      .select("nom, prenom, email_pro, telephone, session_id")
      .eq("id", stagiaire_id)
      .single();

    console.log("Stagiaire:", JSON.stringify(stagiaire), "Erreur:", stagErr?.message);

    if (stagErr || !stagiaire) {
      return new Response(JSON.stringify({ error: "Stagiaire introuvable: " + stagErr?.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Récupérer le titre de la formation via session
    const { data: sessionData } = await supabase
      .from("sessions")
      .select("formation:formation_id(titre)")
      .eq("id", stagiaire.session_id || session_id)
      .single();

    const formationTitre = (sessionData?.formation as Record<string, string>)?.titre || "votre formation";
    const prenom = stagiaire.prenom || "";
    const nom = stagiaire.nom || "";
    const email = stagiaire.email_pro || "";
    const phone = stagiaire.telephone || "";

    console.log(`Envoi relance à ${prenom} ${nom} — email: ${email}, phone: ${phone}, motif: ${motif}, canal: ${canal}`);

    const motifAction: Record<string, string> = {
      convention: "signer votre convention de formation",
      emargement: "compléter votre feuille d'émargement",
      attestation: "signer votre attestation de fin de formation",
      questionnaire: "compléter votre questionnaire de satisfaction",
    };

    const motifLabel: Record<string, string> = {
      convention: "la convention de formation",
      emargement: "la feuille d'émargement",
      attestation: "l'attestation de fin de formation",
      questionnaire: "le questionnaire de satisfaction",
    };

    const lienAction = "https://qualioflex.fr/espace-client";
    const sujet = `[QalioFlex] Rappel — ${motifLabel[motif] || motif} en attente`;

    const htmlContent = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="background:#25245e;padding:20px 30px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:20px;">QalioFlex</h1>
    <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:12px;">by ExSenCo</p>
  </div>
  <div style="background:#fff;border:1px solid #eee;border-top:none;padding:30px;border-radius:0 0 8px 8px;">
    <p>Bonjour <strong>${prenom} ${nom}</strong>,</p>
    <p>Vous n'avez pas encore répondu à une action en attente concernant votre formation <strong>"${formationTitre}"</strong>.</p>
    <p>👉 Il vous reste à <strong>${motifAction[motif] || motifLabel[motif]}</strong>.</p>
    <div style="text-align:center;margin:30px 0;">
      <a href="${lienAction}" style="background:#f2901e;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">Accéder à mon espace →</a>
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="font-size:13px;color:#777;">Besoin d'aide ?</p>
    <p style="font-size:13px;"><a href="mailto:olivier@exsenco.fr" style="color:#25245e;font-weight:bold;">olivier@exsenco.fr</a></p>
    <p style="font-size:11px;color:#aaa;margin-top:24px;">QalioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin</p>
  </div>
</body></html>`;

    const textContent = `Bonjour ${prenom} ${nom},\n\nVous n'avez pas encore répondu à une action en attente pour "${formationTitre}".\nAction : ${motifAction[motif] || motif}\nLien : ${lienAction}\nBesoin d'aide : olivier@exsenco.fr`;

    const smsContent = `QalioFlex : Bonjour ${prenom}, vous n'avez pas encore ${motifAction[motif] || motif} pour "${formationTitre}". Connectez-vous sur qualioflex.fr. Aide : olivier@exsenco.fr`;

    let emailSent = false;
    let smsSent = false;
    const errors: string[] = [];

    // Email via Brevo
    if ((canal === "email" || canal === "les_deux") && email) {
      const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "QalioFlex", email: "noreply@qualioflex.fr" },
          to: [{ email, name: `${prenom} ${nom}` }],
          subject: sujet,
          textContent,
          htmlContent,
        }),
      });
      const emailBody = await emailRes.text();
      console.log("Email Brevo status:", emailRes.status, emailBody);
      if (emailRes.ok) emailSent = true;
      else errors.push(`Email: ${emailBody}`);
    }

    // SMS via Brevo
    if ((canal === "sms" || canal === "les_deux") && phone) {
      const cleaned = phone.replace(/\s/g, "");
      const phoneIntl = cleaned.startsWith("+33") ? cleaned : "+33" + (cleaned.startsWith("0") ? cleaned.slice(1) : cleaned);
      const smsRes = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ sender: "QalioFlex", recipient: phoneIntl, content: smsContent, type: "transactional" }),
      });
      const smsBody = await smsRes.text();
      console.log("SMS Brevo status:", smsRes.status, smsBody);
      if (smsRes.ok) smsSent = true;
      else errors.push(`SMS: ${smsBody}`);
    }

    console.log(`=== RÉSULTAT: email=${emailSent}, sms=${smsSent}, errors=${errors.join("|")} ===`);

    if (!emailSent && !smsSent) {
      return new Response(JSON.stringify({ error: errors.join(" | ") }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, email: emailSent, sms: smsSent }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("=== ERREUR CRITIQUE ===", err?.message || String(err));
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
