import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Chantier "superadmin" (28/08) : création/modification de l'abonnement d'un
// organisme (ce qu'il paie à Olivier pour QualioFlex). Pas d'intégration Stripe
// à ce jour → saisie manuelle par Olivier depuis l'espace superadmin. Même
// pattern d'auth que lister-demandes-suppression.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL = "olivier@exsenco.fr";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
      return new Response(
        JSON.stringify({ error: "Action réservée à l'administrateur QualioFlex." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { organisme_id, montant_centimes, periodicite, statut, date_debut, notes, abonnement_id } = await req.json();
    if (!organisme_id) throw new Error("organisme_id requis");
    if (!["mensuel", "annuel"].includes(periodicite)) throw new Error("periodicite invalide.");
    if (!Number.isFinite(montant_centimes) || montant_centimes < 0) throw new Error("montant_centimes invalide.");

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload = {
      organisme_id,
      montant_centimes: Math.round(montant_centimes),
      periodicite,
      statut: ["actif", "suspendu", "resilie"].includes(statut) ? statut : "actif",
      date_debut: date_debut || new Date().toISOString().slice(0, 10),
      notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = abonnement_id
      ? await admin.from("abonnements_organismes").update(payload).eq("id", abonnement_id).select().single()
      : await admin.from("abonnements_organismes").insert(payload).select().single();

    if (error) {
      console.error("Erreur upsert abonnement:", error);
      return new Response(JSON.stringify({ error: "Erreur lors de l'enregistrement de l'abonnement." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ abonnement: data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Erreur superadmin-gerer-abonnement:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Erreur serveur." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
