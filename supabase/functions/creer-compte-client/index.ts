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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Vérifier token invitation
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

    // 2. Chercher si un compte existe avec cet email
    const { data: existingId } = await supabase.rpc("get_user_id_by_email", { p_email: email });
    console.log("Compte existant trouvé:", existingId);

    let userId: string;

    if (existingId) {
      // Mettre à jour le compte existant au lieu de le recréer
      console.log("Mise à jour du compte existant:", existingId);
      const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
        existingId,
        {
          password,
          email_confirm: true,
          user_metadata: { nom_complet: nom, role: "client" },
          ban_duration: "none", // débloquer si banni
        }
      );
      if (updateError) throw new Error(updateError.message);
      userId = existingId;
    } else {
      // Créer un nouveau compte
      console.log("Création nouveau compte pour:", email);
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nom_complet: nom, role: "client" },
      });
      if (authError || !authData.user) throw new Error(authError?.message || "Erreur création compte");
      userId = authData.user.id;
    }

    // 3. Créer le client en base
    const { error: clientError } = await supabase
      .from("clients")
      .insert({
        organisme_id,
        siret: siret || null,
        siren: siren || null,
        raison_sociale: nom,
        adresse: adresse || null,
        contact_email: email,
      });

    if (clientError) {
      console.error("Erreur insert client:", JSON.stringify(clientError));
      throw new Error(`Erreur création client: ${clientError.message}`);
    }

    console.log("Client créé avec succès pour:", email);

    // 4. Marquer invitation utilisée
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
