import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const BREVO_API = "https://api.brevo.com/v3";

// Convertit 0612345678 → +33612345678
const toIntlPhone = (phone: string) => {
  const cleaned = phone.replace(/\s/g, "");
  if (cleaned.startsWith("+33")) return cleaned;
  if (cleaned.startsWith("0")) return "+33" + cleaned.slice(1);
  return "+33" + cleaned;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    console.log("envoyer-relance appelé:", JSON.stringify(body));
    const { stagiaire_id, session_id, motif, canal, envoye_par } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Récupérer les infos du stagiaire + session + formation
    const { data: stagiaire, error: stagErr } = await supabase
      .from("stagiaires")
      .select("*, session:session_id(*, formation:formation_id(titre))")
      .eq("id", stagiaire_id)
      .single();

    if (stagErr || !stagiaire) throw new Error("Stagiaire introuvable");

    const formation = (stagiaire.session as Record<string, unknown>)?.formation as Record<string, string>;
    const formationTitre = formation?.titre || "votre formation";
    const prenom = stagiaire.prenom || "";
    const nom = stagiaire.nom || "";
    const email = stagiaire.email_pro || "";
    const phone = stagiaire.telephone || "";

    const motifLabel: Record<string, string> = {
      convention: "la convention de formation",
      emargement: "la feuille d'émargement",
      attestation: "l'attestation de fin de formation",
      questionnaire: "le questionnaire de satisfaction",
    };

    const motifAction: Record<string, string> = {
      convention: "signer votre convention de formation",
      emargement: "compléter votre feuille d'émargement",
      attestation: "signer votre attestation de fin de formation",
      questionnaire: "compléter votre questionnaire de satisfaction",
    };

    const sujet = `[QalioFlex] Rappel — ${motifLabel[motif] || motif} en attente`;
    const lienAction = "https://qualioflex.fr/espace-client";

    const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
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
      <a href="${lienAction}" style="background:#f2901e;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">
        Accéder à mon espace →
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="font-size:13px;color:#777;">Besoin d'aide ? Contactez-nous directement :</p>
    <p style="font-size:13px;">
      <a href="mailto:olivier@exsenco.fr" style="color:#25245e;font-weight:bold;">olivier@exsenco.fr</a>
    </p>
    <p style="font-size:11px;color:#aaa;margin-top:24px;">
      QalioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin
    </p>
  </div>
</body>
</html>`;

    const textContent = `Bonjour ${prenom} ${nom},\n\nVous n'avez pas encore répondu à une action en attente pour votre formation "${formationTitre}".\n\nAction requise : ${motifAction[motif] || motifLabel[motif]}\n\nAccédez à votre espace : ${lienAction}\n\nBesoin d'aide ? Contactez-nous : olivier@exsenco.fr\n\nCordialement,\nL'équipe QalioFlex`;

    let emailSent = false;
    let smsSent = false;
    const errors: string[] = [];

    // Envoi email
    if ((canal === "email" || canal === "les_deux") && email) {
      const emailRes = await fetch(`${BREVO_API}/smtp/email`, {
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
      if (emailRes.ok) emailSent = true;
      else {
        const err = await emailRes.text();
        errors.push(`Email: ${err}`);
      }
    }

    // Envoi SMS
    if ((canal === "sms" || canal === "les_deux") && phone) {
      const phoneIntl = toIntlPhone(phone);
      const smsRes = await fetch(`${BREVO_API}/transactionalSMS/sms`, {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: "QalioFlex",
          recipient: phoneIntl,
          content: `QalioFlex : Bonjour ${prenom}, vous n'avez pas encore ${motifAction[motif] || motifLabel[motif]} pour "${formationTitre}". Connectez-vous sur qualioflex.fr. Besoin d'aide : olivier@exsenco.fr`,
          type: "transactional",
        }),
      });
      if (smsRes.ok) smsSent = true;
      else {
        const err = await smsRes.text();
        errors.push(`SMS: ${err}`);
      }
    }

    // Enregistrement du résultat (sans FK participations pour l'instant)
    console.log(`Relance résultat — email: ${emailSent}, sms: ${smsSent}, erreurs: ${errors.join(" | ")}`);

    if (!emailSent && !smsSent) {
      return new Response(
        JSON.stringify({ error: errors.join(" | ") }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, email: emailSent, sms: smsSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Erreur envoyer-relance:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
