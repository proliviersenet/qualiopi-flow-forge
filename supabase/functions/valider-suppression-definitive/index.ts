import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Seul ce compte (Olivier, propriétaire de QualioFlex) est autorisé à valider
// une suppression définitive. Aucune purge automatique n'existe ailleurs :
// c'est toujours un geste manuel, volontaire, depuis /admin/suppressions.
const ADMIN_EMAIL = "olivier@exsenco.fr";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email du compte à supprimer manquant." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: demande, error: demandeErr } = await admin
      .from("demandes_suppression_compte")
      .select("id, user_id, demandee_le")
      .eq("email", email)
      .is("restauree_le", null)
      .is("supprimee_definitivement_le", null)
      .order("demandee_le", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (demandeErr) {
      console.error("Erreur recherche demande de suppression:", demandeErr);
      return new Response(
        JSON.stringify({ error: "Erreur serveur lors de la recherche de la demande." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!demande) {
      return new Response(
        JSON.stringify({ error: "Aucune demande de suppression en attente pour cet email." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Tentative de suppression réelle du compte. Attention : plusieurs
    // tables (compétences, évaluations, dérogations Qualiopi, organismes,
    // suivi de formation...) référencent ce user_id avec une contrainte
    // RESTRICT — volontairement, pour préserver les données d'audit
    // Qualiopi. Si le compte a la moindre donnée de formation liée, cette
    // suppression échouera : c'est un garde-fou, pas un bug. Dans ce cas on
    // renvoie une erreur claire plutôt que de la masquer.
    const { error: deleteErr } = await admin.auth.admin.deleteUser(demande.user_id);

    if (deleteErr) {
      console.error("Erreur suppression définitive:", deleteErr);
      return new Response(
        JSON.stringify({
          error:
            "Impossible de supprimer définitivement ce compte : il reste lié à des données de formation " +
            "(évaluations, compétences, dérogations Qualiopi, suivi de formation...) qui doivent être conservées " +
            "pour l'audit. Le compte reste bloqué (inaccessible) mais ne peut pas être supprimé de la base tant " +
            "que ces données existent.",
          detail: deleteErr.message,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Le compte auth a bien été supprimé : la ligne demandes_suppression_compte
    // disparaît automatiquement (contrainte on delete cascade sur user_id).
    return new Response(
      JSON.stringify({ success: true, email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Erreur valider-suppression-definitive:", e);
    return new Response(
      JSON.stringify({ error: "Erreur serveur." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
