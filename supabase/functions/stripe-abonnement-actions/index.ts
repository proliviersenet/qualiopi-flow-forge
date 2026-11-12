import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

// Actions du formateur sur son abonnement (lot 4, 12/11/2026).
// Entrée : { "action": "resilier" | "annuler_resiliation" | "regulariser" }
//
// - resilier : préavis de 30 jours, effet en fin de mois. Exemple : demande le
//   12/11 → J+30 = 12/12 → fin d'abonnement le 31/12 (Stripe : cancel_at au
//   1er janvier 00:00, date d'ancrage de facturation → aucun prorata).
//   Un email confirme la date et propose la récupération des données (10 € HT).
// - annuler_resiliation : le formateur change d'avis avant la date de fin.
// - regulariser : après un impayé (ou une coupure), on applique la carte par
//   défaut du client à l'abonnement et on relance le paiement des factures
//   ouvertes. Appelé au retour du portail Stripe (carte mise à jour) ou par le
//   bouton « Réessayer le paiement ». Le webhook (invoice.paid puis
//   customer.subscription.updated) remet ensuite le compte en « actif ».

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "olivier@exsenco.fr";
const SITE_URL = (Deno.env.get("SITE_URL") || "https://qualioflex.fr").replace(/\/$/, "");
const PREAVIS_JOURS = 30;

const reponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const idDe = (v: unknown): string | null =>
  !v ? null : typeof v === "string" ? v : (v as { id?: string }).id ?? null;

const dateFr = (d: Date) =>
  d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" });

// Date de fin : dernier jour du mois atteint après le préavis. Renvoie aussi
// l'horodatage Stripe (1er du mois suivant, 00:00 UTC = ancrage de facturation).
export function finDeResiliation(maintenant: Date) {
  const preavis = new Date(maintenant.getTime() + PREAVIS_JOURS * 86400_000);
  const premierSuivant = Date.UTC(preavis.getUTCFullYear(), preavis.getUTCMonth() + 1, 1);
  return { cancelAt: Math.floor(premierSuivant / 1000), dernierJour: new Date(premierSuivant - 86400_000) };
}

async function envoyerEmail(to: string, sujet: string, titre: string, corps: string) {
  if (!BREVO_API_KEY || !to) return false;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f8;padding:40px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:#25245e;padding:32px 40px;"><h1 style="margin:0;color:#fff;font-size:24px;">QualioFlex</h1>
<p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">by ExSenCo</p></td></tr>
<tr><td style="padding:40px;"><h2 style="color:#25245e;font-size:20px;margin:0 0 16px;">${titre}</h2>${corps}</td></tr>
<tr><td style="background:#f5f5f8;padding:20px 40px;border-top:1px solid #eee;"><p style="margin:0;color:#999;font-size:12px;">
QualioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin<br>
<a href="https://qualioflex.fr" style="color:#25245e;">qualioflex.fr</a></p></td></tr>
</table></td></tr></table></body></html>`;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: { name: "QualioFlex by ExSenCo", email: BREVO_SENDER_EMAIL }, to: [{ email: to }], subject: sujet, htmlContent: html }),
  });
  if (!r.ok) console.error("stripe-abonnement-actions: erreur Brevo", await r.text());
  return r.ok;
}

async function emailOrganisme(admin: SupabaseClient, organismeId: string) {
  const { data: org } = await admin.from("organismes")
    .select("raison_sociale, email_contact, owner_user_id").eq("id", organismeId).single();
  let email = org?.email_contact as string | null;
  if (!email && org?.owner_user_id) {
    const { data: p } = await admin.from("profiles").select("email").eq("id", org.owner_user_id).maybeSingle();
    email = p?.email ?? null;
  }
  return { email: email ?? "", nom: (org?.raison_sociale as string) ?? "votre organisme" };
}

const p = (t: string) => `<p style="color:#555;line-height:1.6;margin:0 0 16px;">${t}</p>`;
const bouton = (url: string, texte: string) => `<table cellpadding="0" cellspacing="0"><tr><td style="background:#f2901e;border-radius:6px;">
<a href="${url}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">${texte}</a>
</td></tr></table>`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!STRIPE_SECRET_KEY) return reponse({ error: "La gestion de l'abonnement n'est pas encore disponible." }, 503);

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user) return reponse({ error: "Utilisateur non authentifié." }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;
    if (!["resilier", "annuler_resiliation", "regulariser"].includes(action)) {
      return reponse({ error: "Action inconnue." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Seul le titulaire de l'organisme (owner) gère l'abonnement
    const { data: organisme } = await admin.from("organismes")
      .select("id").eq("owner_user_id", user.id).maybeSingle();
    if (!organisme) return reponse({ error: "Seul le responsable de l'organisme peut gérer l'abonnement." }, 403);

    const { data: ab } = await admin.from("abonnements_organismes")
      .select("statut, type_compte, stripe_subscription_id, stripe_customer_id, resiliation_effective_le")
      .eq("organisme_id", organisme.id).maybeSingle();
    if (!ab?.stripe_subscription_id) return reponse({ error: "Aucun abonnement en cours." }, 400);

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

    // ─── Résiliation ───
    if (action === "resilier") {
      if (!["essai", "actif"].includes(ab.statut)) {
        return reponse({ error: ab.statut === "resiliation_programmee"
          ? "Une résiliation est déjà programmée."
          : "Votre abonnement ne peut pas être résilié dans son état actuel. Contactez-nous." }, 400);
      }
      // Horloge de test Stripe (recette) : on calcule le préavis sur sa date
      const sub = await stripe.subscriptions.retrieve(ab.stripe_subscription_id, { expand: ["test_clock"] });
      const horloge = (sub as unknown as { test_clock?: { frozen_time?: number } | null }).test_clock;
      const maintenant = horloge?.frozen_time ? new Date(horloge.frozen_time * 1000) : new Date();
      const { cancelAt, dernierJour } = finDeResiliation(maintenant);

      await stripe.subscriptions.update(ab.stripe_subscription_id, {
        cancel_at: cancelAt,
        proration_behavior: "none",
        metadata: { resiliation_demandee_le: maintenant.toISOString() },
      });
      await admin.from("abonnements_organismes").update({
        statut: "resiliation_programmee",
        resiliation_demandee_le: maintenant.toISOString(),
        resiliation_effective_le: dernierJour.toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      }).eq("organisme_id", organisme.id);

      const { error: dejaEnvoye } = await admin.from("notifications_abonnement").insert({
        organisme_id: organisme.id, type: "resiliation_confirmee",
        reference: `${ab.stripe_subscription_id}:${cancelAt}`, canal: "email",
      });
      if (!dejaEnvoye) {
        const dest = await emailOrganisme(admin, organisme.id);
        const { data: tarif } = await admin.from("tarifs").select("montant_ht_centimes").eq("code", "export_donnees").maybeSingle();
        const prixExport = ((tarif?.montant_ht_centimes ?? 1000) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 0 });
        await envoyerEmail(dest.email, "[QualioFlex] Confirmation de votre résiliation",
          "Votre résiliation est enregistrée",
          p("Bonjour,") +
          p(`Nous avons bien reçu votre demande de résiliation de l'abonnement QualioFlex pour <strong>${dest.nom}</strong>.`) +
          p(`Conformément au préavis de 30 jours, votre abonnement prendra fin le <strong>${dateFr(dernierJour)}</strong>. Vous gardez l'accès complet à QualioFlex jusqu'à cette date.`) +
          p(`Les sessions qui démarrent d'ici là restent facturées selon les conditions habituelles (gratuites si supprimées au moins 48 h avant). Une dernière facture vous sera adressée à la fin de votre abonnement si nécessaire.`) +
          p(`<strong>Récupérez vos données</strong> : vous pouvez télécharger l'ensemble de vos données (formations, sessions, documents, conventions signées, preuves d'audit) pour ${prixExport} € HT, depuis votre espace.`) +
          p("Vous avez changé d'avis ? Vous pouvez annuler la résiliation en un clic jusqu'à la date de fin.") +
          bouton(`${SITE_URL}/factures`, "Gérer mon abonnement →"));
      }
      return reponse({ success: true, fin: dernierJour.toISOString().slice(0, 10) });
    }

    // ─── Annulation de la résiliation ───
    if (action === "annuler_resiliation") {
      if (ab.statut !== "resiliation_programmee") return reponse({ error: "Aucune résiliation programmée." }, 400);
      await stripe.subscriptions.update(ab.stripe_subscription_id, {
        cancel_at: "" as unknown as number, // chaîne vide = suppression de la date de fin (API Stripe)
        metadata: { resiliation_demandee_le: "" },
      });
      const sub = await stripe.subscriptions.retrieve(ab.stripe_subscription_id);
      await admin.from("abonnements_organismes").update({
        statut: sub.status === "trialing" ? "essai" : "actif",
        resiliation_demandee_le: null,
        resiliation_effective_le: null,
        updated_at: new Date().toISOString(),
      }).eq("organisme_id", organisme.id);
      return reponse({ success: true });
    }

    // ─── Régularisation d'un impayé ───
    const customerId = ab.stripe_customer_id;
    if (!customerId) return reponse({ error: "Aucun moyen de paiement enregistré." }, 400);
    const client = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    const carte = idDe(client.invoice_settings?.default_payment_method);
    const sub = await stripe.subscriptions.retrieve(ab.stripe_subscription_id);
    if (carte && idDe(sub.default_payment_method) !== carte) {
      // Le portail Stripe met à jour la carte du client ; on l'applique aussi à
      // l'abonnement (qui avait sa propre carte depuis la souscription).
      await stripe.subscriptions.update(sub.id, { default_payment_method: carte });
    }
    const ouvertes = await stripe.invoices.list({ customer: customerId, status: "open", limit: 10 });
    let payees = 0;
    let echecs = 0;
    for (const f of ouvertes.data) {
      try {
        await stripe.invoices.pay(f.id, carte ? { payment_method: carte } : {});
        payees++;
      } catch (e) {
        echecs++;
        console.warn(`stripe-abonnement-actions: paiement ${f.id} refusé:`, (e as Error).message);
      }
    }
    if (echecs > 0) {
      return reponse({ success: false, payees, echecs,
        error: "Le paiement a encore été refusé. Vérifiez votre carte (ou utilisez-en une autre) depuis « Mettre à jour ma carte »." }, 402);
    }
    return reponse({ success: true, payees });
  } catch (e) {
    console.error("Erreur stripe-abonnement-actions:", e);
    return reponse({ error: "Erreur serveur, merci de réessayer dans un instant." }, 500);
  }
});
