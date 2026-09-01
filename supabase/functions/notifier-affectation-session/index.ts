import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Correctif bug audit du 31/07 : quand un formateur affecte une formation + une
// date à un client depuis ClientDetail.tsx (insert direct dans la table
// `sessions`, aucune Edge Function n'était appelée), le client n'était jamais
// prévenu par email — il devait tomber par hasard sur /espace-client pour
// découvrir la session affectée et l'obligation d'y transmettre son fichier
// stagiaires. Cette fonction est appelée juste après la création de la session
// (voir handleAffecterFormation dans ClientDetail.tsx) pour envoyer ce mail
// manquant. Même service (Resend) et même charte graphique que
// envoyer-invitation/index.ts.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { session_id } = await req.json();

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "session_id requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client Supabase avec service role pour bypasser RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Récupérer la session + la formation + le client concernés.
    const { data: sessionData, error: sErr } = await supabase
      .from("sessions")
      .select(
        "id, date_debut, date_fin, lieu, formation:formation_id(titre), client:client_id(raison_sociale, contact_nom, contact_email)"
      )
      .eq("id", session_id)
      .single();

    if (sErr || !sessionData) {
      return new Response(
        JSON.stringify({ error: "Session introuvable : " + (sErr?.message || "") }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const s = sessionData as Record<string, unknown>;
    const formation = (s.formation as Record<string, string>) || {};
    const client = (s.client as Record<string, string>) || {};

    if (!client.contact_email) {
      return new Response(
        JSON.stringify({ error: "Le client n'a pas d'email de contact renseigné" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const titreFormation = formation.titre || "votre formation";
    const nomClient = client.contact_nom || client.raison_sociale || "";

    const formatDate = (d: unknown) => {
      if (!d || typeof d !== "string") return null;
      return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    };
    const dateDebut = formatDate(s.date_debut);
    const dateFin = formatDate(s.date_fin);

    let periodeTexte: string;
    if (dateDebut && dateFin && dateDebut !== dateFin) {
      periodeTexte = `du <strong>${dateDebut}</strong> au <strong>${dateFin}</strong>`;
    } else if (dateDebut) {
      periodeTexte = `le <strong>${dateDebut}</strong>`;
    } else {
      periodeTexte = "à une date à confirmer prochainement";
    }
    const lieuTexte = (s.lieu as string) ? ` (${s.lieu as string})` : "";

    const lienEspaceClient = "https://qualioflex.fr/espace-client";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

    // Envoi de l'email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "QualioFlex <noreply@qualioflex.fr>",
        to: [client.contact_email],
        subject: `Une formation vous a été affectée — ${titreFormation}`,
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
              <h1 style="margin:0;color:#fff;font-size:24px;font-weight:bold;">QualioFlex</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">by ExSenCo</p>
            </a>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="color:#25245e;font-size:20px;margin:0 0 16px;">Une formation vous a été affectée</h2>
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">
              Bonjour${nomClient ? ` ${nomClient}` : ""},
            </p>
            <p style="color:#555;line-height:1.6;margin:0 0 16px;">
              Votre formateur vient de vous affecter la formation <strong>« ${titreFormation} »</strong>, prévue ${periodeTexte}${lieuTexte}.
            </p>
            <p style="color:#555;line-height:1.6;margin:0 0 32px;">
              Rendez-vous dès maintenant dans votre espace client pour consulter les détails de la session et <strong>transmettre la liste de vos stagiaires</strong> : un modèle de fichier Excel à compléter est disponible en téléchargement directement dans votre espace.
            </p>
            <!-- CTA -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#f2901e;border-radius:6px;">
                  <a href="${lienEspaceClient}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">
                    Accéder à mon espace client →
                  </a>
                </td>
              </tr>
            </table>
            <p style="color:#999;font-size:12px;margin:24px 0 0;">
              <strong>📬 Si vous ne voyez pas cet email dans votre boîte principale, vérifiez vos spams ou courriers indésirables.</strong>
            </p>
          </td>
        </tr>
        <!-- Footer -->
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
      throw new Error(`Resend error: ${errBody}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Notification envoyée avec succès" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Erreur notifier-affectation-session:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
