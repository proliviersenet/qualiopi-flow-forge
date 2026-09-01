import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Seul ce compte (Olivier, propriétaire de QualioFlex) est autorisé à
// restaurer un compte formateur supprimé. Aucun rôle "admin" n'existe
// ailleurs dans l'app : on vérifie donc directement l'email de l'appelant.
const ADMIN_EMAIL = "olivier@exsenco.fr";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email du compte à restaurer manquant." }),
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

    // Retrouve la demande de suppression la plus récente et non restaurée
    // pour cet email, afin d'obtenir le user_id concerné.
    const { data: demande, error: demandeErr } = await admin
      .from("demandes_suppression_compte")
      .select("id, user_id, demandee_le")
      .eq("email", email)
      .is("restauree_le", null)
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

    // Débloque le compte
    const { error: unbanErr } = await admin.auth.admin.updateUserById(demande.user_id, {
      ban_duration: "none",
    });
    if (unbanErr) {
      console.error("Erreur déblocage du compte:", unbanErr);
      return new Response(
        JSON.stringify({ error: "Erreur serveur lors du déblocage du compte." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Marque la demande comme restaurée
    const { error: updateErr } = await admin
      .from("demandes_suppression_compte")
      .update({ restauree_le: new Date().toISOString() })
      .eq("id", demande.id);
    if (updateErr) {
      console.error("Erreur mise à jour demande de suppression:", updateErr);
    }

    return new Response(
      JSON.stringify({ success: true, user_id: demande.user_id, email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Erreur restaurer-compte-formateur:", e);
    return new Response(
      JSON.stringify({ error: "Erreur serveur." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
