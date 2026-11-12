import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

// Webhook Stripe (refonte 12/11/2026, chantier facturation).
// Appelé uniquement par les serveurs Stripe (signature vérifiée), jamais par
// le navigateur — verify_jwt=false obligatoire (même piège que DocuSign).
//
// Traité à ce jour :
//  - checkout.session.completed (mode payment) : paiement de l'export des
//    données → paiement marqué payé, ligne exports créée, génération lancée.
//  - checkout.session.completed (mode setup, motif abonnement) : la carte est
//    enregistrée → création de l'abonnement (lot 2, 12/11/2026) : 7 jours
//    d'essai, prorata jusqu'à la fin du mois, puis facture le 1er du mois.
//  - customer.subscription.created / updated / deleted : statut local de
//    l'abonnement (abonnements_organismes) aligné sur Stripe.
//  - customer.subscription.trial_will_end : email de rappel de fin d'essai.
//  - invoice.created (lot 3) : sessions dues (3 € HT) ajoutées à la facture
//    d'abonnement, une ligne par session.
//  - invoice.finalized / invoice.paid / invoice.payment_failed : copie locale
//    de la facture dans public.factures (liste téléchargeable du formateur).
// Impayés, coupure et réactivation : lot 4.
//
// Idempotent : Stripe peut renvoyer un même événement, rien n'est dupliqué.

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "olivier@exsenco.fr";
const SITE_URL = (Deno.env.get("SITE_URL") || "https://qualioflex.fr").replace(/\/$/, "");
const DUREE_ESSAI_JOURS = 7;

const STATUTS_FACTURE: Record<string, string> = {
  draft: "brouillon", open: "ouverte", paid: "payee", void: "annulee", uncollectible: "impayee",
};

const idDe = (v: unknown): string | null =>
  !v ? null : typeof v === "string" ? v : (v as { id?: string }).id ?? null;

const versIso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

async function organismeDeLaFacture(admin: SupabaseClient, facture: Stripe.Invoice): Promise<string | null> {
  const meta = facture.metadata?.organisme_id;
  if (meta) return meta;
  const customerId = idDe(facture.customer);
  if (!customerId) return null;
  const { data } = await admin.from("organismes").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.id ?? null;
}

async function enregistrerFacture(admin: SupabaseClient, facture: Stripe.Invoice, echec = false) {
  const organismeId = await organismeDeLaFacture(admin, facture);
  if (!organismeId) {
    console.warn(`stripe-webhook: facture ${facture.id} sans organisme QualioFlex, ignorée.`);
    return;
  }
  const total = facture.total ?? 0;
  const ht = facture.total_excluding_tax ?? facture.subtotal ?? total;
  let statut = STATUTS_FACTURE[facture.status ?? "draft"] ?? "ouverte";
  if (echec && statut === "ouverte") statut = "impayee";

  const ligne = {
    organisme_id: organismeId,
    stripe_invoice_id: facture.id,
    numero: facture.number,
    periode_debut: versIso(facture.period_start)?.slice(0, 10) ?? null,
    periode_fin: versIso(facture.period_end)?.slice(0, 10) ?? null,
    montant_ht_centimes: ht,
    montant_tva_centimes: total - ht,
    montant_ttc_centimes: total,
    statut,
    pdf_url: facture.invoice_pdf,
    hosted_url: facture.hosted_invoice_url,
    emise_le: versIso(facture.status_transitions?.finalized_at),
    payee_le: versIso(facture.status_transitions?.paid_at),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from("factures")
    .upsert(ligne, { onConflict: "stripe_invoice_id" }).select("id").single();
  if (error) throw new Error(`Enregistrement facture ${facture.id} : ${error.message}`);

  await admin.from("paiements_stripe").update({ facture_id: data.id }).eq("stripe_invoice_id", facture.id);
  await admin.from("sessions_facturables").update({ facture_id: data.id }).eq("stripe_invoice_id", facture.id);
}

// Lot 3 (12/11/2026) : à la création d'une facture d'abonnement (fin d'essai,
// puis chaque 1er du mois), Stripe la laisse environ une heure en brouillon.
// On y ajoute une ligne par session due (J-48h passé, non annulée à temps).
// Si la facture n'est plus modifiable, les sessions restent « en_attente » et
// partent sur la facture du mois suivant : rien n'est perdu ni facturé deux fois.
async function ajouterSessionsALaFacture(admin: SupabaseClient, stripe: Stripe, facture: Stripe.Invoice) {
  if (facture.status !== "draft") return;
  const f = facture as unknown as { subscription?: unknown; parent?: { subscription_details?: { subscription?: unknown } } };
  const abonnementId = idDe(f.subscription ?? f.parent?.subscription_details?.subscription);
  if (!abonnementId || facture.billing_reason !== "subscription_cycle") return;

  const organismeId = await organismeDeLaFacture(admin, facture);
  const customerId = idDe(facture.customer);
  if (!organismeId || !customerId) return;

  const limite = new Date(facture.created * 1000);
  const { data: lignes, error } = await admin.from("sessions_facturables")
    .select("id, libelle, montant_ht_centimes")
    .eq("organisme_id", organismeId)
    .eq("statut", "en_attente")
    .is("stripe_invoice_item_id", null)
    .lte("facturable_le", limite.toISOString())
    .order("date_debut_session", { ascending: true });
  if (error) throw new Error(`Lecture des sessions à facturer : ${error.message}`);
  if (!lignes?.length) return;

  const { data: tarif } = await admin.from("tarifs").select("stripe_tax_rate_id").eq("code", "session").single();
  const periode = new Date(Date.UTC(limite.getUTCFullYear(), limite.getUTCMonth(), 1)).toISOString().slice(0, 10);

  for (const l of lignes) {
    const ligne = await stripe.invoiceItems.create({
      customer: customerId,
      invoice: facture.id,
      amount: l.montant_ht_centimes,
      currency: "eur",
      description: l.libelle,
      tax_rates: tarif?.stripe_tax_rate_id ? [tarif.stripe_tax_rate_id] : undefined,
      metadata: { session_facturable_id: l.id, organisme_id: organismeId },
    }, { idempotencyKey: `qf-session-${l.id}` });
    const { error: majErr } = await admin.from("sessions_facturables").update({
      statut: "facturee",
      stripe_invoice_item_id: ligne.id,
      stripe_invoice_id: facture.id,
      periode_facturation: periode,
      updated_at: new Date().toISOString(),
    }).eq("id", l.id);
    if (majErr) throw new Error(`Mise à jour session ${l.id} : ${majErr.message}`);
  }
}

function lancerExport(exportId: string) {
  const appel = fetch(`${SUPABASE_URL}/functions/v1/generer-export-donnees`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
    body: JSON.stringify({ export_id: exportId }),
  }).then(async (r) => {
    if (!r.ok) console.error("stripe-webhook: génération export en échec", r.status, await r.text());
  }).catch((e) => console.error("stripe-webhook: appel génération export impossible", e));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(appel);
}

async function paiementExportConfirme(admin: SupabaseClient, session: Stripe.Checkout.Session) {
  const { data: paiement } = await admin.from("paiements_stripe")
    .select("id, organisme_id, email, export_id, statut")
    .eq("stripe_session_id", session.id).maybeSingle();
  if (!paiement) {
    console.error(`stripe-webhook: paiement introuvable pour la session ${session.id}`);
    return;
  }

  const invoiceId = idDe(session.invoice);
  await admin.from("paiements_stripe").update({
    statut: "paye",
    paye_le: new Date().toISOString(),
    ...(invoiceId ? { stripe_invoice_id: invoiceId } : {}),
  }).eq("id", paiement.id);

  // Facture déjà reçue (invoice.paid arrive parfois avant) : on relie
  if (invoiceId) {
    const { data: f } = await admin.from("factures").select("id").eq("stripe_invoice_id", invoiceId).maybeSingle();
    if (f) await admin.from("paiements_stripe").update({ facture_id: f.id }).eq("id", paiement.id);
  }

  let exportId = paiement.export_id as string | null;
  if (!exportId) {
    const organismeId = paiement.organisme_id ?? session.metadata?.organisme_id;
    if (!organismeId) throw new Error(`Paiement ${paiement.id} sans organisme`);
    const { data: exp, error } = await admin.from("exports").upsert({
      organisme_id: organismeId,
      type: "recuperation_donnees",
      statut: "en_attente",
      paiement_id: paiement.id,
      email_destinataire: paiement.email ?? session.customer_details?.email ?? null,
    }, { onConflict: "paiement_id" }).select("id, statut").single();
    if (error) throw new Error(`Création export : ${error.message}`);
    exportId = exp.id;
    await admin.from("paiements_stripe").update({ export_id: exportId }).eq("id", paiement.id);
  }

  const { data: etat } = await admin.from("exports").select("statut").eq("id", exportId).single();
  if (etat && ["en_attente", "erreur"].includes(etat.statut)) lancerExport(exportId!);
}

// ───────────────────────── Abonnement (lot 2) ─────────────────────────

const dateFr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" }) : "—";

async function envoyerEmail(to: string, sujet: string, titre: string, corps: string): Promise<boolean> {
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
  if (!r.ok) console.error("stripe-webhook: erreur Brevo", await r.text());
  return r.ok;
}

async function organismeDuClient(admin: SupabaseClient, customer: unknown, meta?: Stripe.Metadata | null): Promise<string | null> {
  if (meta?.organisme_id) return meta.organisme_id;
  const customerId = idDe(customer);
  if (!customerId) return null;
  const { data } = await admin.from("organismes").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.id ?? null;
}

// Carte enregistrée (Checkout mode setup) → création de l'abonnement
async function creerAbonnement(admin: SupabaseClient, stripe: Stripe, session: Stripe.Checkout.Session) {
  const organismeId = session.metadata?.organisme_id;
  const customerId = idDe(session.customer);
  if (!organismeId || !customerId) throw new Error(`Session ${session.id} sans organisme ou client`);

  const { data: existant } = await admin.from("abonnements_organismes")
    .select("statut, stripe_subscription_id").eq("organisme_id", organismeId).maybeSingle();
  if (existant?.stripe_subscription_id && ["essai", "actif", "impaye", "resiliation_programmee"].includes(existant.statut)) {
    console.log(`stripe-webhook: abonnement déjà en cours pour ${organismeId}, rien à créer.`);
    return;
  }

  const setupIntent = await stripe.setupIntents.retrieve(idDe(session.setup_intent)!);
  const paymentMethod = idDe(setupIntent.payment_method);
  if (!paymentMethod) throw new Error(`Aucun moyen de paiement sur ${session.id}`);
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethod } });

  const { data: tarif } = await admin.from("tarifs")
    .select("montant_ht_centimes, stripe_price_id, stripe_tax_rate_id").eq("code", "abonnement_mensuel").single();

  const finEssai = Math.floor(Date.now() / 1000) + DUREE_ESSAI_JOURS * 86400;
  const d = new Date(finEssai * 1000);
  const ancrage = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000);

  const abonnement = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: tarif.stripe_price_id }],
    default_tax_rates: [tarif.stripe_tax_rate_id],
    default_payment_method: paymentMethod,
    trial_end: finEssai,
    billing_cycle_anchor: ancrage,
    proration_behavior: "create_prorations",
    metadata: { organisme_id: organismeId },
  }, { idempotencyKey: `qf-abonnement-${session.id}` });

  const { error } = await admin.from("abonnements_organismes").upsert({
    organisme_id: organismeId,
    montant_centimes: tarif.montant_ht_centimes,
    periodicite: "mensuel",
    statut: "essai",
    date_debut: new Date().toISOString().slice(0, 10),
    stripe_customer_id: customerId,
    stripe_subscription_id: abonnement.id,
    debut_essai: new Date().toISOString(),
    fin_essai: new Date(finEssai * 1000).toISOString(),
    date_resiliation: null,
    resiliation_demandee_le: null,
    resiliation_effective_le: null,
    impaye_depuis: null,
    coupure_prevue_le: null,
    coupe_le: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organisme_id" });
  if (error) throw new Error(`Enregistrement abonnement : ${error.message}`);
}

function statutLocal(sub: Stripe.Subscription, statutActuel: string | null): string {
  switch (sub.status) {
    case "trialing": return "essai";
    case "active": return sub.cancel_at || sub.cancel_at_period_end ? "resiliation_programmee" : "actif";
    case "past_due":
    case "unpaid":
    case "incomplete":
      // Une coupure décidée par QualioFlex (lot 4) n'est pas écrasée tant que l'impayé dure
      return statutActuel === "coupe" ? "coupe" : "impaye";
    case "paused": return "coupe";
    case "canceled":
    case "incomplete_expired": return "resilie";
    default: return statutActuel ?? "actif";
  }
}

async function synchroniserAbonnement(admin: SupabaseClient, sub: Stripe.Subscription) {
  const organismeId = await organismeDuClient(admin, sub.customer, sub.metadata);
  if (!organismeId) {
    console.warn(`stripe-webhook: abonnement ${sub.id} sans organisme QualioFlex, ignoré.`);
    return;
  }
  const { data: actuel } = await admin.from("abonnements_organismes")
    .select("statut, stripe_subscription_id, impaye_depuis, type_compte").eq("organisme_id", organismeId).maybeSingle();
  // Un événement tardif d'un ancien abonnement ne doit pas écraser le nouveau
  if (actuel?.stripe_subscription_id && actuel.stripe_subscription_id !== sub.id) {
    console.log(`stripe-webhook: événement d'un ancien abonnement (${sub.id}) ignoré.`);
    return;
  }
  const statut = statutLocal(sub, actuel?.statut ?? null);
  const cancelAt = sub.cancel_at ?? (sub.cancel_at_period_end ? (sub as unknown as { current_period_end?: number }).current_period_end : null);
  const { error } = await admin.from("abonnements_organismes").upsert({
    organisme_id: organismeId,
    statut,
    stripe_customer_id: idDe(sub.customer),
    stripe_subscription_id: sub.id,
    fin_essai: versIso(sub.trial_end),
    resiliation_effective_le: cancelAt ? versIso(cancelAt)!.slice(0, 10) : null,
    date_resiliation: statut === "resilie" ? (versIso(sub.ended_at ?? sub.canceled_at) ?? new Date().toISOString()).slice(0, 10) : null,
    impaye_depuis: statut === "impaye" || statut === "coupe" ? (actuel?.impaye_depuis ?? new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organisme_id" });
  if (error) throw new Error(`Synchronisation abonnement ${sub.id} : ${error.message}`);
}

async function rappelFinEssai(admin: SupabaseClient, sub: Stripe.Subscription) {
  const organismeId = await organismeDuClient(admin, sub.customer, sub.metadata);
  if (!organismeId || !sub.trial_end) return;

  // Anti-doublon : une seule notification par abonnement
  const { error: dejaEnvoye } = await admin.from("notifications_abonnement")
    .insert({ organisme_id: organismeId, type: "fin_essai_rappel", reference: sub.id, canal: "email" });
  if (dejaEnvoye) return;

  const { data: org } = await admin.from("organismes")
    .select("raison_sociale, email_contact, owner_user_id").eq("id", organismeId).single();
  let email = org?.email_contact as string | null;
  if (!email && org?.owner_user_id) {
    const { data: p } = await admin.from("profiles").select("email").eq("id", org.owner_user_id).maybeSingle();
    email = p?.email ?? null;
  }
  const { data: tarif } = await admin.from("tarifs").select("montant_ht_centimes").eq("code", "abonnement_mensuel").single();
  const prix = (tarif.montant_ht_centimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 });
  const fin = dateFr(versIso(sub.trial_end));

  await envoyerEmail(email ?? "", "[QualioFlex] Votre essai gratuit se termine bientôt",
    "Votre essai gratuit se termine bientôt",
    `<p style="color:#555;line-height:1.6;margin:0 0 16px;">Bonjour,</p>
<p style="color:#555;line-height:1.6;margin:0 0 16px;">Votre période d'essai gratuite de QualioFlex pour <strong>${org?.raison_sociale ?? "votre organisme"}</strong>
se termine le <strong>${fin}</strong>.</p>
<p style="color:#555;line-height:1.6;margin:0 0 16px;">Vous n'avez rien à faire : votre abonnement démarrera automatiquement à cette date
(${prix} € HT par mois, facturé le 1er du mois, le premier mois au prorata) et vous continuerez à utiliser QualioFlex sans interruption.</p>
<p style="color:#555;line-height:1.6;margin:0 0 24px;">QualioFlex est sans engagement : vous pouvez arrêter à tout moment depuis votre espace.</p>
<table cellpadding="0" cellspacing="0"><tr><td style="background:#f2901e;border-radius:6px;">
<a href="${SITE_URL}/factures" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">Voir mon abonnement →</a>
</td></tr></table>`);

  await admin.from("abonnements_organismes").update({ rappel_fin_essai_envoye_le: new Date().toISOString() }).eq("organisme_id", organismeId);
}

// ───────────────────────── point d'entrée ─────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error("stripe-webhook: secrets STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET manquants.");
    return new Response("Stripe non configuré", { status: 500 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature ?? "", STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("stripe-webhook: signature invalide:", err);
    return new Response("Signature invalide", { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "setup" && session.metadata?.motif === "abonnement") {
          await creerAbonnement(admin, stripe, session);
        } else if (session.metadata?.motif === "recuperation_donnees" && session.payment_status === "paid") {
          await paiementExportConfirme(admin, session);
        } else {
          await admin.from("paiements_stripe")
            .update({ statut: "paye", paye_le: new Date().toISOString() })
            .eq("stripe_session_id", session.id);
        }
        break;
      }
      case "invoice.created":
        await ajouterSessionsALaFacture(admin, stripe, event.data.object as Stripe.Invoice);
        break;
      case "invoice.finalized":
      case "invoice.paid":
        await enregistrerFacture(admin, event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await enregistrerFacture(admin, event.data.object as Stripe.Invoice, true);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await synchroniserAbonnement(admin, event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.trial_will_end":
        await rappelFinEssai(admin, event.data.object as Stripe.Subscription);
        break;
      default:
        // Carte expirée, impayés, coupure : lot 4.
        break;
    }
  } catch (e) {
    // On renvoie 500 pour que Stripe réessaie plus tard (traitement idempotent).
    console.error(`stripe-webhook: erreur traitement ${event.type} (${event.id}):`, e);
    return new Response("Erreur de traitement", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
