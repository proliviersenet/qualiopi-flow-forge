import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chantier "sous-traitance" (28/08) : bouton "Sous-traiter cette formation" côté
// ClientDetail.tsx. Deux modes :
// - mode "existing" : formateur déjà trouvé via rechercher-formateur → rattachement
//   immédiat (statut 'actif'), email de notification.
// - mode "invite" : email saisi, aucun compte formateur ne correspond → ligne
//   'invite' + email d'invitation à créer un espace formateur (lien /register?st=token).
// Toutes les écritures sur sessions_sous_traitance passent par ici (service role) —
// voir la migration sessions_sous_traitance pour le détail des policies RLS (lecture
// seule côté client, sauf le retrait qui reste une simple update directe).
async function envoyerEmailResend(RESEND_API_KEY: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "QualioFlex <noreply@qualioflex.fr>", to: [to], subject, html }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error("Erreur envoi email Resend:", errBody);
  }
}

const enteteEmail = (titre: string) => `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f8;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#25245e;padding:32px 40px;">
          <h1 style="margin:0;color:#fff;font-size:24px;font-weight:bold;">QualioFlex</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">by ExSenCo</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="color:#25245e;font-size:20px;margin:0 0 16px;">${titre}</h2>`;

const piedEmail = `
        </td></tr>
        <tr><td style="background:#f5f5f8;padding:20px 40px;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:12px;">QualioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin<br>
          <a href="https://qualioflex.fr" style="color:#25245e;">qualioflex.fr</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { session_id, mode, organisme_sous_traitant_id, formateur_profile_id, email } = await req.json();

    if (!session_id || !mode) {
      return new Response(
        JSON.stringify({ error: "session_id et mode requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Utilisateur non authentifié" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (user.user_metadata?.role === "client") {
      return new Response(JSON.stringify({ error: "Réservé aux comptes formateur." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Vérifier que l'appelant possède bien la session (via sa formation).
    const { data: sessionData, error: sErr } = await supabase
      .from("sessions")
      .select("id, date_debut, formation:formation_id(id, titre, organisme_id)")
      .eq("id", session_id)
      .single();
    if (sErr || !sessionData) {
      return new Response(JSON.stringify({ error: "Session introuvable" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const formation = sessionData.formation as unknown as { id: string; titre: string; organisme_id: string } | null;
    if (!formation) {
      return new Response(JSON.stringify({ error: "Formation associée introuvable" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: monProfil } = await supabase.from("profiles").select("organisme_id, nom_complet").eq("id", user.id).maybeSingle();
    if (!monProfil?.organisme_id || monProfil.organisme_id !== formation.organisme_id) {
      return new Response(JSON.stringify({ error: "Vous n'êtes pas le formateur de cette session." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: monOrganisme } = await supabase.from("organismes").select("raison_sociale").eq("id", monProfil.organisme_id).maybeSingle();

    // Une seule sous-traitance vivante par session (index unique côté base — on
    // vérifie ici aussi pour renvoyer un message clair plutôt qu'une erreur SQL brute).
    const { data: existante } = await supabase
      .from("sessions_sous_traitance")
      .select("id, statut")
      .eq("session_id", session_id)
      .in("statut", ["invite", "actif"])
      .maybeSingle();
    if (existante) {
      return new Response(
        JSON.stringify({ error: "Cette session est déjà sous-traitée (ou une invitation est en attente). Retirez d'abord le sous-traitant actuel." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nomDemandeur = monOrganisme?.raison_sociale || monProfil.nom_complet || "Un formateur QualioFlex";

    if (mode === "existing") {
      if (!organisme_sous_traitant_id || !formateur_profile_id) {
        return new Response(JSON.stringify({ error: "Formateur cible manquant" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: inserted, error: insErr } = await supabase
        .from("sessions_sous_traitance")
        .insert({
          session_id,
          organisme_demandeur_id: monProfil.organisme_id,
          organisme_sous_traitant_id,
          profile_sous_traitant_id: formateur_profile_id,
          statut: "actif",
        })
        .select("*")
        .single();
      if (insErr) throw insErr;

      const { data: orgCible } = await supabase.from("organismes").select("email_contact, raison_sociale").eq("id", organisme_sous_traitant_id).maybeSingle();
      if (orgCible?.email_contact) {
        await envoyerEmailResend(
          RESEND_API_KEY,
          orgCible.email_contact,
          `${nomDemandeur} vous confie une session en sous-traitance`,
          enteteEmail("Une session vous a été confiée en sous-traitance") +
          `<p style="color:#555;line-height:1.6;">
            <strong>${nomDemandeur}</strong> vous confie l'animation de la session <strong>${formation.titre}</strong>.
          </p>
          <p style="color:#555;line-height:1.6;">Elle est désormais visible dans votre espace QualioFlex (Tableau de bord → Sessions en sous-traitance).</p>
          <table cellpadding="0" cellspacing="0"><tr><td style="background:#f2901e;border-radius:6px;">
            <a href="https://qualioflex.fr/dashboard" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">Voir mon tableau de bord →</a>
          </td></tr></table>` + piedEmail
        );
      }

      return new Response(JSON.stringify({ success: true, sous_traitance: inserted }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "invite") {
      if (!email || typeof email !== "string") {
        return new Response(JSON.stringify({ error: "Email requis" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: existingUserId } = await supabase.rpc("get_user_id_by_email", { p_email: email });
      if (existingUserId) {
        const { data: orgExistant } = await supabase.from("organismes").select("id, raison_sociale, email_contact").eq("owner_user_id", existingUserId).maybeSingle();
        if (!orgExistant) {
          return new Response(
            JSON.stringify({ error: "Cette adresse est déjà utilisée par un compte QualioFlex non-formateur. Utilisez une autre adresse pour l'inviter comme sous-traitant." }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Compte formateur déjà existant sous cet email → même chemin que "existing".
        const { data: inserted, error: insErr } = await supabase
          .from("sessions_sous_traitance")
          .insert({
            session_id,
            organisme_demandeur_id: monProfil.organisme_id,
            organisme_sous_traitant_id: orgExistant.id,
            profile_sous_traitant_id: existingUserId,
            statut: "actif",
          })
          .select("*")
          .single();
        if (insErr) throw insErr;

        if (orgExistant.email_contact) {
          await envoyerEmailResend(
            RESEND_API_KEY,
            orgExistant.email_contact,
            `${nomDemandeur} vous confie une session en sous-traitance`,
            enteteEmail("Une session vous a été confiée en sous-traitance") +
            `<p style="color:#555;line-height:1.6;"><strong>${nomDemandeur}</strong> vous confie l'animation de la session <strong>${formation.titre}</strong>.</p>
            <p style="color:#555;line-height:1.6;">Elle est désormais visible dans votre espace QualioFlex (Tableau de bord → Sessions en sous-traitance).</p>
            <table cellpadding="0" cellspacing="0"><tr><td style="background:#f2901e;border-radius:6px;">
              <a href="https://qualioflex.fr/dashboard" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">Voir mon tableau de bord →</a>
            </td></tr></table>` + piedEmail
          );
        }
        return new Response(JSON.stringify({ success: true, sous_traitance: inserted, compte_existant: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Aucun compte : invitation à créer un espace formateur.
      const { data: inserted, error: insErr } = await supabase
        .from("sessions_sous_traitance")
        .insert({
          session_id,
          organisme_demandeur_id: monProfil.organisme_id,
          email_invite: email,
          statut: "invite",
        })
        .select("*")
        .single();
      if (insErr) throw insErr;

      const lienInvitation = `https://qualioflex.fr/register?st=${inserted.token}`;
      await envoyerEmailResend(
        RESEND_API_KEY,
        email,
        `${nomDemandeur} vous invite à co-animer une formation sur QualioFlex`,
        enteteEmail("Vous êtes invité(e) à créer votre espace formateur") +
        `<p style="color:#555;line-height:1.6;">
          <strong>${nomDemandeur}</strong> souhaite vous confier l'animation de la session <strong>${formation.titre}</strong> en sous-traitance.
        </p>
        <p style="color:#555;line-height:1.6;">
          Créez votre espace formateur QualioFlex (votre propre organisme, votre propre NDA) en quelques minutes pour y accéder — la session sera automatiquement rattachée à votre compte.
        </p>
        <table cellpadding="0" cellspacing="0"><tr><td style="background:#f2901e;border-radius:6px;">
          <a href="${lienInvitation}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">Créer mon espace formateur →</a>
        </td></tr></table>
        <p style="color:#999;font-size:12px;margin:24px 0 0;">Ce lien est valable 7 jours. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>` + piedEmail
      );

      return new Response(JSON.stringify({ success: true, sous_traitance: inserted, invitation_envoyee: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "mode invalide" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Erreur assigner-soustraitance:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
