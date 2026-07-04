import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, organisme_id, organisme_nom, formateur_nom } = await req.json();

    if (!email || !organisme_id) {
      return new Response(
        JSON.stringify({ error: "Email et organisme_id requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client Supabase avec service role pour bypasser RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Vérifier si une invitation en attente existe déjà pour cet email + organisme
    const { data: existing } = await supabase
      .from("invitations_clients")
      .select("id, token, expires_at")
      .eq("email", email)
      .eq("organisme_id", organisme_id)
      .eq("statut", "en_attente")
      .gte("expires_at", new Date().toISOString())
      .single();

    let token: string;

    if (existing) {
      // Réutiliser le token existant
      token = existing.token;
    } else {
      // Créer une nouvelle invitation
      const { data: invitation, error: invitError } = await supabase
        .from("invitations_clients")
        .insert({
          organisme_id,
          email,
          statut: "en_attente",
        })
        .select("token")
        .single();

      if (invitError) throw invitError;
      token = invitation.token;
    }

    const lienInvitation = `https://qualioflex.fr/invitation/${token}`;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

    // Envoi de l'email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "QalioFlex <noreply@qualioflex.fr>",
        to: [email],
        subject: `${formateur_nom || "Votre formateur"} vous invite à rejoindre QalioFlex`,
        html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f8;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#25245e;padding:32px 40px;">
            <h1 style="margin:0;color:#fff;font-size:24px;font-weight:bold;">QalioFlex</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">by ExSenCo</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="color:#25245e;font-size:20px;margin:0 0 16px;">Vous êtes invité(e) à rejoindre QalioFlex</h2>
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">
              <strong>${formateur_nom || "Votre formateur"}</strong>${organisme_nom ? ` (${organisme_nom})` : ""} vous invite à créer votre espace client sur <strong>QalioFlex</strong>, la plateforme de gestion de formations conformes Qualiopi.
            </p>
            <p style="color:#555;line-height:1.6;margin:0 0 32px;">
              Cliquez sur le bouton ci-dessous pour créer votre espace en moins de 2 minutes. Il vous suffira de saisir votre numéro SIREN pour que vos informations soient automatiquement récupérées.
            </p>
            <!-- CTA -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#f2901e;border-radius:6px;">
                  <a href="${lienInvitation}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">
                    Créer mon espace client →
                  </a>
                </td>
              </tr>
            </table>
            <p style="color:#999;font-size:12px;margin:24px 0 0;">
              Ce lien est valable 7 jours. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f5f5f8;padding:20px 40px;border-top:1px solid #eee;">
            <p style="margin:0;color:#999;font-size:12px;">
              QalioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin<br>
              <a href="https://qualioflex.fr" style="color:#25245e;">qualioflex.fr</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      throw new Error(`Resend error: ${errBody}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Invitation envoyée avec succès" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Erreur envoyer-invitation:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
