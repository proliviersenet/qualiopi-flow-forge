import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Chantier 4 : envoi automatique quotidien de l'évaluation à froid (J+90).
// Cette fonction n'est PAS appelée par le frontend : elle est déclenchée
// une fois par jour par un cron Postgres (pg_cron + pg_net) configuré dans
// la base. Comme le cron ne peut pas fournir de JWT utilisateur, l'accès
// est protégé par un secret partagé transmis dans le header x-cron-secret
// (variable d'environnement CRON_SECRET), en plus de la clé anon standard
// exigée par la passerelle Supabase Edge Functions.
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

    // Stagiaires dont l'évaluation à froid n'a pas encore été envoyée.
    // Le filtre sur la date de fin de session (J+90) est appliqué ensuite
    // côté JS car PostgREST ne permet pas de filtrer facilement sur une
    // colonne d'une table jointe via supabase-js.
    const { data: candidats, error: qErr } = await supabase
      .from("stagiaires")
      .select(`
        id, nom, prenom, email_pro, telephone,
        consentement_email, consentement_sms,
        token_evaluation_froid, doc_evaluation_froid,
        session_id,
        sessions:session_id ( date_fin, formation_id, formations:formation_id ( titre ) )
      `)
      .is("doc_evaluation_froid", null);

    if (qErr) throw new Error("Requête stagiaires : " + qErr.message);

    const seuil = new Date();
    seuil.setDate(seuil.getDate() - 90);
    const seuilStr = seuil.toISOString().slice(0, 10);

    // deno-lint-ignore no-explicit-any
    const aTraiter = (candidats ?? []).filter((s: any) => {
      const dateFin = s.sessions?.date_fin;
      return dateFin && dateFin <= seuilStr;
    });

    const resultats: Record<string, unknown>[] = [];

    // deno-lint-ignore no-explicit-any
    for (const s of aTraiter as any[]) {
      const hasEmail = s.consentement_email === true && !!s.email_pro;
      const hasSms = s.consentement_sms === true && !!s.telephone;

      if (!hasEmail && !hasSms) {
        resultats.push({ stagiaire_id: s.id, statut: "ignore_sans_consentement" });
        continue;
      }

      let token = s.token_evaluation_froid as string | null;
      if (!token) {
        token = crypto.randomUUID();
        const { error: updErr } = await supabase
          .from("stagiaires")
          .update({ token_evaluation_froid: token })
          .eq("id", s.id);
        if (updErr) {
          resultats.push({ stagiaire_id: s.id, statut: "erreur_token", detail: updErr.message });
          continue;
        }
      }

      const lien = `https://qualioflex.fr/evaluation/${token}`;
      const titre = s.sessions?.formations?.titre ?? "votre formation";
      const prenom = s.prenom ?? "";
      const nom = s.nom ?? "";

      const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#25245e;padding:20px 30px;border-radius:8px 8px 0 0;">
    <a href="https://qualioflex.fr" style="text-decoration:none;">
      <h1 style="color:#fff;margin:0;font-size:20px;">QualioFlex</h1>
      <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:12px;">by ExSenCo</p>
    </a>
  </div>
  <div style="background:#fff;border:1px solid #eee;padding:30px;border-radius:0 0 8px 8px;">
    <p>Bonjour <strong>${prenom} ${nom}</strong>,</p>
    <p>Cela fait maintenant 3 mois que vous avez suivi la formation <strong>"${titre}"</strong>.</p>
    <p>👉 Merci de prendre quelques minutes pour compléter votre <strong>évaluation à froid</strong> : votre retour sur la mise en application de la formation nous est précieux.</p>
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

      const txt = `Bonjour ${prenom} ${nom}, cela fait 3 mois que vous avez suivi "${titre}". Merci de compléter votre évaluation à froid : ${lien} — Aide : olivier@exsenco.fr`;

      const envois: Record<string, boolean> = {};
      const erreurs: string[] = [];

      if (hasEmail) {
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: { name: "QualioFlex by ExSenCo", email: "olivier@exsenco.fr" },
            to: [{ email: s.email_pro, name: `${prenom} ${nom}` }],
            subject: `[QualioFlex] Votre évaluation à froid (J+90)`,
            htmlContent: html,
            textContent: txt,
          }),
        });
        envois.email = r.ok;
        if (!r.ok) erreurs.push(`Email(${r.status}): ${await r.text()}`);
      }

      if (hasSms) {
        const cleaned = String(s.telephone).replace(/\s/g, "");
        const phoneIntl = cleaned.startsWith("+33") ? cleaned.slice(1)
          : cleaned.startsWith("33") ? cleaned
          : cleaned.startsWith("0") ? "33" + cleaned.slice(1)
          : "33" + cleaned;
        const r = await fetch("https://api.brevo.com/v3/transactionalSMS/send", {
          method: "POST",
          headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: "QualioFlex",
            recipient: phoneIntl,
            content: `QualioFlex : Bonjour ${prenom}, merci de compléter votre évaluation à froid pour "${titre}". ${lien}`,
            type: "transactional",
            unicodeEnabled: false,
          }),
        });
        envois.sms = r.ok;
        if (!r.ok) erreurs.push(`SMS(${r.status}): ${await r.text()}`);
      }

      if (envois.email || envois.sms) {
        await supabase.from("stagiaires").update({ doc_evaluation_froid: "envoye" }).eq("id", s.id);
      }

      resultats.push({ stagiaire_id: s.id, statut: "traite", envois, erreurs });
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
