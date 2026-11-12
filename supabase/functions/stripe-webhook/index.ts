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
//  - lot 4 (12/11/2026) :
//    · invoice.payment_failed → passage en impayé, coupure programmée à J+10,
//      email d'alerte (les relances J-2 et la coupure sont faites par la
//      fonction planifiée facturation-quotidienne) ;
//    · retour à « active » après un impayé → réactivation (email si coupé) ;
//    · fin d'abonnement (résiliation effective) → facture finale des sessions
//      dues non encore facturées + email de fin avec proposition d'export.
//  - lot 5 (12/11/2026), parrainage :
//    · création de l'abonnement avec un code → parrainage « en_attente » ;
//    · première facture payante du filleul réglée → parrainage confirmé,
//      1 mois offert au parrain et 1 au filleul (registre mois_offerts) ;
//    · facture du 1er du mois (mois complet) avec un mois offert disponible →
//      ligne négative du montant de l'abonnement, mois marqué consommé.
//  - lot 6 (12/11/2026) : quota de 5 filleuls par an et par parrain ; badges
//    Membre Argent (3 filleuls confirmés : +1 mois offert) et Membre Or
//    (5 filleuls : sessions offertes pendant 1 an, marquées « offerte »).
//    Un Membre Or ne peut plus parrainer tant que ses sessions sont offertes.
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
const DELAI_COUPURE_JOURS = 10;

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
  const { data: toutes, error } = await admin.from("sessions_facturables")
    .select("id, libelle, montant_ht_centimes, facturable_le")
    .eq("organisme_id", organismeId)
    .eq("statut", "en_attente")
    .is("stripe_invoice_item_id", null)
    .lte("facturable_le", limite.toISOString())
    .order("date_debut_session", { ascending: true });
  if (error) throw new Error(`Lecture des sessions à facturer : ${error.message}`);
  if (!toutes?.length) return;

  const periode = new Date(Date.UTC(limite.getUTCFullYear(), limite.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const lignes = await retirerSessionsOffertes(admin, organismeId, toutes, periode);
  if (!lignes.length) return;
  const { data: tarif } = await admin.from("tarifs").select("stripe_tax_rate_id").eq("code", "session").single();

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

// Badge Or (lot 6) : les sessions devenues dues pendant l'année offerte ne sont
// pas facturées (statut « offerte »). Renvoie les sessions restant à facturer.
async function retirerSessionsOffertes<T extends { id: string; facturable_le: string }>(
  admin: SupabaseClient, organismeId: string, lignes: T[], periode: string,
): Promise<T[]> {
  const { data: badge } = await admin.from("badges_parrainage")
    .select("obtenu_le, sessions_offertes_jusqu_au").eq("organisme_id", organismeId).eq("niveau", "or").maybeSingle();
  if (!badge?.sessions_offertes_jusqu_au) return lignes;
  const debut = new Date(badge.obtenu_le);
  const fin = new Date(badge.sessions_offertes_jusqu_au);
  const offertes = lignes.filter((l) => { const d = new Date(l.facturable_le); return d >= debut && d < fin; });
  if (offertes.length) {
    await admin.from("sessions_facturables").update({
      statut: "offerte", periode_facturation: periode, updated_at: new Date().toISOString(),
    }).in("id", offertes.map((l) => l.id));
  }
  return lignes.filter((l) => !offertes.includes(l));
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

// Emails « festifs » du parrainage (12/11/2026, demande Olivier) : bandeau
// coloré, confettis, grand emoji, ton enjoué. Thèmes : fete (orange QualioFlex),
// argent, or.
const THEMES_FESTIFS: Record<string, { fond: string; texte: string; accent: string }> = {
  fete: { fond: "linear-gradient(135deg,#f2901e 0%,#ffb347 50%,#25245e 100%)", texte: "#ffffff", accent: "#f2901e" },
  argent: { fond: "linear-gradient(135deg,#8e9eab 0%,#eef2f3 50%,#8e9eab 100%)", texte: "#25245e", accent: "#6b7b8c" },
  or: { fond: "linear-gradient(135deg,#b8860b 0%,#ffd700 45%,#fff3b0 60%,#d4a017 100%)", texte: "#3d2b00", accent: "#b8860b" },
};

async function envoyerEmailFestif(to: string, sujet: string, emoji: string, titre: string, corps: string, theme: "fete" | "argent" | "or" = "fete"): Promise<boolean> {
  if (!BREVO_API_KEY || !to) return false;
  const t = THEMES_FESTIFS[theme];
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#fff8ef;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ef;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(37,36,94,0.12);">
<tr><td style="background:#25245e;background-image:${t.fond};padding:28px 40px 32px;text-align:center;">
<p style="margin:0;font-size:22px;letter-spacing:6px;">🎉 ✨ 🎊 ✨ 🎉</p>
<p style="margin:12px 0 4px;font-size:72px;line-height:1;">${emoji}</p>
<h1 style="margin:8px 0 0;color:${t.texte};font-size:26px;line-height:1.3;">${titre}</h1>
<p style="margin:10px 0 0;color:${t.texte};font-size:13px;opacity:0.85;">QualioFlex by ExSenCo</p>
</td></tr>
<tr><td style="padding:36px 40px 28px;font-size:15px;">${corps}</td></tr>
<tr><td style="padding:0 40px 28px;text-align:center;"><p style="margin:0;font-size:20px;letter-spacing:8px;">🎈 🥳 🎈</p></td></tr>
<tr><td style="background:#f5f5f8;padding:18px 40px;border-top:1px solid #eee;"><p style="margin:0;color:#999;font-size:12px;">
QualioFlex by SARL EXSENCO · 80 rue du Nouveau Bois, 37550 Saint-Avertin<br>
<a href="https://qualioflex.fr" style="color:#25245e;">qualioflex.fr</a></p></td></tr>
</table></td></tr></table></body></html>`;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: { name: "QualioFlex by ExSenCo", email: BREVO_SENDER_EMAIL }, to: [{ email: to }], subject: sujet, htmlContent: html }),
  });
  if (!r.ok) console.error("email festif: erreur Brevo", await r.text());
  return r.ok;
}

// Encadré « récompense » pour les emails festifs
const cadeau = (texte: string, couleur = "#f2901e") =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="background:#fff8ef;border:2px dashed ${couleur};border-radius:12px;padding:18px 20px;text-align:center;color:#25245e;font-size:16px;line-height:1.5;">${texte}</td></tr></table>`;

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

  if (session.metadata?.code_parrainage) await enregistrerParrainage(admin, organismeId, session.metadata.code_parrainage);
}

// ───────────────────────── Parrainage (lot 5) ─────────────────────────

async function enregistrerParrainage(admin: SupabaseClient, filleulId: string, code: string) {
  const { data: c } = await admin.from("codes_parrainage").select("id, organisme_id, actif").eq("code", code).maybeSingle();
  if (!c?.actif || c.organisme_id === filleulId) return;
  // Quota annuel et pause « Membre Or » du parrain (vérifiés aussi au démarrage de l'essai)
  const [{ data: dejaCetteAnnee }, { data: max }, { data: enPause }] = await Promise.all([
    admin.rpc("fn_parrainages_annee", { p_parrain: c.organisme_id }),
    admin.rpc("fn_regle_parrainage", { p_cle: "max_filleuls_par_an" }),
    admin.rpc("fn_parrainage_en_pause_jusqu_au", { p_organisme_id: c.organisme_id }),
  ]);
  if (enPause || (dejaCetteAnnee ?? 0) >= (max ?? 5)) {
    console.log(`stripe-webhook: parrain ${c.organisme_id} en pause ou quota atteint, parrainage non enregistré.`);
    return;
  }
  const { error } = await admin.from("parrainages").insert({
    code_id: c.id, parrain_organisme_id: c.organisme_id, filleul_organisme_id: filleulId, statut: "en_attente",
  });
  if (error && !error.message.includes("duplicate")) console.error("stripe-webhook: parrainage non enregistré:", error.message);
}

// Première facture payante du filleul réglée → 1 mois offert de chaque côté
async function confirmerParrainage(admin: SupabaseClient, facture: Stripe.Invoice) {
  if ((facture.amount_paid ?? 0) <= 0 || facture.billing_reason !== "subscription_cycle") return;
  const filleulId = await organismeDeLaFacture(admin, facture);
  if (!filleulId) return;
  const { data: pa } = await admin.from("parrainages")
    .update({ statut: "confirme", confirme_le: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("filleul_organisme_id", filleulId).eq("statut", "en_attente")
    .select("id, parrain_organisme_id").maybeSingle();
  if (!pa) return; // pas de parrainage, ou déjà confirmé (événement rejoué)

  const { error } = await admin.from("mois_offerts").insert([
    { organisme_id: pa.parrain_organisme_id, motif: "parrainage_parrain", parrainage_id: pa.id },
    { organisme_id: filleulId, motif: "parrainage_filleul", parrainage_id: pa.id },
  ]);
  if (error) throw new Error(`Mois offerts du parrainage ${pa.id} : ${error.message}`);

  const parrain = await emailOrganisme(admin, pa.parrain_organisme_id);
  const filleul = await emailOrganisme(admin, filleulId);
  if (await premiereFois(admin, pa.parrain_organisme_id, "parrainage_confirme", pa.id)) {
    await envoyerEmailFestif(parrain.email, "🎉 Bingo ! Votre filleul vous offre 1 mois QualioFlex",
      "🎁", "Bingo, un mois offert pour vous !",
      para("Bonjour,") +
      para(`Excellente nouvelle : <strong>${filleul.nom}</strong> vient de rejoindre QualioFlex grâce à vous. Merci de faire grandir la tribu des formateurs sereins face à Qualiopi ! 🙌`) +
      cadeau("🎁 <strong>1 mois d'abonnement OFFERT</strong><br><span style=\"font-size:13px;color:#666;\">déduit automatiquement de votre prochaine facture</span>") +
      para("Et ce n'est qu'un début : chaque nouveau filleul vous rapporte un mois de plus, et les badges 🥈 Argent et 🥇 Or vous attendent au bout du chemin !") +
      bouton(`${SITE_URL}/dashboard`, "Voir ma progression 🚀"));
  }
  if (await premiereFois(admin, filleulId, "bienvenue_filleul", pa.id)) {
    await envoyerEmailFestif(filleul.email, "🎁 Cadeau de bienvenue : 1 mois QualioFlex offert !",
      "🥳", "Bienvenue dans la famille QualioFlex !",
      para("Bonjour,") +
      para(`Ravis de vous compter parmi nos abonnés ! Et comme vous êtes arrivé grâce à <strong>${parrain.nom}</strong>, on fête ça dignement :`) +
      cadeau("🎁 <strong>Votre prochain mois d'abonnement est OFFERT</strong><br><span style=\"font-size:13px;color:#666;\">déduit automatiquement de votre prochaine facture</span>") +
      para("À votre tour de jouer : recommandez QualioFlex à vos confrères formateurs, et c'est <strong>un mois offert pour chacun de vous deux</strong> à chaque fois. 😉") +
      bouton(`${SITE_URL}/dashboard`, "Récupérer mon lien de parrainage 🔗"));
  }

  await attribuerBadges(admin, pa.parrain_organisme_id);
}

// Lot 6 : badges Membre Argent (+1 mois offert) et Membre Or (sessions offertes 1 an)
async function attribuerBadges(admin: SupabaseClient, parrainId: string) {
  const { count } = await admin.from("parrainages").select("id", { count: "exact", head: true })
    .eq("parrain_organisme_id", parrainId).eq("statut", "confirme");
  const confirmes = count ?? 0;
  const regle = async (cle: string, defaut: number) =>
    ((await admin.rpc("fn_regle_parrainage", { p_cle: cle })).data as number | null) ?? defaut;
  const [seuilArgent, seuilOr, dureeMois] = await Promise.all([
    regle("seuil_argent", 3), regle("seuil_or", 5), regle("duree_sessions_offertes_mois", 12),
  ]);
  const parrain = await emailOrganisme(admin, parrainId);

  if (confirmes >= seuilArgent) {
    const { data: badge } = await admin.from("badges_parrainage")
      .insert({ organisme_id: parrainId, niveau: "argent", filleuls_confirmes: confirmes })
      .select("id").maybeSingle(); // null si déjà obtenu (contrainte unique)
    if (badge) {
      await admin.from("mois_offerts").insert({ organisme_id: parrainId, motif: "bonus_badge_argent", commentaire: `Badge Membre Argent (${confirmes} filleuls)` });
      if (await premiereFois(admin, parrainId, "badge_argent", badge.id)) {
        await envoyerEmailFestif(parrain.email, "🥈 Champagne ! Vous êtes Membre Argent QualioFlex",
          "🥈", "Vous êtes Membre Argent !",
          para("Bonjour,") +
          para(`${confirmes} filleuls ! <strong>${parrain.nom}</strong> décroche officiellement le badge <strong>Membre Argent</strong> de QualioFlex. Toute l'équipe vous applaudit 👏👏👏`) +
          cadeau("🎁 <strong>BONUS : 1 mois d'abonnement OFFERT</strong><br><span style=\"font-size:13px;color:#666;\">en plus des mois déjà gagnés pour chaque filleul</span>", "#8e9eab") +
          para(`Et maintenant, cap sur l'Or 🥇 : plus que <strong>${Math.max(seuilOr - confirmes, 1)} filleul${seuilOr - confirmes > 1 ? "s" : ""}</strong> et <strong>toutes vos sessions sont offertes pendant un an</strong>. Vous y êtes presque !`) +
          bouton(`${SITE_URL}/dashboard`, "Admirer mon badge 🥈"), "argent");
      }
    }
  }

  if (confirmes >= seuilOr) {
    const fin = new Date();
    fin.setMonth(fin.getMonth() + dureeMois);
    const { data: badge } = await admin.from("badges_parrainage")
      .insert({ organisme_id: parrainId, niveau: "or", filleuls_confirmes: confirmes, sessions_offertes_jusqu_au: fin.toISOString() })
      .select("id").maybeSingle();
    if (badge && await premiereFois(admin, parrainId, "badge_or", badge.id)) {
      await envoyerEmailFestif(parrain.email, "🥇 Roulements de tambour… Vous êtes Membre OR !",
        "🏆", "Vous êtes Membre OR !",
        para("Bonjour,") +
        para(`🥁 Roulements de tambour… Avec <strong>${confirmes} filleuls</strong>, <strong>${parrain.nom}</strong> atteint le sommet : le badge <strong>Membre Or</strong>, la distinction suprême du parrainage QualioFlex. Chapeau bas ! 🎩`) +
        cadeau(`🎁 <strong>TOUTES VOS SESSIONS OFFERTES</strong><br>sans limite, jusqu'au <strong>${dateFr(fin.toISOString())}</strong><br><span style=\"font-size:13px;color:#666;\">seul l'abonnement mensuel reste facturé</span>`, "#d4a017") +
        para("Pendant cette année en or, votre code de parrainage fait une petite pause bien méritée : vous pourrez reprendre la chasse aux filleuls à son issue. 😉") +
        para("Merci du fond du cœur pour votre confiance et vos recommandations. Vous êtes un vrai ambassadeur ! 💛") +
        bouton(`${SITE_URL}/dashboard`, "Admirer mon badge 🥇"), "or");
    }
  }
}

// Facture du 1er du mois : déduit un mois offert si l'abonnement est facturé
// pour un mois complet (pas sur une facture au prorata, pour ne pas gâcher le mois).
async function appliquerMoisOffert(admin: SupabaseClient, stripe: Stripe, facture: Stripe.Invoice) {
  if (facture.status !== "draft" || facture.billing_reason !== "subscription_cycle") return;
  const organismeId = await organismeDeLaFacture(admin, facture);
  const customerId = idDe(facture.customer);
  if (!organismeId || !customerId) return;

  const { data: tarif } = await admin.from("tarifs")
    .select("montant_ht_centimes, stripe_tax_rate_id").eq("code", "abonnement_mensuel").single();
  const montantAbonnement = (facture.lines?.data ?? [])
    .filter((l) => (l as unknown as { type?: string }).type === "subscription" || !!(l as unknown as { parent?: { subscription_item_details?: unknown } }).parent?.subscription_item_details)
    .reduce((t, l) => t + (l.amount ?? 0), 0);
  if (montantAbonnement < tarif.montant_ht_centimes) return; // prorata ou rien à déduire

  // Déjà appliqué sur cette facture (événement rejoué) ?
  const { data: ligneFacture } = await admin.from("factures").select("id, mois_offert").eq("stripe_invoice_id", facture.id).maybeSingle();
  if (ligneFacture?.mois_offert) return;

  const { data: mois } = await admin.from("mois_offerts")
    .select("id, motif").eq("organisme_id", organismeId).is("consomme_le", null)
    .order("accorde_le", { ascending: true }).limit(1).maybeSingle();
  if (!mois) return;

  await stripe.invoiceItems.create({
    customer: customerId,
    invoice: facture.id,
    amount: -tarif.montant_ht_centimes,
    currency: "eur",
    description: mois.motif.startsWith("parrainage") ? "Mois offert — parrainage" : "Mois offert",
    tax_rates: tarif.stripe_tax_rate_id ? [tarif.stripe_tax_rate_id] : undefined,
    metadata: { mois_offert_id: mois.id, organisme_id: organismeId },
  }, { idempotencyKey: `qf-mois-offert-${mois.id}` });

  // Copie locale (brouillon) pour relier le mois consommé à la facture
  const { data: f, error } = await admin.from("factures").upsert({
    organisme_id: organismeId, stripe_invoice_id: facture.id, statut: "brouillon", mois_offert: true,
    montant_ht_centimes: 0, montant_tva_centimes: 0, montant_ttc_centimes: 0, updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_invoice_id" }).select("id").single();
  if (error) throw new Error(`Facture locale ${facture.id} : ${error.message}`);
  await admin.from("mois_offerts").update({ consomme_le: new Date().toISOString(), facture_id: f.id })
    .eq("id", mois.id).is("consomme_le", null);
}

function statutLocal(sub: Stripe.Subscription, statutActuel: string | null): string {
  switch (sub.status) {
    case "trialing": return sub.cancel_at ? "resiliation_programmee" : "essai";
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
  const precedent = actuel?.statut ?? null;
  const statut = statutLocal(sub, precedent);
  const cancelAt = sub.cancel_at ?? (sub.cancel_at_period_end ? (sub as unknown as { current_period_end?: number }).current_period_end : null);
  const enRegle = ["essai", "actif", "resiliation_programmee"].includes(statut);
  const reactive = enRegle && (precedent === "impaye" || precedent === "coupe");
  const ligne: Record<string, unknown> = {
    organisme_id: organismeId,
    statut,
    stripe_customer_id: idDe(sub.customer),
    stripe_subscription_id: sub.id,
    fin_essai: versIso(sub.trial_end),
    // cancel_at = 1er du mois à 00:00 → dernier jour d'accès = la veille
    resiliation_effective_le: cancelAt ? versIso(cancelAt - 86400)!.slice(0, 10) : null,
    date_resiliation: statut === "resilie" ? (versIso(sub.ended_at ?? sub.canceled_at) ?? new Date().toISOString()).slice(0, 10) : null,
    impaye_depuis: statut === "impaye" || statut === "coupe" ? (actuel?.impaye_depuis ?? new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  };
  if (enRegle) { ligne.coupure_prevue_le = null; ligne.coupe_le = null; }
  if (reactive) ligne.reactive_le = new Date().toISOString();
  const { error } = await admin.from("abonnements_organismes").upsert(ligne, { onConflict: "organisme_id" });
  if (error) throw new Error(`Synchronisation abonnement ${sub.id} : ${error.message}`);

  if (reactive && precedent === "coupe") await emailReactivation(admin, organismeId, sub.id);
  if (statut === "resilie" && precedent !== "resilie") await finAbonnement(admin, organismeId, sub);
}

// ───────────────────────── Cycle de vie (lot 4) ─────────────────────────

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

const para = (t: string) => `<p style="color:#555;line-height:1.6;margin:0 0 16px;">${t}</p>`;
const bouton = (url: string, texte: string) => `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="background:#f2901e;border-radius:6px;">
<a href="${url}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;">${texte}</a>
</td></tr></table>`;

// Anti-doublon : renvoie true si la notification n'avait pas encore été envoyée
async function premiereFois(admin: SupabaseClient, organismeId: string, type: string, reference: string) {
  const { error } = await admin.from("notifications_abonnement").insert({ organisme_id: organismeId, type, reference, canal: "email" });
  return !error;
}

// Premier échec de paiement d'une facture d'abonnement : impayé, coupure à J+10
async function ouvrirImpaye(admin: SupabaseClient, facture: Stripe.Invoice) {
  const f = facture as unknown as { subscription?: unknown; parent?: { subscription_details?: { subscription?: unknown } } };
  const abonnementId = idDe(f.subscription ?? f.parent?.subscription_details?.subscription);
  if (!abonnementId) return; // export de données, facture finale : pas de coupure
  const organismeId = await organismeDeLaFacture(admin, facture);
  if (!organismeId) return;

  const { data: ab } = await admin.from("abonnements_organismes")
    .select("statut, type_compte, stripe_subscription_id, coupure_prevue_le, impaye_depuis").eq("organisme_id", organismeId).maybeSingle();
  if (!ab || ab.stripe_subscription_id !== abonnementId || ab.type_compte === "super_ambassadeur") return;

  // Base de temps : la facture (cohérent avec les horloges de test Stripe)
  const base = new Date(Math.max(facture.created * 1000, Date.now() - 365 * 86400_000));
  let coupure = ab.coupure_prevue_le as string | null;
  if (!coupure) {
    coupure = new Date(base.getTime() + DELAI_COUPURE_JOURS * 86400_000).toISOString();
    await admin.from("abonnements_organismes").update({
      statut: ab.statut === "coupe" ? "coupe" : "impaye",
      impaye_depuis: ab.impaye_depuis ?? base.toISOString(),
      coupure_prevue_le: coupure,
      updated_at: new Date().toISOString(),
    }).eq("organisme_id", organismeId);
  }

  if (!(await premiereFois(admin, organismeId, "impaye_alerte", facture.id))) return;
  const dest = await emailOrganisme(admin, organismeId);
  const montant = ((facture.amount_due ?? facture.total ?? 0) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  await envoyerEmail(dest.email, "[QualioFlex] Échec de paiement — action requise",
    "Votre paiement n'a pas abouti",
    para("Bonjour,") +
    para(`Le prélèvement de votre facture QualioFlex${facture.number ? ` <strong>${facture.number}</strong>` : ""} (${montant}) pour <strong>${dest.nom}</strong> n'a pas pu aboutir : carte expirée, refusée ou plafond atteint.`) +
    para(`Sans régularisation, <strong>votre accès à QualioFlex sera suspendu le ${dateFr(coupure)}</strong>. Vos données restent conservées.`) +
    para("Pour régulariser, mettez à jour votre carte bancaire depuis votre espace : le paiement est relancé automatiquement.") +
    bouton(`${SITE_URL}/factures`, "Mettre à jour ma carte →") +
    (facture.hosted_invoice_url ? para(`Vous pouvez aussi <a href="${facture.hosted_invoice_url}" style="color:#25245e;">régler directement la facture en ligne</a>.`) : ""));
}

async function emailReactivation(admin: SupabaseClient, organismeId: string, abonnementId: string) {
  if (!(await premiereFois(admin, organismeId, "reactivation", `${abonnementId}:${new Date().toISOString().slice(0, 10)}`))) return;
  const dest = await emailOrganisme(admin, organismeId);
  await envoyerEmail(dest.email, "[QualioFlex] Votre accès est rétabli",
    "Votre accès est rétabli",
    para("Bonjour,") +
    para(`Merci ! Votre paiement a bien été reçu et l'accès de <strong>${dest.nom}</strong> à QualioFlex est rétabli. Vous retrouvez toutes vos données.`) +
    bouton(`${SITE_URL}/dashboard`, "Accéder à QualioFlex →"));
}

// Résiliation effective : dernière facture des sessions dues non facturées,
// les sessions futures sont libérées (plus de service après la fin).
async function finAbonnement(admin: SupabaseClient, organismeId: string, sub: Stripe.Subscription) {
  const fin = new Date(((sub.ended_at ?? sub.canceled_at) ?? Math.floor(Date.now() / 1000)) * 1000);
  const customerId = idDe(sub.customer);

  const { data: lignes } = await admin.from("sessions_facturables")
    .select("id, libelle, montant_ht_centimes, facturable_le")
    .eq("organisme_id", organismeId).eq("statut", "en_attente").is("stripe_invoice_item_id", null)
    .order("date_debut_session", { ascending: true });
  const periodeFin = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const dues = await retirerSessionsOffertes(admin, organismeId, (lignes ?? []).filter((l) => new Date(l.facturable_le) <= fin), periodeFin);
  const liberees = (lignes ?? []).filter((l) => new Date(l.facturable_le) > fin);

  if (liberees.length) {
    await admin.from("sessions_facturables").update({ statut: "annulee_sans_frais", updated_at: new Date().toISOString() })
      .in("id", liberees.map((l) => l.id));
  }

  if (dues.length && customerId && STRIPE_SECRET_KEY) {
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
    const { data: tarif } = await admin.from("tarifs").select("stripe_tax_rate_id").eq("code", "session").single();
    const facture = await stripe.invoices.create({
      customer: customerId,
      collection_method: "charge_automatically",
      auto_advance: true,
      pending_invoice_items_behavior: "exclude",
      description: "Dernière facture : sessions réalisées avant la fin de votre abonnement QualioFlex.",
      metadata: { organisme_id: organismeId, motif: "facture_finale", abonnement: sub.id },
    }, { idempotencyKey: `qf-facture-finale-${sub.id}` });
    const periode = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), 1)).toISOString().slice(0, 10);
    for (const l of dues) {
      const item = await stripe.invoiceItems.create({
        customer: customerId,
        invoice: facture.id,
        amount: l.montant_ht_centimes,
        currency: "eur",
        description: l.libelle,
        tax_rates: tarif?.stripe_tax_rate_id ? [tarif.stripe_tax_rate_id] : undefined,
        metadata: { session_facturable_id: l.id, organisme_id: organismeId },
      }, { idempotencyKey: `qf-session-${l.id}` });
      await admin.from("sessions_facturables").update({
        statut: "facturee", stripe_invoice_item_id: item.id, stripe_invoice_id: facture.id,
        periode_facturation: periode, updated_at: new Date().toISOString(),
      }).eq("id", l.id);
    }
    try {
      await stripe.invoices.finalizeInvoice(facture.id);
      await stripe.invoices.pay(facture.id);
    } catch (e) {
      console.warn(`stripe-webhook: facture finale ${facture.id} non réglée immédiatement:`, (e as Error).message);
    }
  }

  if (!(await premiereFois(admin, organismeId, "resiliation_confirmee", `fin:${sub.id}`))) return;
  const dest = await emailOrganisme(admin, organismeId);
  const { data: tarifExport } = await admin.from("tarifs").select("montant_ht_centimes").eq("code", "export_donnees").maybeSingle();
  const prixExport = ((tarifExport?.montant_ht_centimes ?? 1000) / 100).toLocaleString("fr-FR");
  await envoyerEmail(dest.email, "[QualioFlex] Votre abonnement est terminé",
    "Votre abonnement est terminé",
    para("Bonjour,") +
    para(`Votre abonnement QualioFlex pour <strong>${dest.nom}</strong> a pris fin. Merci pour votre confiance !`) +
    (dues.length ? para(`Une dernière facture de ${dues.length} session${dues.length > 1 ? "s" : ""} vous a été adressée ; elle est disponible dans votre espace.`) : "") +
    para(`Vos données restent conservées. Vous pouvez à tout moment <strong>récupérer l'ensemble de vos données</strong> (formations, sessions, documents, conventions signées, preuves d'audit) pour ${prixExport} € HT, ou réactiver votre abonnement.`) +
    bouton(`${SITE_URL}/factures`, "Accéder à mon espace →"));
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
        await appliquerMoisOffert(admin, stripe, event.data.object as Stripe.Invoice);
        break;
      case "invoice.finalized":
        await enregistrerFacture(admin, event.data.object as Stripe.Invoice);
        break;
      case "invoice.paid":
        await enregistrerFacture(admin, event.data.object as Stripe.Invoice);
        await confirmerParrainage(admin, event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await enregistrerFacture(admin, event.data.object as Stripe.Invoice, true);
        await ouvrirImpaye(admin, event.data.object as Stripe.Invoice);
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
