import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Chantier 5 : relance automatique J+2 puis alerte "documents manquants" J+5,
// pour les documents qui nécessitent une action du stagiaire (signature /
// complétion) et qui restent "envoyé" sans passer à "signé" après un délai.
// Déclenchée une fois par jour par un cron Postgres (pg_cron + pg_net), sur le
// même principe que relance-eval-froid-auto : le cron ne pouvant pas fournir de
// JWT utilisateur, l'accès est protégé par un secret partagé (x-cron-secret).
//
// Extension (31/07/2026, audit flow Qualiopi) : ajout de "livret" et
// "questionnaire_avant" — les deux documents les plus importants du flow
// (CONTEXT.md, "Flow documentaire Qualiopi complet") en étaient absents alors
// que le questionnaire de positionnement AVANT est l'étape BLOQUANTE du parcours
// stagiaire. Ce bloc ne gère que la relance/alerte une fois le document marqué
// "envoyé" — l'envoi initial (mise à "envoye" de doc_questionnaire_avant /
// doc_livret) reste à construire dans la future Edge Function
// declencher-flow-session (roadmap), exactement comme pour evaluation_formateur
// avant l'arrivée de relance-eval-formateur-auto.
interface DocType {
  key: string;
  docField: string;
  envoyeLeField: string;
  relanceFlag: string;
  alerteFlag: string;
  tokenField: string;
  path: string;
  label: string;
  // Quand directLink est vrai, le lien de relance pointe directement vers
  // `path` (sans suffixe /token) plutôt que vers une page de consultation
  // par token — utile pour un document sans page publique dédiée. Plus
  // aucun DOC_TYPES ci-dessous ne l'utilise depuis que le livret a sa propre
  // page /livret/:token (chantier "consultation directe livret/attestation",
  // 19/08/2026), mais le mécanisme reste disponible si besoin plus tard.
  directLink?: boolean;
  // Bug signalé par Olivier (16/08/2026) : le livret d'accueil est un PDF à
  // télécharger/consulter, pas un formulaire à remplir — le texte générique
  // "il vous reste à compléter" était donc trompeur pour ce type de document.
  // verbe/participe permettent de personnaliser le message par type ; par
  // défaut (undefined) on garde "compléter"/"complété" pour tous les types
  // qui restent de vrais formulaires (émargement, questionnaires, évaluations).
  verbe?: string;
  participe?: string;
}

const DOC_TYPES: DocType[] = [
  {
    key: "emargement",
    docField: "doc_emargement",
    envoyeLeField: "doc_emargement_envoye_le",
    relanceFlag: "doc_emargement_relance_j2_envoyee",
    alerteFlag: "doc_emargement_alerte_envoyee",
    tokenField: "token_emargement",
    path: "emargement",
    label: "la feuille d'émargement",
  },
  {
    key: "evaluation_chaud",
    docField: "doc_evaluation_chaud",
    envoyeLeField: "doc_evaluation_chaud_envoye_le",
    relanceFlag: "doc_evaluation_chaud_relance_j2_envoyee",
    alerteFlag: "doc_evaluation_chaud_alerte_envoyee",
    tokenField: "token_evaluation_chaud",
    path: "evaluation",
    label: "le questionnaire d'évaluation à chaud",
  },
  {
    key: "evaluation_froid",
    docField: "doc_evaluation_froid",
    envoyeLeField: "doc_evaluation_froid_envoye_le",
    relanceFlag: "doc_evaluation_froid_relance_j2_envoyee",
    alerteFlag: "doc_evaluation_froid_alerte_envoyee",
    tokenField: "token_evaluation_froid",
    path: "evaluation",
    label: "le questionnaire d'évaluation à froid",
  },
  {
    // Module de notation des formateurs (juillet 2026) — l'envoi initial est
    // désormais automatique (relance-eval-formateur-auto), ce bloc ne gère
    // que les relances J+2 / alertes J+5 une fois le premier envoi fait,
    // exactement comme pour chaud/froid.
    key: "evaluation_formateur",
    docField: "doc_evaluation_formateur",
    envoyeLeField: "doc_evaluation_formateur_envoye_le",
    relanceFlag: "doc_evaluation_formateur_relance_j2_envoyee",
    alerteFlag: "doc_evaluation_formateur_alerte_envoyee",
    tokenField: "token_evaluation_formateur",
    path: "evaluation",
    label: "l'évaluation du formateur",
  },
  {
    // Étape 1 du flow Qualiopi (CONTEXT.md) — Envoi PDF/HTML, non bloquant.
    // Page de consultation publique dédiée depuis le chantier "consultation
    // directe livret/attestation" (19/08/2026) : /livret/:token, sur le même
    // principe que les autres documents (plus de directLink vers
    // /espace-client, qui nécessitait un compte que le stagiaire n'a pas).
    key: "livret",
    docField: "doc_livret",
    envoyeLeField: "doc_livret_envoye_le",
    relanceFlag: "doc_livret_relance_j2_envoyee",
    alerteFlag: "doc_livret_alerte_envoyee",
    tokenField: "token_livret",
    path: "livret",
    label: "le livret d'accueil",
    verbe: "télécharger",
    participe: "téléchargé",
  },
  {
    // Étape 2 du flow Qualiopi (CONTEXT.md) — Form QualioFlex, BLOQUANTE (bloque
    // l'accès à l'émargement tant qu'elle n'est pas "signe", voir
    // StagiairesList.tsx). doc_questionnaire_avant et token_questionnaire_avant
    // existaient déjà (utilisés par positionnement-public) ; seules les
    // colonnes de suivi de relance (envoye_le / relance_j2 / alerte) étaient
    // manquantes.
    key: "questionnaire_avant",
    docField: "doc_questionnaire_avant",
    envoyeLeField: "doc_questionnaire_avant_envoye_le",
    relanceFlag: "doc_questionnaire_avant_relance_j2_envoyee",
    alerteFlag: "doc_questionnaire_avant_alerte_envoyee",
    tokenField: "token_questionnaire_avant",
    path: "positionnement",
    label: "le questionnaire de positionnement avant formation",
  },
];

const SEUIL_RELANCE_JOURS = 2;
const SEUIL_ALERTE_JOURS = 5;

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

    const maintenant = new Date();
    const resultats: Record<string, unknown>[] = [];

    for (const dt of DOC_TYPES) {
      const { data: candidats, error: qErr } = await supabase
        .from("stagiaires")
        .select(`
          id, nom, prenom, email_pro, telephone,
          consentement_email, consentement_sms,
          ${dt.docField}, ${dt.envoyeLeField}, ${dt.relanceFlag}, ${dt.alerteFlag}, ${dt.tokenField},
          client_id,
          sessions:session_id (
            formation_id,
            formations:formation_id ( titre, organismes ( raison_sociale, email_contact ) )
          )
        `)
        .eq(dt.docField, "envoye")
        .or(`${dt.relanceFlag}.eq.false,${dt.alerteFlag}.eq.false`);

      if (qErr) {
        resultats.push({ type: dt.key, statut: "erreur_requete", detail: qErr.message });
        continue;
      }

      for (const s of (candidats ?? []) as Record<string, unknown>[]) {
        const envoyeLe = s[dt.envoyeLeField] as string | null;
        if (!envoyeLe) continue;
        const joursEcoules = Math.floor((maintenant.getTime() - new Date(envoyeLe).getTime()) / (1000 * 60 * 60 * 24));

        const session = s.sessions as Record<string, unknown> | null;
        const formation = session?.formations as Record<string, unknown> | null;
        const organisme = formation?.organismes as Record<string, unknown> | null;
        const titre = (formation?.titre as string) ?? "votre formation";
        const prenom = (s.prenom as string) ?? "";
        const nom = (s.nom as string) ?? "";
        const token = s[dt.tokenField] as string | null;
        // Livret : pas de page publique par token → lien direct vers l'espace
        // client (voir commentaire directLink sur DOC_TYPES). Autres types :
        // lien token comme avant.
        const lien = dt.directLink
          ? `https://qualioflex.fr/${dt.path}`
          : (token ? `https://qualioflex.fr/${dt.path}/${token}` : null);
        const verbe = dt.verbe ?? "compléter";
        const participe = dt.participe ?? "complété";

        const hasEmail = s.consentement_email === true && !!s.email_pro;
        const hasSms = s.consentement_sms === true && !!s.telephone;

        // 1) Relance J+2 (une seule fois) si le document reste non signé.
        if (joursEcoules >= SEUIL_RELANCE_JOURS && !s[dt.relanceFlag] && lien) {
          let envoiOk = false;
          if (hasEmail) {
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
    <p>Un petit rappel : il vous reste à ${verbe} <strong>${dt.label}</strong> pour la formation <strong>"${titre}"</strong>.</p>
    <div style="text-align:center;margin:30px 0;">
      <a href="${lien}" style="background:#f2901e;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:bold;">
        Accéder au lien →
      </a>
    </div>
    <p style="font-size:13px;color:#777;">Besoin d'aide ?
      <a href="mailto:olivier@exsenco.fr" style="color:#25245e;font-weight:bold;">olivier@exsenco.fr</a>
    </p>
    <p style="font-size:11px;color:#aaa;margin-top:20px;">QualioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin</p>
  </div>
</body></html>`;
            const r = await fetch("https://api.brevo.com/v3/smtp/email", {
              method: "POST",
              headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({
                sender: { name: "QualioFlex by ExSenCo", email: "olivier@exsenco.fr" },
                to: [{ email: s.email_pro, name: `${prenom} ${nom}` }],
                subject: `[QualioFlex] Rappel — ${dt.label}`,
                htmlContent: html,
              }),
            });
            if (r.ok) envoiOk = true;
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
                content: `QualioFlex : Bonjour ${prenom}, rappel pour ${verbe} ${dt.label} : ${lien}`,
                type: "transactional",
                unicodeEnabled: false,
              }),
            });
            if (r.ok) envoiOk = true;
          }
          if (envoiOk) {
            await supabase.from("stagiaires").update({ [dt.relanceFlag]: true }).eq("id", s.id as string);
            resultats.push({ type: dt.key, stagiaire_id: s.id, statut: "relance_j2_envoyee" });
          }
        }

        // 2) Alerte "documents manquants" J+5 (une seule fois), au formateur ET au client.
        if (joursEcoules >= SEUIL_ALERTE_JOURS && !s[dt.alerteFlag]) {
          const destinataires: { email: string; name: string }[] = [];
          const emailFormateur = organisme?.email_contact as string | undefined;
          if (emailFormateur) destinataires.push({ email: emailFormateur, name: (organisme?.raison_sociale as string) ?? "Formateur" });

          if (s.client_id) {
            const { data: client } = await supabase
              .from("clients")
              .select("contact_email, contact_nom, raison_sociale")
              .eq("id", s.client_id as string)
              .maybeSingle();
            const c = client as Record<string, string> | null;
            if (c?.contact_email) destinataires.push({ email: c.contact_email, name: c.contact_nom || c.raison_sociale || "Client" });
          }

          if (destinataires.length > 0) {
            const htmlAlerte = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#c0392b;padding:20px 30px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:18px;">⚠️ QualioFlex — Document manquant</h1>
  </div>
  <div style="background:#fff;border:1px solid #eee;padding:30px;border-radius:0 0 8px 8px;">
    <p><strong>${prenom} ${nom}</strong> n'a toujours pas ${participe} <strong>${dt.label}</strong> pour la formation <strong>"${titre}"</strong>, ${joursEcoules} jours après l'envoi du lien.</p>
    <p>Merci de relancer directement le stagiaire si besoin.</p>
    <p style="font-size:11px;color:#aaa;margin-top:20px;">QualioFlex by SARL EXSENCO</p>
  </div>
</body></html>`;
            let envoiOk = false;
            for (const dest of destinataires) {
              const r = await fetch("https://api.brevo.com/v3/smtp/email", {
                method: "POST",
                headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
                body: JSON.stringify({
                  sender: { name: "QualioFlex by ExSenCo", email: "olivier@exsenco.fr" },
                  to: [{ email: dest.email, name: dest.name }],
                  subject: `[QualioFlex] ⚠️ Document manquant — ${prenom} ${nom}`,
                  htmlContent: htmlAlerte,
                }),
              });
              if (r.ok) envoiOk = true;
            }
            if (envoiOk) {
              await supabase.from("stagiaires").update({ [dt.alerteFlag]: true }).eq("id", s.id as string);
              resultats.push({ type: dt.key, stagiaire_id: s.id, statut: "alerte_envoyee", destinataires: destinataires.map(d => d.email) });
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
