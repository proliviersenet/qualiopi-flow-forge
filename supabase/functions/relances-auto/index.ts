// ============================================================================
// QUALIFLOW — Edge Function Relances Automatiques
// Fichier : supabase/functions/relances-auto/index.ts
// Deploiement : supabase functions deploy relances-auto
//
// Logique : cette fonction est appelée toutes les heures par un cron Supabase.
// Elle regarde dans la table `relances` toutes les lignes dont :
//   - statut = 'planifiee'
//   - echeance <= maintenant
// Et les traite une par une via Brevo (email) ou Twilio (SMS futur).
//
// Variables d'environnement requises (Supabase Secrets) :
//   BREVO_API_KEY         = xkeysib-...
//   BREVO_SENDER_EMAIL    = o.senet@exsenco.com
//   BREVO_SENDER_NAME     = Olivier Senet — ExSenCo
//   SB_SERVICE_ROLE_KEY   = sb_secret_...
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") ?? "olivier@exsenco.fr";
const BREVO_SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") ?? "Olivier Senet — ExSenCo";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SB_SERVICE_ROLE_KEY")!
);

// ----------------------------------------------------------------------------
// Templates d'emails par type de relance
// Conformes aux exigences Qualiopi (indicateurs cités pour chaque template)
// ----------------------------------------------------------------------------
interface TemplateData {
  sujet: string;
  html: (ctx: RelanceContext) => string;
  indicateur: string;
}

interface RelanceContext {
  prenom: string;
  nom: string;
  formation_titre: string;
  formateur_nom: string;
  date_debut: string;
  date_fin: string;
  lieu: string;
  lien_action?: string; // lien vers formulaire ou document a signer
  organisme_nom: string;
  nda: string;
}

const TEMPLATES: Record<string, TemplateData> = {
  positionnement: {
    sujet: "Votre questionnaire de positionnement — {{formation_titre}}",
    indicateur: "Ind. 8 Qualiopi",
    html: (ctx) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2c2c2a">
        <div style="background:#25245e;padding:20px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-size:18px;font-weight:bold">ExSenCo</span>
          <span style="color:#f2901e;font-size:11px;display:block;margin-top:2px">DÉVELOPPEMENT COMMERCIAL</span>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e8e8e8">
          <p>Bonjour ${ctx.prenom},</p>
          <p>Vous êtes inscrit(e) à la formation <strong>${ctx.formation_titre}</strong> 
             animée par ${ctx.formateur_nom}.</p>
          <p>Afin de préparer au mieux votre parcours et d'adapter le contenu à vos besoins,
             nous vous remercions de compléter ce court questionnaire de positionnement 
             (environ 5 minutes).</p>
          <div style="text-align:center;margin:24px 0">
            <a href="${ctx.lien_action}" 
               style="background:#25245e;color:#fff;padding:12px 28px;border-radius:6px;
                      text-decoration:none;font-weight:bold;display:inline-block">
              Compléter le questionnaire
            </a>
          </div>
          <p style="font-size:12px;color:#818284">
            Formation : ${ctx.formation_titre}<br>
            Date : ${ctx.date_debut}${ctx.date_fin !== ctx.date_debut ? ' au ' + ctx.date_fin : ''}<br>
            Lieu : ${ctx.lieu}
          </p>
        </div>
        <div style="padding:12px 24px;background:#f1efe8;border-radius:0 0 8px 8px;
                    font-size:10px;color:#818284;text-align:center">
          ${ctx.organisme_nom} — Enregistré sous le numéro ${ctx.nda}. 
          Cet enregistrement ne vaut pas agrément de l'État.
        </div>
      </div>`,
  },

  convocation: {
    sujet: "Convocation — {{formation_titre}} du {{date_debut}}",
    indicateur: "Ind. 9 Qualiopi",
    html: (ctx) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2c2c2a">
        <div style="background:#25245e;padding:20px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-size:18px;font-weight:bold">ExSenCo</span>
          <span style="color:#f2901e;font-size:11px;display:block;margin-top:2px">DÉVELOPPEMENT COMMERCIAL</span>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e8e8e8">
          <p>Bonjour ${ctx.prenom},</p>
          <p>Nous avons le plaisir de vous convoquer à la formation :</p>
          <div style="background:#f1efe8;border-left:4px solid #25245e;padding:14px 18px;
                      border-radius:0 6px 6px 0;margin:16px 0">
            <strong style="font-size:15px">${ctx.formation_titre}</strong><br>
            <span style="color:#818284;font-size:13px">
              📅 ${ctx.date_debut}${ctx.date_fin !== ctx.date_debut ? ' au ' + ctx.date_fin : ''}<br>
              📍 ${ctx.lieu}<br>
              👨‍🏫 Formateur : ${ctx.formateur_nom}
            </span>
          </div>
          <p>Le programme détaillé de la formation est joint en pièce jointe à cet email.</p>
          ${ctx.lien_action ? `
          <div style="text-align:center;margin:20px 0">
            <a href="${ctx.lien_action}" 
               style="background:#25245e;color:#fff;padding:12px 28px;border-radius:6px;
                      text-decoration:none;font-weight:bold;display:inline-block">
              Signer ma convention de formation
            </a>
          </div>` : ''}
          <p>Pour toute question : ${BREVO_SENDER_EMAIL}</p>
        </div>
        <div style="padding:12px 24px;background:#f1efe8;border-radius:0 0 8px 8px;
                    font-size:10px;color:#818284;text-align:center">
          ${ctx.organisme_nom} — Enregistré sous le numéro ${ctx.nda}. 
          Cet enregistrement ne vaut pas agrément de l'État.
        </div>
      </div>`,
  },

  convention: {
    sujet: "Convention de formation à signer — {{formation_titre}}",
    indicateur: "Ind. 9 Qualiopi",
    html: (ctx) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2c2c2a">
        <div style="background:#25245e;padding:20px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-size:18px;font-weight:bold">ExSenCo</span>
          <span style="color:#f2901e;font-size:11px;display:block;margin-top:2px">DÉVELOPPEMENT COMMERCIAL</span>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e8e8e8">
          <p>Bonjour ${ctx.prenom},</p>
          <p>Votre convention de formation pour <strong>${ctx.formation_titre}</strong> 
             est prête à être signée électroniquement.</p>
          <div style="text-align:center;margin:24px 0">
            <a href="${ctx.lien_action}" 
               style="background:#f2901e;color:#fff;padding:14px 32px;border-radius:6px;
                      text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">
              ✍️ Signer ma convention
            </a>
          </div>
          <p style="font-size:12px;color:#818284">
            Ce lien est valable 7 jours. Après signature, vous recevrez automatiquement 
            un exemplaire signé par email.
          </p>
        </div>
        <div style="padding:12px 24px;background:#f1efe8;border-radius:0 0 8px 8px;
                    font-size:10px;color:#818284;text-align:center">
          ${ctx.organisme_nom} — Enregistré sous le numéro ${ctx.nda}. 
          Cet enregistrement ne vaut pas agrément de l'État.
        </div>
      </div>`,
  },

  eval_chaud: {
    sujet: "Votre avis sur la formation {{formation_titre}}",
    indicateur: "Ind. 11 Qualiopi",
    html: (ctx) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2c2c2a">
        <div style="background:#25245e;padding:20px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-size:18px;font-weight:bold">ExSenCo</span>
          <span style="color:#f2901e;font-size:11px;display:block;margin-top:2px">DÉVELOPPEMENT COMMERCIAL</span>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e8e8e8">
          <p>Bonjour ${ctx.prenom},</p>
          <p>Merci d'avoir participé à la formation <strong>${ctx.formation_titre}</strong>. 
             Votre avis nous est précieux pour améliorer continuellement nos programmes.</p>
          <p>Ce questionnaire ne prend que <strong>3 minutes</strong>.</p>
          <div style="text-align:center;margin:24px 0">
            <a href="${ctx.lien_action}" 
               style="background:#0F6E56;color:#fff;padding:12px 28px;border-radius:6px;
                      text-decoration:none;font-weight:bold;display:inline-block">
              ⭐ Donner mon avis
            </a>
          </div>
        </div>
        <div style="padding:12px 24px;background:#f1efe8;border-radius:0 0 8px 8px;
                    font-size:10px;color:#818284;text-align:center">
          ${ctx.organisme_nom} — Enregistré sous le numéro ${ctx.nda}. 
          Cet enregistrement ne vaut pas agrément de l'État.
        </div>
      </div>`,
  },

  eval_froid: {
    sujet: "Bilan 6 mois — Formation {{formation_titre}}",
    indicateur: "Ind. 2 Qualiopi",
    html: (ctx) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2c2c2a">
        <div style="background:#25245e;padding:20px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-size:18px;font-weight:bold">ExSenCo</span>
          <span style="color:#f2901e;font-size:11px;display:block;margin-top:2px">DÉVELOPPEMENT COMMERCIAL</span>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e8e8e8">
          <p>Bonjour ${ctx.prenom},</p>
          <p>Il y a 6 mois, vous avez suivi la formation <strong>${ctx.formation_titre}</strong>. 
             Nous aimerions savoir comment vous avez mis en pratique les acquis de cette 
             formation dans votre activité professionnelle.</p>
          <div style="text-align:center;margin:24px 0">
            <a href="${ctx.lien_action}" 
               style="background:#534AB7;color:#fff;padding:12px 28px;border-radius:6px;
                      text-decoration:none;font-weight:bold;display:inline-block">
              📊 Compléter l'évaluation à froid
            </a>
          </div>
          <p style="font-size:12px;color:#818284">5 questions, environ 3 minutes.</p>
        </div>
        <div style="padding:12px 24px;background:#f1efe8;border-radius:0 0 8px 8px;
                    font-size:10px;color:#818284;text-align:center">
          ${ctx.organisme_nom} — Enregistré sous le numéro ${ctx.nda}. 
          Cet enregistrement ne vaut pas agrément de l'État.
        </div>
      </div>`,
  },

  emargement: {
    sujet: "Rappel émargement — {{formation_titre}} aujourd'hui",
    indicateur: "Ind. 11 Qualiopi",
    html: (ctx) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2c2c2a">
        <div style="background:#25245e;padding:20px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-size:18px;font-weight:bold">ExSenCo</span>
          <span style="color:#f2901e;font-size:11px;display:block;margin-top:2px">DÉVELOPPEMENT COMMERCIAL</span>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #e8e8e8">
          <p>Bonjour ${ctx.prenom},</p>
          <p>Votre feuille d'émargement pour la formation <strong>${ctx.formation_titre}</strong> 
             d'aujourd'hui est disponible en ligne.</p>
          <div style="text-align:center;margin:24px 0">
            <a href="${ctx.lien_action}" 
               style="background:#25245e;color:#fff;padding:12px 28px;border-radius:6px;
                      text-decoration:none;font-weight:bold;display:inline-block">
              ✍️ Signer ma feuille d'émargement
            </a>
          </div>
        </div>
        <div style="padding:12px 24px;background:#f1efe8;border-radius:0 0 8px 8px;
                    font-size:10px;color:#818284;text-align:center">
          ${ctx.organisme_nom} — Enregistré sous le numéro ${ctx.nda}. 
          Cet enregistrement ne vaut pas agrément de l'État.
        </div>
      </div>`,
  },
};

// ----------------------------------------------------------------------------
// Envoi d'un email via Brevo
// ----------------------------------------------------------------------------
async function envoyerEmail(params: {
  destinataire_email: string;
  destinataire_nom: string;
  sujet: string;
  html: string;
}): Promise<boolean> {
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: [{ email: params.destinataire_email, name: params.destinataire_nom }],
      subject: params.sujet,
      htmlContent: params.html,
    }),
  });
  return resp.ok;
}

// ----------------------------------------------------------------------------
// Traitement d'une relance individuelle
// ----------------------------------------------------------------------------
async function traiterRelance(relance: Record<string, unknown>): Promise<void> {
  // Récupérer les données de contexte depuis la base
  const { data: participation } = await supabase
    .from("participations")
    .select(`
      id,
      beneficiaires ( nom, email ),
      sessions (
        date_debut, date_fin, lieu,
        formations ( titre, organismes ( nom, nda ) )
      )
    `)
    .eq("id", relance.participation_id)
    .single();

  if (!participation) {
    console.error(`Participation introuvable pour relance ${relance.id}`);
    return;
  }

  const ben = participation.beneficiaires as Record<string, string>;
  const session = participation.sessions as Record<string, unknown>;
  const formation = session.formations as Record<string, unknown>;
  const organisme = formation.organismes as Record<string, string>;

  const prenomNom = (ben.nom ?? "").split(" ");
  const prenom = prenomNom[0] ?? "";
  const nom = prenomNom.slice(1).join(" ") ?? "";

  const ctx: RelanceContext = {
    prenom,
    nom,
    formation_titre: formation.titre as string,
    formateur_nom: BREVO_SENDER_NAME,
    date_debut: new Date(session.date_debut as string).toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    }),
    date_fin: new Date(session.date_fin as string).toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    }),
    lieu: session.lieu as string ?? "À préciser",
    lien_action: `${Deno.env.get("SUPABASE_URL")}/functions/v1/formulaire?participation=${relance.participation_id}&type=${relance.type}`,
    organisme_nom: organisme.nom ?? "ExSenCo",
    nda: organisme.nda ?? "24370470637",
  };

  const template = TEMPLATES[relance.type as string];
  if (!template) {
    console.error(`Template inconnu pour type: ${relance.type}`);
    return;
  }

  const sujet = template.sujet
    .replace("{{formation_titre}}", ctx.formation_titre)
    .replace("{{date_debut}}", ctx.date_debut);

  const succes = await envoyerEmail({
    destinataire_email: ben.email,
    destinataire_nom: ben.nom,
    sujet,
    html: template.html(ctx),
  });

  // Mise a jour du statut dans la base
  await supabase
    .from("relances")
    .update({
      statut: succes ? "envoyee" : "echouee",
      updated_at: new Date().toISOString(),
    })
    .eq("id", relance.id);

  // Log API pour tracabilite Qualiopi
  await supabase.from("api_logs").insert({
    source: "mail",
    endpoint: `relances/${relance.type}`,
    payload: { relance_id: relance.id, destinataire: ben.email },
    status_code: succes ? 200 : 500,
  });
}

// ----------------------------------------------------------------------------
// Point d'entree : traite toutes les relances dues
// ----------------------------------------------------------------------------
serve(async (_req: Request) => {
  try {
    const maintenant = new Date().toISOString();

    const { data: relancesDues, error } = await supabase
      .from("relances")
      .select("*")
      .eq("statut", "planifiee")
      .lte("echeance", maintenant)
      .limit(50); // traitement par lots de 50 pour eviter les timeouts

    if (error) throw new Error(`Erreur lecture relances: ${error.message}`);
    if (!relancesDues?.length) {
      return new Response(
        JSON.stringify({ traitement: 0, message: "Aucune relance due" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let succes = 0;
    let echecs = 0;

    for (const relance of relancesDues) {
      try {
        await traiterRelance(relance);
        succes++;
      } catch (err) {
        echecs++;
        console.error(`Erreur relance ${relance.id}:`, err);
        await supabase
          .from("relances")
          .update({
            statut: "echouee",
            last_error: err instanceof Error ? err.message : "Erreur inconnue",
            updated_at: new Date().toISOString(),
          })
          .eq("id", relance.id);
      }
    }

    return new Response(
      JSON.stringify({ traitement: relancesDues.length, succes, echecs }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erreur relances-auto:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
