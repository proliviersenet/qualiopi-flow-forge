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
    const { email, password, nom, organisme_id, siret, siren, adresse, token } = await req.json();

    if (!email || !password || !organisme_id || !token) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Vérifier token invitation
    const { data: invitation, error: invitError } = await supabase
      .from("invitations_clients")
      .select("*")
      .eq("token", token)
      .eq("statut", "en_attente")
      .gte("expires_at", new Date().toISOString())
      .single();

    if (invitError || !invitation) {
      return new Response(
        JSON.stringify({ error: "Lien d'invitation invalide ou expiré" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Chercher si un compte existe avec cet email
    const { data: existingId } = await supabase.rpc("get_user_id_by_email", { p_email: email });
    console.log("Compte existant trouvé:", existingId);

    let userId: string;

    if (existingId) {
      // Mettre à jour le compte existant au lieu de le recréer
      console.log("Mise à jour du compte existant:", existingId);
      const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
        existingId,
        {
          password,
          email_confirm: true,
          user_metadata: { nom_complet: nom, role: "client" },
          ban_duration: "none", // débloquer si banni
        }
      );
      if (updateError) throw new Error(updateError.message);
      userId = existingId;
    } else {
      // Créer un nouveau compte
      console.log("Création nouveau compte pour:", email);
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nom_complet: nom, role: "client" },
      });
      if (authError || !authData.user) throw new Error(authError?.message || "Erreur création compte");
      userId = authData.user.id;
    }

    // 3. Créer le client en base
    const { data: newClient, error: clientError } = await supabase
      .from("clients")
      .insert({
        organisme_id,
        siret: siret || null,
        siren: siren || null,
        raison_sociale: nom,
        adresse: adresse || null,
        contact_email: email,
      })
      .select("id")
      .single();

    if (clientError) {
      console.error("Erreur insert client:", JSON.stringify(clientError));
      throw new Error(`Erreur création client: ${clientError.message}`);
    }

    console.log("Client créé avec succès pour:", email);

    // 3bis. Correctif bug audit du 31/07 : prévenir le formateur par email que
    // son client vient de finaliser la création de son compte — jusqu'ici
    // aucun email n'était envoyé à cette étape. Pour retrouver "le formateur
    // de l'organisme", on utilise organismes.email_contact : c'est le pattern
    // déjà en place dans tout le projet (relance-documents-auto,
    // relance-eval-formateur-auto, generer-convention, generer-devis...) pour
    // ce même besoin. On évite volontairement de passer par profiles/role : la
    // colonne role n'est pas fiable pour les comptes formateurs (voir le
    // commit "Correction policy RLS veille_qualiopi_log", role absent du
    // user_metadata des formateurs). Toute cette étape est non bloquante :
    // un échec d'envoi ne doit jamais faire échouer la création du compte.
    try {
      const { data: organisme } = await supabase
        .from("organismes")
        .select("raison_sociale, email_contact")
        .eq("id", organisme_id)
        .maybeSingle();

      const emailFormateur = organisme?.email_contact as string | undefined;

      if (emailFormateur) {
        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
        const lienFicheClient = `https://qualioflex.fr/clients/${newClient?.id}`;

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "QalioFlex <noreply@qualioflex.fr>",
            to: [emailFormateur],
            subject: `${nom} a créé son compte client sur QalioFlex`,
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
            <a href="https://qualioflex.fr" style="text-decoration:none;">
              <h1 style="margin:0;color:#fff;font-size:24px;font-weight:bold;">QalioFlex</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">by ExSenCo</p>
            </a>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="color:#25245e;font-size:20px;margin:0 0 16px;">Votre client a créé son espace</h2>
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">
              Bonne nouvelle : <strong>${nom}</strong>${email ? ` (${email})` : ""} vient de finaliser la création de son compte sur <strong>QalioFlex</strong> suite à votre invitation.
            </p>
            <p style="color:#555;line-height:1.6;margin:0 0 32px;">
              Vous pouvez dès maintenant consulter sa fiche, lui affecter une formation et suivre l'avancement de son dossier.
            </p>
            <!-- CTA -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#f2901e;border-radius:6px;">
                  <a href="${lienFicheClient}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">
                    Voir la fiche client →
                  </a>
                </td>
              </tr>
            </table>
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
          console.error("Erreur envoi email formateur:", await emailRes.text());
        }
      } else {
        console.warn("Aucun email_contact trouvé pour l'organisme", organisme_id, "— email formateur non envoyé.");
      }
    } catch (notifErr) {
      // On ne bloque jamais la création du compte client si la notification échoue.
      console.error("Erreur notification formateur (non bloquante):", notifErr);
    }

    // 4. Marquer invitation utilisée
    await supabase
      .from("invitations_clients")
      .update({ statut: "utilisee" })
      .eq("token", token);

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Erreur creer-compte-client:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
