import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

const MONTANT_CENTIMES = 1000; // 10 €
const MOTIF = "recuperation_donnees";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!STRIPE_SECRET_KEY) {
      return new Response(
        JSON.stringify({
          error: "Le paiement par carte n'est pas encore configuré. Merci d'utiliser le virement bancaire en attendant.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Utilisateur non authentifié." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

    const origin = req.headers.get("origin") || "https://qualioflex.fr";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: "Récupération de données QualioFlex (export complet)" },
            unit_amount: MONTANT_CENTIMES,
          },
          quantity: 1,
        },
      ],
      metadata: { user_id: user.id, motif: MOTIF },
      success_url: `${origin}/settings?paiement=succes`,
      cancel_url: `${origin}/settings?paiement=annule`,
    });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: insertErr } = await admin.from("paiements_stripe").insert({
      user_id: user.id,
      email: user.email,
      motif: MOTIF,
      montant_centimes: MONTANT_CENTIMES,
      devise: "eur",
      stripe_session_id: session.id,
      statut: "en_attente",
    });
    if (insertErr) {
      console.error("Erreur insertion paiement Stripe:", insertErr);
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Erreur stripe-checkout-recuperation:", e);
    return new Response(
      JSON.stringify({ error: "Erreur serveur lors de la création du paiement." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
