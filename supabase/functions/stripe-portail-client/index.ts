import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

// Portail client Stripe (lot 2, 12/11/2026) : le formateur y change sa carte
// bancaire, met à jour ses coordonnées de facturation et télécharge ses
// factures. La résiliation et le changement de formule y sont désactivés :
// la résiliation passe par QualioFlex (préavis de 30 jours, effet en fin de
// mois, proposition d'export — lot 4).
//
// La configuration du portail est créée une seule fois puis mémorisée dans
// parametres_plateforme (cle stripe_portail_configuration), avec le mode
// Stripe (test/live) pour ne jamais réutiliser une configuration de test en réel.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const reponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!STRIPE_SECRET_KEY) return reponse({ error: "Le portail de paiement n'est pas encore disponible." }, 503);

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
      .select("id, stripe_customer_id").eq("owner_user_id", user.id).maybeSingle();
    if (!organisme) {
      const { data: profil } = await admin.from("profiles").select("organisme_id").eq("id", user.id).maybeSingle();
      if (profil?.organisme_id) {
        ({ data: organisme } = await admin.from("organismes")
          .select("id, stripe_customer_id").eq("id", profil.organisme_id).maybeSingle());
      }
    }
    if (!organisme?.stripe_customer_id) {
      return reponse({ error: "Aucun moyen de paiement enregistré pour votre organisme." }, 400);
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
    const mode = /^(sk|rk)_test_/.test(STRIPE_SECRET_KEY) ? "test" : "live";
    const origin = req.headers.get("origin") || "https://qualioflex.fr";

    // Configuration du portail (créée une fois par mode Stripe)
    const { data: param } = await admin.from("parametres_plateforme")
      .select("valeur").eq("cle", "stripe_portail_configuration").maybeSingle();
    const memorise = (param?.valeur ?? null) as { id?: string; mode?: string } | null;
    let configurationId = memorise?.mode === mode ? memorise.id : undefined;
    if (configurationId) {
      try {
        const c = await stripe.billingPortal.configurations.retrieve(configurationId);
        if (!c.active) configurationId = undefined;
      } catch { configurationId = undefined; }
    }
    if (!configurationId) {
      const configuration = await stripe.billingPortal.configurations.create({
        business_profile: { headline: "QualioFlex by ExSenCo — votre carte bancaire et vos factures" },
        features: {
          payment_method_update: { enabled: true },
          invoice_history: { enabled: true },
          customer_update: { enabled: true, allowed_updates: ["name", "email", "address"] },
          subscription_cancel: { enabled: false },
          subscription_update: { enabled: false, default_allowed_updates: [], proration_behavior: "none" },
        },
        default_return_url: `${origin}/factures`,
        metadata: { qualioflex: "portail" },
      });
      configurationId = configuration.id;
      await admin.from("parametres_plateforme")
        .update({ valeur: { id: configurationId, mode }, updated_at: new Date().toISOString() })
        .eq("cle", "stripe_portail_configuration");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: organisme.stripe_customer_id,
      configuration: configurationId,
      locale: "fr",
      // ?retour=portail : la page relance le paiement des factures en attente
      // si le compte est en impayé (carte mise à jour → régularisation)
      return_url: `${origin}/factures?retour=portail`,
    });

    return reponse({ url: session.url });
  } catch (e) {
    console.error("Erreur stripe-portail-client:", e);
    return reponse({ error: "Erreur serveur lors de l'ouverture du portail de paiement." }, 500);
  }
});
