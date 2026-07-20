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
    const {
      stagiaire_id,
      session_id,
      motif, // 'convention' | 'emargement' | 'attestation' | 'questionnaire'
      canal,  // 'email' | 'sms' | 'les_deux'
      envoye_par, // 'auto' | 'formateur' | 'client'
    } = await req.json();

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

    const sujet = `[QalioFlex] Relance — ${motifLabel[motif] || motif}`;
    const corps = `Bonjour ${prenom} ${nom},\n\nNous vous rappelons que ${motifLabel[motif] || motif} concernant la formation "${formationTitre}" est en attente de votre signature ou complétion.\n\nMerci de bien vouloir y répondre dès que possible.\n\nCordialement,\nL'équipe QalioFlex`;

    let emailSent = false;
    let smsSent = false;
    const errors: string[] = [];

    // Envoi email
    if ((canal === "email" || canal === "les_deux") && email) {
      const emailRes = await fetch(`${BREVO_API}/smtp/email`, {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "QalioFlex", email: "noreply@qualioflex.fr" },
          to: [{ email, name: `${prenom} ${nom}` }],
          subject: sujet,
          textContent: corps,
          htmlContent: `<p>Bonjour <strong>${prenom} ${nom}</strong>,</p><p>Nous vous rappelons que <strong>${motifLabel[motif] || motif}</strong> concernant la formation <strong>"${formationTitre}"</strong> est en attente de votre signature ou complétion.</p><p>Merci de bien vouloir y répondre dès que possible.</p><p>Cordialement,<br>L'équipe QalioFlex</p>`,
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
          content: `QalioFlex : Bonjour ${prenom}, ${motifLabel[motif] || motif} pour "${formationTitre}" est en attente. Merci de le compléter rapidement.`,
          type: "transactional",
        }),
      });
      if (smsRes.ok) smsSent = true;
      else {
        const err = await smsRes.text();
        errors.push(`SMS: ${err}`);
      }
    }

    // Enregistrer la relance en base
    const statut = (emailSent || smsSent) ? "envoye" : "erreur";
    await supabase.from("relances").insert({
      stagiaire_id,
      session_id,
      type: canal,
      motif,
      statut,
      envoye_par: envoye_par || "formateur",
    });

    if (statut === "erreur") {
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
