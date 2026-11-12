import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

// Webhook Stripe (refonte 12/11/2026, chantier facturation).
// Appelé uniquement par les serveurs Stripe (signature vérifiée), jamais par
// le navigateur — verify_jwt=false obligatoire (même piège que DocuSign).
//
// Traité à ce jour :
//  - checkout.session.completed : paiement de l'export des données →
//    paiement marqué payé, ligne exports créée, génération lancée.
//  - invoice.finalized / invoice.paid / invoice.payment_failed : copie locale
//    de la facture dans public.factures (liste téléchargeable du formateur).
// Les événements d'abonnement sont acceptés (200) et seront traités au lot 2.
//
// Idempotent : Stripe peut renvoyer un même événement, rien n'est dupliqué.

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

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
        if (session.metadata?.motif === "recuperation_donnees" && session.payment_status === "paid") {
          await paiementExportConfirme(admin, session);
        } else {
          await admin.from("paiements_stripe")
            .update({ statut: "paye", paye_le: new Date().toISOString() })
            .eq("stripe_session_id", session.id);
        }
        break;
      }
      case "invoice.finalized":
      case "invoice.paid":
        await enregistrerFacture(admin, event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await enregistrerFacture(admin, event.data.object as Stripe.Invoice, true);
        break;
      default:
        // Abonnements, fin d'essai, carte expirée… : traités au lot 2.
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
