import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

// Paiement de l'export des données (12/11/2026, refonte chantier facturation).
// - Carte uniquement (virement supprimé, décision Olivier).
// - Prix lu dans public.tarifs (code export_donnees, HT) + TVA 20 % : rien
//   n'est codé en dur, la grille se change sans redéploiement.
// - Client Stripe unique par organisme (organismes.stripe_customer_id),
//   partagé avec le futur abonnement.
// - Facture Stripe émise automatiquement (c'est une vente).
// - La génération de l'export est déclenchée par stripe-webhook à la
//   confirmation du paiement, jamais par le retour navigateur.
// Entrée : { "contexte": "suppression" | "resiliation" }.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const MOTIF = "recuperation_donnees";

const reponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!STRIPE_SECRET_KEY) {
      return reponse({ error: "Le paiement par carte n'est pas encore disponible. Contactez le support." }, 503);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user) return reponse({ error: "Utilisateur non authentifié." }, 401);

    const body = await req.json().catch(() => ({}));
    const contexte = ["suppression", "resiliation"].includes(body?.contexte) ? body.contexte : "suppression";

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Organisme du formateur (propriétaire, sinon rattachement via profiles)
    let { data: organisme } = await admin.from("organismes")
      .select("id, raison_sociale, email_contact, adresse, siret, stripe_customer_id")
      .eq("owner_user_id", user.id).maybeSingle();
    if (!organisme) {
      const { data: profil } = await admin.from("profiles").select("organisme_id").eq("id", user.id).maybeSingle();
      if (profil?.organisme_id) {
        ({ data: organisme } = await admin.from("organismes")
          .select("id, raison_sociale, email_contact, adresse, siret, stripe_customer_id")
          .eq("id", profil.organisme_id).maybeSingle());
      }
    }
    if (!organisme) return reponse({ error: "Aucun organisme associé à votre compte." }, 400);

    const { data: tarif } = await admin.from("tarifs")
      .select("montant_ht_centimes, taux_tva, stripe_price_id, stripe_tax_rate_id")
      .eq("code", "export_donnees").eq("actif", true).maybeSingle();
    if (!tarif?.stripe_price_id || !tarif?.stripe_tax_rate_id) {
      return reponse({ error: "Tarif de l'export non configuré. Contactez le support." }, 503);
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

    // Client Stripe de l'organisme (créé une seule fois)
    let customerId = organisme.stripe_customer_id as string | null;
    if (customerId) {
      try {
        const c = await stripe.customers.retrieve(customerId);
        if ((c as Stripe.DeletedCustomer).deleted) customerId = null;
      } catch { customerId = null; }
    }
    if (!customerId) {
      const client = await stripe.customers.create({
        name: organisme.raison_sociale ?? undefined,
        email: organisme.email_contact || user.email || undefined,
        address: organisme.adresse ? { line1: organisme.adresse, country: "FR" } : undefined,
        preferred_locales: ["fr"],
        metadata: { organisme_id: organisme.id, siret: organisme.siret ?? "" },
      });
      customerId = client.id;
      await admin.from("organismes").update({ stripe_customer_id: customerId }).eq("id", organisme.id);
    }

    const paiementId = crypto.randomUUID();
    const metadata = { paiement_id: paiementId, organisme_id: organisme.id, user_id: user.id, motif: MOTIF, contexte };
    const origin = req.headers.get("origin") || "https://qualioflex.fr";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      locale: "fr",
      line_items: [{ price: tarif.stripe_price_id, quantity: 1, tax_rates: [tarif.stripe_tax_rate_id] }],
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: "Export complet des données QualioFlex (archive ZIP envoyée par email).",
          metadata,
        },
      },
      payment_intent_data: { metadata },
      metadata,
      success_url: `${origin}/settings?paiement=succes&contexte=${contexte}`,
      cancel_url: `${origin}/settings?paiement=annule`,
    });

    const montantTtc = Math.round(tarif.montant_ht_centimes * (1 + Number(tarif.taux_tva) / 100));
    const { error: insertErr } = await admin.from("paiements_stripe").insert({
      id: paiementId,
      user_id: user.id,
      organisme_id: organisme.id,
      email: user.email,
      motif: MOTIF,
      contexte,
      montant_centimes: montantTtc,
      devise: "eur",
      stripe_session_id: session.id,
      statut: "en_attente",
    });
    if (insertErr) console.error("Erreur insertion paiement Stripe:", insertErr);

    return reponse({ url: session.url });
  } catch (e) {
    console.error("Erreur stripe-checkout-recuperation:", e);
    return reponse({ error: "Erreur serveur lors de la création du paiement." }, 500);
  }
});
