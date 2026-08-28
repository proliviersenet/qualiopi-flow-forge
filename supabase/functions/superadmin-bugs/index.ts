import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Chantier "superadmin" (28/08) : liste + résolution des bugs remontés (auto
// via ErrorBoundary, manuel via bouton "Signaler un bug"). L'écriture initiale
// se fait en direct côté client (RLS insert-only, voir migration
// superadmin_bugs_abonnements) — cette fonction ne gère que la lecture
// (réservée à Olivier) et le passage à "résolu".

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
        JSON.stringify({ error: "Action réservée à l'administrateur QalioFlex." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { action, bug_id, statut } = await req.json().catch(() => ({ action: "lister" }));

    if (action === "resoudre") {
      if (!bug_id) throw new Error("bug_id requis");
      const nouveauStatut = ["nouveau", "en_cours", "resolu"].includes(statut) ? statut : "resolu";
      const { error } = await admin
        .from("bugs")
        .update({
          statut: nouveauStatut,
          resolu_le: nouveauStatut === "resolu" ? new Date().toISOString() : null,
          resolu_par: nouveauStatut === "resolu" ? user.id : null,
        })
        .eq("id", bug_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // action "lister" (par défaut)
    const { data: bugs, error } = await admin
      .from("bugs")
      .select("id, source, type, message, stack, page_url, user_email, organisme_id, role, statut, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    return new Response(JSON.stringify({ bugs: bugs ?? [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Erreur superadmin-bugs:", e);
    return new Response(
      JSON.stringify({ error: "Erreur serveur." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
