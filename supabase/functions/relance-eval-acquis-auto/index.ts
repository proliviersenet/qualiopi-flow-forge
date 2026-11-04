import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
 
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
 
const SITE_URL = (Deno.env.get("SITE_URL") || "https://qualioflex.fr").replace(/\/$/, "");
 
// Nouvelle fonction du 04/11/2026 (demande Olivier — "tout ce qui peut être
// automatisé doit l'être"). Voir relance-eval-chaud-auto pour le contexte
// complet : cette fonction fait la même chose pour l'évaluation des acquis
// (indicateur 33 du référentiel V10, QCM noté automatiquement côté serveur
// par evaluation-public — voir son commentaire sur QcmQuestion). On envoie
// le lien automatiquement à la fin de la session, sur le même principe que
// relance-eval-froid-auto / relance-eval-formateur-auto / relance-eval-chaud-auto :
// cron Postgres quotidien (pg_cron + pg_net), protégé par le secret partagé
// x-cron-secret, déployée en verify_jwt: false.
//
// Fenêtre de sécurité J-7 → J, et vérification préalable que les questions
// "acquis" sont configurées dans evaluation_questions pour cette formation —
// mêmes raisons que pour relance-eval-chaud-auto / relance-eval-froid-auto
// (éviter d'envoyer un lien vers un questionnaire vide).
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
    <p>👉 Merci de compléter le questionnaire d'évaluation des acquis : quelques questions pour vérifier les compétences acquises durant la formation. Vous verrez votre score tout de suite après l'avoir envoyé.</p>
    <div style="text-align:center;margin:30px 0;">
      <a href="${lien}" style="background:#f2901e;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;">
        Accéder au questionnaire →
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="font-size:13px;color:#777;">Besoin d'aide ?
      <a href="mailto:olivier@exsenco.fr" style="color:#25245e;font-weight:bold;">olivier@exsenco.fr</a>
    </p>
    <p style="font-size:11px;color:#aaa;margin-top:20px;">QualioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin</p>
  </div>
</body></html>`;
 
    const { data: candidats, error: sErr } = await supabase
      .from("stagiaires")
      .select(`
        id, nom, prenom, email_pro, telephone, consentement_email, consentement_sms,
        doc_evaluation_acquis, token_evaluation_acquis, session_id,
        sessions:session_id ( date_fin, formation_id, formations:formation_id ( titre ) )
      `)
      .is("doc_evaluation_acquis", null);
 
    if (sErr) throw new Error("Requête stagiaires : " + sErr.message);
 
    // deno-lint-ignore no-explicit-any
    const aTraiter = (candidats ?? []).filter((s: any) => {
      const dateFin = s.sessions?.date_fin;
      return dateFin && dateFin <= aujourdhuiStr && dateFin >= borneBasseStr;
    });
 
    // deno-lint-ignore no-explicit-any
    for (const s of aTraiter as any[]) {
      const hasEmail = s.consentement_email === true && !!s.email_pro;
      if (!hasEmail) {
        resultats.push({ stagiaire_id: s.id, statut: "ignore_sans_consentement" });
        continue;
      }
 
      const formationId = s.sessions?.formation_id as string | undefined;
      if (formationId) {
        const { data: questionsRow } = await supabase
          .from("evaluation_questions")
          .select("questions")
          .eq("formation_id", formationId)
          .eq("type", "acquis")
          .maybeSingle();
        const nbQuestions = Array.isArray(questionsRow?.questions) ? questionsRow.questions.length : 0;
        if (nbQuestions === 0) {
          resultats.push({
            stagiaire_id: s.id,
            statut: "ignore_questions_acquis_non_configurees",
            formation_id: formationId,
            formation_titre: s.sessions?.formations?.titre ?? null,
          });
          continue;
        }
      }
 
      const token = (s.token_evaluation_acquis as string | null) ?? crypto.randomUUID();
      const titre = s.sessions?.formations?.titre ?? "votre formation";
      const lien = `${SITE_URL}/evaluation/${token}`;
      const ok = await envoyerEmail(
        s.email_pro, `${s.prenom} ${s.nom}`,
        `[QualioFlex] Évaluation des acquis — ${titre}`,
        emailEvaluation(s.prenom ?? "", s.nom ?? "", titre, lien),
      );
 
      if (ok) {
        await supabase.from("stagiaires").update({
          token_evaluation_acquis: token,
          doc_evaluation_acquis: "envoye",
          doc_evaluation_acquis_envoye_le: new Date().toISOString(),
        }).eq("id", s.id);
        resultats.push({ stagiaire_id: s.id, statut: "envoye" });
      } else {
        resultats.push({ stagiaire_id: s.id, statut: "erreur_envoi" });
      }
    }
 
    return new Response(
      JSON.stringify({ success: true, total_candidats: aTraiter.length, resultats }),
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
 
