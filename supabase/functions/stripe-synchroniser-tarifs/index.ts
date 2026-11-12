import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

// Chantier facturation — LOT 2 (09/11/2026).
// Synchronise la grille public.tarifs vers Stripe :
//  - vérifie la connexion au compte Stripe et le mode (test / live) ;
//  - crée (une fois) le taux de TVA France 20 % hors taxe ;
//  - crée/met à jour un Product par tarif (id fixe "qf_<code>") ;
//  - crée un nouveau Price quand le montant change (les Price Stripe sont
//    immuables) et désactive l'ancien ;
//  - enregistre les identifiants Stripe dans public.tarifs.
// Idempotent : peut être relancée après chaque changement de prix.
// Protection : même secret partagé que les fonctions cron (x-cron-secret /
// CRON_SECRET). Refuse une clé live sauf {"autoriser_live": true}.
// Ne renvoie jamais la clé ni aucun secret.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  if (!CRON_SECRET || (req.headers.get("x-cron-secret") ?? "") !== CRON_SECRET) {
    return json({ error: "Non autorisé" }, 401);
  }
  if (!STRIPE_SECRET_KEY) return json({ error: "STRIPE_SECRET_KEY absente des secrets Supabase." }, 500);

  const mode = /^(sk|rk)_test_/.test(STRIPE_SECRET_KEY) ? "test" : "live";
  const body = await req.json().catch(() => ({}));
  if (mode === "live" && body?.autoriser_live !== true) {
    return json({ error: "Clé LIVE détectée : synchronisation refusée sans autoriser_live=true.", mode }, 400);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Connexion au compte
    const compte = await stripe.accounts.retrieve();

    // 2. TVA France 20 % (hors taxe)
    const taux = await stripe.taxRates.list({ active: true, limit: 100 });
    let tva = taux.data.find((t) => t.metadata?.qualioflex === "tva_fr_20");
    if (!tva) {
      tva = await stripe.taxRates.create({
        display_name: "TVA",
        description: "TVA France 20 %",
        percentage: 20,
        inclusive: false,
        country: "FR",
        jurisdiction: "FR",
        metadata: { qualioflex: "tva_fr_20" },
      });
    }

    // 3. Produits et prix
    const { data: tarifs, error } = await admin.from("tarifs").select("*").eq("actif", true);
    if (error) throw error;

    const resultats: Record<string, unknown>[] = [];
    for (const t of tarifs ?? []) {
      const productId = `qf_${t.code}`;
      let produit: Stripe.Product;
      try {
        produit = await stripe.products.retrieve(productId);
        if (produit.name !== t.libelle || !produit.active) {
          produit = await stripe.products.update(productId, { name: t.libelle, active: true });
        }
      } catch (e) {
        if ((e as { code?: string }).code !== "resource_missing") throw e;
        produit = await stripe.products.create({
          id: productId,
          name: t.libelle,
          metadata: { qualioflex_code: t.code },
        });
      }

      const recurrent = t.code === "abonnement_mensuel";
      let prixActuel: Stripe.Price | null = null;
      if (t.stripe_price_id) {
        try { prixActuel = await stripe.prices.retrieve(t.stripe_price_id); } catch { prixActuel = null; }
      }
      const prixOk = prixActuel && prixActuel.active && prixActuel.product === productId
        && prixActuel.unit_amount === t.montant_ht_centimes && prixActuel.currency === "eur"
        && (recurrent ? prixActuel.recurring?.interval === "month" : !prixActuel.recurring);

      let prix = prixActuel;
      let action = "inchange";
      if (!prixOk) {
        prix = await stripe.prices.create({
          product: productId,
          currency: "eur",
          unit_amount: t.montant_ht_centimes,
          tax_behavior: "exclusive",
          ...(recurrent ? { recurring: { interval: "month" } } : {}),
          lookup_key: productId,
          transfer_lookup_key: true,
          metadata: { qualioflex_code: t.code },
        });
        if (prixActuel?.active) await stripe.prices.update(prixActuel.id, { active: false });
        action = prixActuel ? "nouveau_prix" : "cree";
      }

      const { error: updErr } = await admin.from("tarifs").update({
        stripe_product_id: produit.id,
        stripe_price_id: prix!.id,
        stripe_tax_rate_id: tva.id,
        stripe_mode: mode,
        synchronise_le: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", t.id);
      if (updErr) throw updErr;

      resultats.push({ code: t.code, montant_ht_centimes: t.montant_ht_centimes, produit: produit.id, prix: prix!.id, action });
    }

    return json({
      success: true,
      mode,
      compte: {
        id: compte.id,
        pays: compte.country,
        devise: compte.default_currency,
        nom: compte.settings?.dashboard?.display_name ?? compte.business_profile?.name ?? null,
        paiements_actives: compte.charges_enabled,
      },
      tva: { id: tva.id, pourcentage: tva.percentage },
      tarifs: resultats,
    });
  } catch (e) {
    console.error("stripe-synchroniser-tarifs:", e);
    const err = e as { type?: string; code?: string; message?: string };
    return json({ error: "Erreur Stripe", type: err.type, code: err.code, message: err.message, mode }, 500);
  }
});
