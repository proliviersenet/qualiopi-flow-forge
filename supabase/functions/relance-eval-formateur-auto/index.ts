import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Module de notation des formateurs (juillet 2026) — envoi AUTOMATIQUE de
// l'évaluation du formateur à la fin de la formation, pour les STAGIAIRES et
// pour les CLIENTS. Appelée une fois par jour par un cron Postgres (même
// principe que relance-eval-froid-auto / relance-documents-auto), protégée
// par le secret partagé x-cron-secret.
//
//  A) STAGIAIRES — envoi initial de l'évaluation du formateur (le token
//     pouvait déjà être généré manuellement depuis StagiairesList.tsx ;
//     ceci automatise le premier envoi le jour de la fin de session). Les
//     relances J+2 / alertes J+5 sont ensuite prises en charge par
//     relance-documents-auto (type "evaluation_formateur" du tableau
//     DOC_TYPES).
//  B) CLIENTS — envoi initial + relance J+2 + alerte J+5, sur la table
//     dédiée evaluations_formateur_clients (une entreprise cliente n'est
//     pas liée à une seule session comme un stagiaire, d'où la table à
//     part : une ligne par couple session/client).
//
// Fenêtre de sécurité : on ne traite que les sessions dont la date de fin
// est comprise entre J-7 et J, pour éviter un envoi rétroactif massif sur
// tout l'historique lors du premier déploiement.
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

    const resultats: Record<string, unknown>[] = [];
    const aujourdhui = new Date();
    const borneBasse = new Date();
    borneBasse.setDate(borneBasse.getDate() - 7);
    const borneBasseStr = borneBasse.toISOString().slice(0, 10);
    const aujourdhuiStr = aujourdhui.toISOString().slice(0, 10);

    const envoyerEmail = async (email: string, nom: string, sujet: string, html: string) => {
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "QualioFlex by ExSenCo", email: "olivier@exsenco.fr" },
          to: [{ email, name: nom }],
          subject: sujet,
          htmlContent: html,
        }),
      });
      return r.ok;
    };

    const emailEvaluation = (prenom: string, nom: string, titre: string, lien: string) => `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#25245e;padding:20px 30px;border-radius:8px 8px 0 0;">
    <a href="https://qualioflex.fr" style="text-decoration:none;">
      <h1 style="color:#fff;margin:0;font-size:20px;">QualioFlex</h1>
      <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:12px;">by ExSenCo</p>
    </a>
  </div>
  <div style="background:#fff;border:1px solid #eee;padding:30px;border-radius:0 0 8px 8px;">
    <p>Bonjour <strong>${prenom}${nom ? " " + nom : ""}</strong>,</p>
    <p>La formation <strong>"${titre}"</strong> vient de se terminer.</p>
    <p>👉 Merci de prendre quelques minutes pour évaluer le formateur qui vous a accompagné(e) : votre retour compte beaucoup pour nous.</p>
    <div style="text-align:center;margin:30px 0;">
      <a href="${lien}" style="background:#f2901e;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;">
        Évaluer le formateur →
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="font-size:13px;color:#777;">Besoin d'aide ?
      <a href="mailto:olivier@exsenco.fr" style="color:#25245e;font-weight:bold;">olivier@exsenco.fr</a>
    </p>
    <p style="font-size:11px;color:#aaa;margin-top:20px;">QualioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin</p>
  </div>
</body></html>`;

    // -------------------------------------------------------------------
    // A) STAGIAIRES — envoi initial
    // -------------------------------------------------------------------
    const { data: stagiairesCandidats, error: sErr } = await supabase
      .from("stagiaires")
      .select(`
        id, nom, prenom, email_pro, telephone, consentement_email, consentement_sms,
        doc_evaluation_formateur, token_evaluation_formateur, session_id,
        sessions:session_id ( date_fin, formation_id, formations:formation_id ( titre ) )
      `)
      .is("doc_evaluation_formateur", null);

    if (sErr) throw new Error("Requête stagiaires : " + sErr.message);

    // deno-lint-ignore no-explicit-any
    const stagiairesATraiter = (stagiairesCandidats ?? []).filter((s: any) => {
      const dateFin = s.sessions?.date_fin;
      return dateFin && dateFin <= aujourdhuiStr && dateFin >= borneBasseStr;
    });

    // deno-lint-ignore no-explicit-any
    for (const s of stagiairesATraiter as any[]) {
      const hasEmail = s.consentement_email === true && !!s.email_pro;
      if (!hasEmail) {
        resultats.push({ type: "stagiaire", id: s.id, statut: "ignore_sans_consentement" });
        continue;
      }

      const token = (s.token_evaluation_formateur as string | null) ?? crypto.randomUUID();
      const titre = s.sessions?.formations?.titre ?? "votre formation";
      const lien = `https://qualioflex.fr/evaluation/${token}`;
      const ok = await envoyerEmail(
        s.email_pro, `${s.prenom} ${s.nom}`,
        `[QualioFlex] Évaluez votre formateur — ${titre}`,
        emailEvaluation(s.prenom ?? "", s.nom ?? "", titre, lien),
      );

      if (ok) {
        await supabase.from("stagiaires").update({
          token_evaluation_formateur: token,
          doc_evaluation_formateur: "envoye",
          doc_evaluation_formateur_envoye_le: new Date().toISOString(),
        }).eq("id", s.id);
        resultats.push({ type: "stagiaire", id: s.id, statut: "envoye" });
      } else {
        resultats.push({ type: "stagiaire", id: s.id, statut: "erreur_envoi" });
      }
    }

    // -------------------------------------------------------------------
    // B) CLIENTS — envoi initial + relance J+2 + alerte J+5
    // -------------------------------------------------------------------
    const { data: sessionsRecentes, error: sessErr } = await supabase
      .from("sessions")
      .select("id, date_fin, formation_id, formations:formation_id ( titre, organismes ( email_contact, raison_sociale ) )")
      .gte("date_fin", borneBasseStr)
      .lte("date_fin", aujourdhuiStr);

    if (sessErr) throw new Error("Requête sessions : " + sessErr.message);

    for (const sess of (sessionsRecentes ?? []) as Record<string, unknown>[]) {
      const sessionId = sess.id as string;
      const { data: stagiairesSession } = await supabase
        .from("stagiaires")
        .select("client_id")
        .eq("session_id", sessionId)
        .not("client_id", "is", null);

      const clientIds = Array.from(new Set((stagiairesSession ?? []).map((s: Record<string, unknown>) => s.client_id as string)));
      if (clientIds.length === 0) continue;

      const formation = sess.formations as Record<string, unknown> | null;
      const titre = (formation?.titre as string) ?? "la formation";

      for (const clientId of clientIds) {
        const { data: clientData } = await supabase
          .from("clients")
          .select("contact_nom, contact_email, raison_sociale")
          .eq("id", clientId)
          .maybeSingle();
        const c = clientData as Record<string, string> | null;
        if (!c?.contact_email) continue;

        let evalRow: Record<string, unknown> | null = null;
        const { data: existing } = await supabase
          .from("evaluations_formateur_clients")
          .select("*")
          .eq("session_id", sessionId)
          .eq("client_id", clientId)
          .maybeSingle();
        evalRow = existing as Record<string, unknown> | null;

        if (!evalRow) {
          const token = crypto.randomUUID();
          const { data: inserted, error: insErr } = await supabase
            .from("evaluations_formateur_clients")
            .insert({ session_id: sessionId, client_id: clientId, token, statut: "a_envoyer" })
            .select("*")
            .single();
          if (insErr) { resultats.push({ type: "client", client_id: clientId, statut: "erreur_creation" }); continue; }
          evalRow = inserted as Record<string, unknown>;
        }

        const nomContact = c.contact_nom || c.raison_sociale || "Bonjour";
        const lien = `https://qualioflex.fr/evaluation/${evalRow.token}`;

        if (evalRow.statut === "a_envoyer") {
          const ok = await envoyerEmail(
            c.contact_email, nomContact,
            `[QualioFlex] Évaluez le formateur — ${titre}`,
            emailEvaluation(nomContact, "", titre, lien),
          );
          if (ok) {
            await supabase.from("evaluations_formateur_clients")
              .update({ statut: "envoye", envoye_le: new Date().toISOString() })
              .eq("id", evalRow.id as string);
            resultats.push({ type: "client", client_id: clientId, statut: "envoye" });
          }
          continue;
        }

        if (evalRow.statut === "envoye" && evalRow.envoye_le) {
          const jours = Math.floor((aujourdhui.getTime() - new Date(evalRow.envoye_le as string).getTime()) / (1000 * 60 * 60 * 24));
          if (jours >= 5 && !evalRow.alerte_envoyee) {
            const emailFormateur = (formation?.organismes as Record<string, string> | null)?.email_contact;
            if (emailFormateur) {
              await envoyerEmail(emailFormateur, "Formateur",
                `[QualioFlex] ⚠️ Évaluation client non complétée — ${titre}`,
                `<p>${c.raison_sociale} n'a pas encore complété l'évaluation du formateur pour "${titre}", ${jours} jours après l'envoi.</p>`);
              await supabase.from("evaluations_formateur_clients").update({ alerte_envoyee: true }).eq("id", evalRow.id as string);
              resultats.push({ type: "client", client_id: clientId, statut: "alerte_envoyee" });
            }
          } else if (jours >= 2 && !evalRow.relance_envoyee) {
            const ok = await envoyerEmail(c.contact_email, nomContact,
              `[QualioFlex] Rappel — Évaluez le formateur`,
              emailEvaluation(nomContact, "", titre, lien));
            if (ok) {
              await supabase.from("evaluations_formateur_clients").update({ relance_envoyee: true }).eq("id", evalRow.id as string);
              resultats.push({ type: "client", client_id: clientId, statut: "relance_envoyee" });
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, total_actions: resultats.length, resultats }),
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
