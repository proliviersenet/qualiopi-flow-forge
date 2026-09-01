import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Flow documentaire Qualiopi (CONTEXT.md, "Flow documentaire Qualiopi complet") :
// le questionnaire de positionnement AVANT est l'étape BLOQUANTE du parcours
// stagiaire (ligne 2 du tableau, colonne "Alerte" = "Formateur + client si manque
// 2j avant début"). Cette fonction vérifie chaque jour les sessions qui démarrent
// dans exactement 2 jours et, pour celles où un ou plusieurs stagiaires n'ont pas
// encore complété ce questionnaire (doc_questionnaire_avant différent de "signe"),
// alerte le formateur ET le client (entreprise) de la session avec la liste
// nominative des stagiaires manquants. Complémentaire du bloc "alerte J+5" de
// relance-documents-auto (qui se déclenche, lui, par délai depuis l'envoi et pas
// par proximité de la date de début de session).
//
// Déclenchée une fois par jour par un cron Postgres (pg_cron + pg_net) ; comme le
// cron ne peut pas fournir de JWT utilisateur, l'accès est protégé par le même
// secret partagé (x-cron-secret / CRON_SECRET) que relance-documents-auto et
// relance-eval-froid-auto.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
    const provided = req.headers.get("x-cron-secret") ?? "";
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
    if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY manquant");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Sessions dont la date de début tombe exactement dans 2 jours (comparaison
    // en date "YYYY-MM-DD", comme le fait déjà relance-eval-froid-auto pour son
    // seuil J+90 côté évaluation à froid). Les sessions annulées n'alertent pas.
    const dansDeuxJours = new Date();
    dansDeuxJours.setDate(dansDeuxJours.getDate() + 2);
    const dateCible = dansDeuxJours.toISOString().slice(0, 10);

    const { data: sessionsData, error: sessErr } = await supabase
      .from("sessions")
      .select(`
        id, date_debut, client_id,
        formations:formation_id ( titre, organismes ( raison_sociale, email_contact ) ),
        clients:client_id ( raison_sociale, contact_nom, contact_email )
      `)
      .eq("date_debut", dateCible)
      .neq("statut", "annulee");

    if (sessErr) throw new Error("Requête sessions : " + sessErr.message);

    const resultats: Record<string, unknown>[] = [];

    for (const session of (sessionsData ?? []) as Record<string, unknown>[]) {
      const sessionId = session.id as string;

      // Stagiaires de cette session n'ayant pas complété le questionnaire de
      // positionnement avant. doc_questionnaire_avant vaut null tant que le
      // stagiaire n'a rien soumis, ou éventuellement "envoye"/"erreur" — seul
      // "signe" (mis par positionnement-public au submit) vaut complétion.
      const { data: manquants, error: stagErr } = await supabase
        .from("stagiaires")
        .select("id, nom, prenom")
        .eq("session_id", sessionId)
        .or("doc_questionnaire_avant.is.null,doc_questionnaire_avant.neq.signe");

      if (stagErr) {
        resultats.push({ session_id: sessionId, statut: "erreur_requete", detail: stagErr.message });
        continue;
      }

      if (!manquants || manquants.length === 0) {
        resultats.push({ session_id: sessionId, statut: "aucun_manquant" });
        continue;
      }

      const formation = session.formations as Record<string, unknown> | null;
      const organisme = formation?.organismes as Record<string, unknown> | null;
      const client = session.clients as Record<string, unknown> | null;
      const titre = (formation?.titre as string) ?? "la formation";

      const destinataires: { email: string; name: string }[] = [];
      const emailFormateur = organisme?.email_contact as string | undefined;
      if (emailFormateur) {
        destinataires.push({ email: emailFormateur, name: (organisme?.raison_sociale as string) ?? "Formateur" });
      }
      const emailClient = client?.contact_email as string | undefined;
      if (emailClient) {
        destinataires.push({ email: emailClient, name: (client?.contact_nom as string) || (client?.raison_sociale as string) || "Client" });
      }

      if (destinataires.length === 0) {
        resultats.push({ session_id: sessionId, statut: "ignore_sans_destinataire" });
        continue;
      }

      const listeStagiaires = (manquants as Record<string, unknown>[])
        .map((s) => `${(s.prenom as string) ?? ""} ${(s.nom as string) ?? ""}`.trim())
        .join(", ");

      const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#c0392b;padding:20px 30px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:18px;">⚠️ QualioFlex — Questionnaire de positionnement manquant</h1>
  </div>
  <div style="background:#fff;border:1px solid #eee;padding:30px;border-radius:0 0 8px 8px;">
    <p>La formation <strong>"${titre}"</strong> débute dans <strong>2 jours</strong>.</p>
    <p>Le questionnaire de positionnement avant formation — étape bloquante du parcours Qualiopi — n'a pas encore été complété par :</p>
    <p style="background:#fff5f5;border-left:3px solid #c0392b;padding:10px 14px;font-weight:bold;">${listeStagiaires}</p>
    <p>Merci de relancer directement le(s) stagiaire(s) concerné(s) avant le début de la formation.</p>
    <p style="font-size:11px;color:#aaa;margin-top:20px;">QualioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin</p>
  </div>
</body></html>`;

      let envoiOk = false;
      const erreurs: string[] = [];
      for (const dest of destinataires) {
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "QualioFlex by ExSenCo", email: "olivier@exsenco.fr" },
            to: [{ email: dest.email, name: dest.name }],
            subject: `[QualioFlex] ⚠️ Questionnaire de positionnement manquant — formation dans 2 jours`,
            htmlContent: html,
          }),
        });
        if (r.ok) {
          envoiOk = true;
        } else {
          erreurs.push(`Email(${r.status}) → ${dest.email}: ${await r.text()}`);
        }
      }

      resultats.push({
        session_id: sessionId,
        statut: envoiOk ? "alerte_envoyee" : "erreur_envoi",
        stagiaires_manquants: (manquants as Record<string, unknown>[]).map((s) => s.id),
        destinataires: destinataires.map((d) => d.email),
        erreurs,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        sessions_concernees: (sessionsData ?? []).length,
        total_actions: resultats.length,
        resultats,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
