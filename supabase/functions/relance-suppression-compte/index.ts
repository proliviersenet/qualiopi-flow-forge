import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const ADMIN_EMAIL = "olivier@exsenco.fr";
const FENETRE_JOURS = 30;

function joursEcoules(demandeeLe: string): number {
  const ms = Date.now() - new Date(demandeeLe).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function dateLimite(demandeeLe: string): string {
  const d = new Date(demandeeLe);
  d.setDate(d.getDate() + FENETRE_JOURS);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

async function envoyerEmail(to: string, toName: string, subject: string, html: string) {
  if (!BREVO_API_KEY) {
    console.error("BREVO_API_KEY manquant, email non envoyé:", subject, to);
    return false;
  }
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: "QualioFlex by ExSenCo", email: "olivier@exsenco.fr" },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent: html,
    }),
  });
  if (!r.ok) {
    console.error("Erreur envoi Brevo:", await r.text());
  }
  return r.ok;
}

function emailWrapper(titre: string, corps: string): string {
  return `
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
            <h2 style="color:#25245e;font-size:20px;margin:0 0 16px;">${titre}</h2>
            ${corps}
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
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const provided = req.headers.get("x-cron-secret") ?? "";
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return new Response(
        JSON.stringify({ error: "Non autorisé" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: demandes, error: fetchErr } = await admin
      .from("demandes_suppression_compte")
      .select("id, user_id, email, demandee_le, relance_j5_envoyee, relance_j15_envoyee, notif_olivier_envoyee")
      .is("restauree_le", null)
      .is("supprimee_definitivement_le", null);

    if (fetchErr) {
      console.error("Erreur lecture demandes_suppression_compte:", fetchErr);
      return new Response(
        JSON.stringify({ error: "Erreur serveur lors de la lecture des demandes." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let relancesJ5 = 0;
    let relancesJ15 = 0;
    let notifsOlivier = 0;

    for (const d of demandes ?? []) {
      const jours = joursEcoules(d.demandee_le);
      const limite = dateLimite(d.demandee_le);

      if (jours >= 5 && !d.relance_j5_envoyee) {
        const joursRestants = Math.max(0, FENETRE_JOURS - jours);
        const html = emailWrapper(
          `Il vous reste ${joursRestants} jours pour récupérer vos données`,
          `
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">Bonjour,</p>
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">
              Votre compte QualioFlex est désactivé depuis le ${new Date(d.demandee_le).toLocaleDateString("fr-FR")}.
              Vos données sont toujours conservées, mais il vous reste <strong>${joursRestants} jours</strong>
              (jusqu'au <strong>${limite}</strong>) pour nous contacter si vous souhaitez récupérer l'accès à votre compte.
            </p>
            <p style="color:#555;line-height:1.6;margin:0 0 32px;">
              Passé ce délai, il ne sera plus possible d'accéder à votre compte ni de récupérer vos données.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr><td style="background:#f2901e;border-radius:6px;">
                <a href="mailto:olivier@exsenco.fr" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">Contacter le support →</a>
              </td></tr>
            </table>
          `
        );
        const ok = await envoyerEmail(d.email, d.email, "[QualioFlex] Il vous reste " + joursRestants + " jours pour récupérer vos données", html);
        if (ok) {
          await admin.from("demandes_suppression_compte").update({ relance_j5_envoyee: true }).eq("id", d.id);
          relancesJ5++;
        }
      }

      if (jours >= 15 && !d.relance_j15_envoyee) {
        const joursRestants = Math.max(0, FENETRE_JOURS - jours);
        const html = emailWrapper(
          `Dernier rappel : ${joursRestants} jours avant suppression définitive`,
          `
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">Bonjour,</p>
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">
              Votre compte QualioFlex est toujours désactivé depuis le ${new Date(d.demandee_le).toLocaleDateString("fr-FR")}.
              Il vous reste <strong>${joursRestants} jours</strong> (jusqu'au <strong>${limite}</strong>) pour nous contacter
              si vous souhaitez récupérer l'accès à votre compte et à vos données.
            </p>
            <p style="color:#555;line-height:1.6;margin:0 0 32px;">
              Passé ce délai, l'accès à votre compte et à vos données ne sera <strong>plus possible</strong>.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr><td style="background:#f2901e;border-radius:6px;">
                <a href="mailto:olivier@exsenco.fr" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">Contacter le support →</a>
              </td></tr>
            </table>
          `
        );
        const ok = await envoyerEmail(d.email, d.email, "[QualioFlex] Dernier rappel : " + joursRestants + " jours avant suppression définitive", html);
        if (ok) {
          await admin.from("demandes_suppression_compte").update({ relance_j15_envoyee: true }).eq("id", d.id);
          relancesJ15++;
        }
      }

      if (jours >= FENETRE_JOURS && !d.notif_olivier_envoyee) {
        const html = emailWrapper(
          "Compte à traiter : suppression définitive en attente",
          `
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">Bonjour Olivier,</p>
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">
              Le délai de 30 jours est écoulé pour le compte <strong>${d.email}</strong>
              (demande du ${new Date(d.demandee_le).toLocaleDateString("fr-FR")}).
            </p>
            <p style="color:#555;line-height:1.6;margin:0 0 32px;">
              Rien n'a été supprimé automatiquement. Rends-toi sur la page d'administration pour décider :
              restaurer l'accès ou valider la suppression définitive.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr><td style="background:#f2901e;border-radius:6px;">
                <a href="https://qualioflex.fr/admin/suppressions" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">Ouvrir la page d'administration →</a>
              </td></tr>
            </table>
          `
        );
        const ok = await envoyerEmail(ADMIN_EMAIL, "Olivier", "[QualioFlex] Compte à traiter : " + d.email, html);
        if (ok) {
          await admin.from("demandes_suppression_compte").update({ notif_olivier_envoyee: true }).eq("id", d.id);
          notifsOlivier++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, examines: (demandes ?? []).length, relancesJ5, relancesJ15, notifsOlivier }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Erreur relance-suppression-compte:", e);
    return new Response(
      JSON.stringify({ error: "Erreur serveur." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
