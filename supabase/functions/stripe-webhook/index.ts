import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

// Pas de CORS ici : cette fonction n'est jamais appelée depuis le navigateur,
// uniquement par les serveurs de Stripe (appel server-to-server signé).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error("stripe-webhook: secrets STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET manquants.");
    return new Response("Stripe non configuré", { status: 500 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
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
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const { error } = await admin
        .from("paiements_stripe")
        .update({ statut: "paye", paye_le: new Date().toISOString() })
        .eq("stripe_session_id", session.id);
      if (error) {
        console.error("stripe-webhook: erreur mise à jour paiement:", error);
      }
    }
  } catch (e) {
    console.error("stripe-webhook: erreur traitement événement:", e);
    // On répond quand même 200 pour éviter que Stripe ne boucle indéfiniment
    // sur un événement qu'on ne pourra de toute façon pas traiter différemment.
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
