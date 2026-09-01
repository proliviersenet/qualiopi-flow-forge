import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Durée de bannissement appliquée immédiatement : très longue (10 ans) pour
// qu'elle ne s'annule jamais toute seule. La vraie règle métier — 30 jours
// durant lesquels Olivier peut restaurer manuellement le compte, puis
// suppression définitive — est gérée à part (table demandes_suppression_compte
// + décision manuelle d'Olivier), pas par l'expiration du ban lui-même.
const BAN_DURATION = "87600h";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { avec_recuperation, mode_paiement } = await req.json();

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Utilisateur non authentifié." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Enregistre la demande (pour qu'Olivier puisse retrouver et restaurer
    //    le compte manuellement dans les 30 jours).
    const { error: insertErr } = await admin.from("demandes_suppression_compte").insert({
      user_id: user.id,
      email: user.email,
      avec_recuperation: !!avec_recuperation,
      mode_paiement: mode_paiement || null,
    });
    if (insertErr) {
      console.error("Erreur enregistrement demande de suppression:", insertErr);
      return new Response(
        JSON.stringify({ error: "Erreur serveur lors de l'enregistrement de la demande." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Bloque immédiatement toute nouvelle connexion (le compte devient
    //    inaccessible pour le formateur), sans toucher aux données.
    const { error: banErr } = await admin.auth.admin.updateUserById(user.id, {
      ban_duration: BAN_DURATION,
    });
    if (banErr) {
      console.error("Erreur blocage du compte:", banErr);
      return new Response(
        JSON.stringify({ error: "Erreur serveur lors du blocage du compte." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Email d'information (non bloquant si l'envoi échoue : le compte est
    //    déjà bloqué, ce qui est l'essentiel).
    if (RESEND_API_KEY && user.email) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "QualioFlex <noreply@qualioflex.fr>",
            to: [user.email],
            subject: "Votre compte QualioFlex a été désactivé",
            html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f8;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#25245e;padding:32px 40px;">
            <a href="https://qualioflex.fr" style="text-decoration:none;">
              <h1 style="margin:0;color:#fff;font-size:24px;font-weight:bold;">QualioFlex</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">by ExSenCo</p>
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="color:#25245e;font-size:20px;margin:0 0 16px;">Votre compte a été désactivé</h2>
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">
              Bonjour,
            </p>
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">
              Suite à votre demande, votre compte QualioFlex est <strong>immédiatement inaccessible</strong> : vous ne pouvez plus vous y connecter.
            </p>
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">
              Vos données sont conservées <strong>30 jours</strong>. Si vous changez d'avis durant ce délai, contactez-nous et nous pourrons restaurer votre accès.
            </p>
            <p style="color:#555;line-height:1.6;margin:0 0 32px;">
              Passé ce délai de 30 jours, il ne sera <strong>plus possible d'accéder à votre compte ni de récupérer vos données</strong>.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#f2901e;border-radius:6px;">
                  <a href="mailto:olivier@exsenco.fr" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">
                    Contacter le support →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f5f5f8;padding:20px 40px;border-top:1px solid #eee;">
            <p style="margin:0;color:#999;font-size:12px;">
              QualioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin<br>
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
          console.error("Erreur envoi email de désactivation:", errBody);
        }
      } catch (e) {
        console.error("Erreur envoi email de désactivation:", e);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Erreur demander-suppression-compte:", e);
    return new Response(
      JSON.stringify({ error: "Erreur serveur." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
