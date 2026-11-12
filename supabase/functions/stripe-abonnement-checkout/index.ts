import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

// Souscription à l'abonnement QualioFlex (lot 2, 12/11/2026).
//
// Stripe refuse de combiner essai gratuit et ancrage de facturation au 1er
// du mois dans une page Checkout « subscription ». On procède donc en deux
// temps :
//   1. ici : page Checkout en mode « setup » → le formateur enregistre sa
//      carte (obligatoire, authentification 3-D Secure gérée par Stripe) ;
//   2. stripe-webhook (checkout.session.completed, mode setup) crée
//      l'abonnement : 7 jours d'essai, puis facture au prorata jusqu'à la fin
//      du mois, puis une facture le 1er de chaque mois.
//
// Refuse si la facturation ne s'applique pas à l'organisme (bêta), si le
// compte est super ambassadeur, ou si un abonnement est déjà en cours.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

const STATUTS_EN_COURS = ["essai", "actif", "impaye", "resiliation_programmee"];

const reponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!STRIPE_SECRET_KEY) return reponse({ error: "La souscription n'est pas encore disponible." }, 503);

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user) return reponse({ error: "Utilisateur non authentifié." }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    const { data: active } = await admin.rpc("fn_facturation_active_pour", { p_organisme_id: organisme.id });
    if (!active) return reponse({ error: "L'abonnement n'est pas encore ouvert : QualioFlex est gratuit pendant la bêta." }, 400);

    const { data: abonnement } = await admin.from("abonnements_organismes")
      .select("statut, type_compte").eq("organisme_id", organisme.id).maybeSingle();
    if (abonnement?.type_compte === "super_ambassadeur") {
      return reponse({ error: "Votre compte ambassadeur est exempté d'abonnement." }, 400);
    }
    if (abonnement && STATUTS_EN_COURS.includes(abonnement.statut)) {
      return reponse({ error: "Un abonnement est déjà en cours pour votre organisme." }, 409);
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });

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

    const { data: tarif } = await admin.from("tarifs")
      .select("montant_ht_centimes, stripe_price_id").eq("code", "abonnement_mensuel").eq("actif", true).maybeSingle();
    if (!tarif?.stripe_price_id) return reponse({ error: "Tarif de l'abonnement non configuré. Contactez le support." }, 503);
    const prixHt = (tarif.montant_ht_centimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 });

    const origin = req.headers.get("origin") || "https://qualioflex.fr";
    const metadata = { organisme_id: organisme.id, user_id: user.id, motif: "abonnement" };

    // Managed Payments désactivé : ExSenCo reste le vendeur (cf. export).
    const session = await stripe.checkout.sessions.create({
      managed_payments: { enabled: false },
      mode: "setup",
      customer: customerId,
      currency: "eur",
      locale: "fr",
      payment_method_types: ["card"],
      metadata,
      setup_intent_data: { metadata },
      custom_text: {
        submit: {
          message: `Aucun prélèvement pendant les 7 jours d'essai. Ensuite ${prixHt} € HT par mois, facturés le 1er du mois (le premier mois au prorata). Sans engagement.`,
        },
      },
      success_url: `${origin}/factures?abonnement=succes`,
      cancel_url: `${origin}/factures?abonnement=annule`,
    } as Stripe.Checkout.SessionCreateParams);

    return reponse({ url: session.url });
  } catch (e) {
    console.error("Erreur stripe-abonnement-checkout:", e);
    return reponse({ error: "Erreur serveur lors de la préparation de l'abonnement." }, 500);
  }
});
