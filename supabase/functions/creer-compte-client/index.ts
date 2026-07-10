import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, nom, organisme_id, siret, siren, adresse, token } = await req.json();

    if (!email || !password || !organisme_id || !token) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client admin (service role) pour avoir tous les droits
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Vérifier que le token d'invitation est valide
    const { data: invitation, error: invitError } = await supabase
      .from("invitations_clients")
      .select("*")
      .eq("token", token)
      .eq("statut", "en_attente")
      .gte("expires_at", new Date().toISOString())
      .single();

    if (invitError || !invitation) {
      return new Response(
        JSON.stringify({ error: "Lien d'invitation invalide ou expiré" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Vérifier si un compte existe déjà avec cet email
    const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    if (existingUser) {
      // Supprimer l'ancien compte pour libérer l'email
      const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);
      if (deleteError) {
        console.error("Erreur suppression ancien compte:", deleteError);
        // On continue quand même
      }
    }

    // 3. Créer le nouveau compte
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Pas besoin de confirmation email
      user_metadata: { nom_complet: nom, role: "client" },
    });

    if (authError || !authData.user) {
      throw new Error(authError?.message || "Erreur création compte");
    }

    const userId = authData.user.id;

    // 4. Créer le client dans la table clients
    const { error: clientError } = await supabase
      .from("clients")
      .insert({
        organisme_id,
        siret,
        siren,
        raison_sociale: nom,
        adresse,
        contact_email: email,
      });

    if (clientError) throw new Error(clientError.message);

    // 5. Marquer l'invitation comme utilisée
    await supabase
      .from("invitations_clients")
      .update({ statut: "utilisee" })
      .eq("token", token);

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Erreur creer-compte-client:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
