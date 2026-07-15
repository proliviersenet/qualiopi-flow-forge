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

    // 2. Chercher et supprimer tout compte existant avec cet email via SQL direct
    const { data: existingRows } = await supabase
      .from("profiles")
      .select("id")
      .limit(1000);

    // Recherche dans auth.users via requête SQL brute
    const { data: authUserRows } = await supabase
      .rpc("find_user_by_email", { p_email: email })
      .catch(() => ({ data: null }));

    if (authUserRows && authUserRows.length > 0) {
      for (const row of authUserRows) {
        console.log(`Suppression compte: ${row.id}`);
        await supabase.auth.admin.deleteUser(row.id);
        await new Promise(r => setTimeout(r, 200));
      }
    } else {
      // Fallback : listUsers
      const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const found = listData?.users?.filter(u => u.email === email) || [];
      for (const u of found) {
        console.log(`Suppression via listUsers: ${u.id}`);
        await supabase.auth.admin.deleteUser(u.id);
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Attendre propagation
    await new Promise(r => setTimeout(r, 800));

    // 3. Créer le nouveau compte
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nom_complet: nom, role: "client" },
    });

    if (authError || !authData.user) {
      throw new Error(authError?.message || "Erreur création compte");
    }

    // 4. Créer le client en base
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

    // 5. Marquer invitation utilisée
    await supabase
      .from("invitations_clients")
      .update({ statut: "utilisee" })
      .eq("token", token);

    return new Response(
      JSON.stringify({ success: true }),
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
