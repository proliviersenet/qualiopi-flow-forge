import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chantier "sous-traitance" (28/08) : annuaire des formateurs QalioFlex, recherchable
// par nom/raison sociale — utilisé par le bouton "Sous-traiter cette formation" pour
// retrouver un formateur déjà inscrit sur la plateforme. Volontairement pas de policy
// RLS ouverte sur `organismes` pour ça (fuite de données à toute la plateforme) : tout
// passe par cette Edge Function en service role, qui ne renvoie que le strict minimum
// (nom, organisme) et jamais à un compte client.
//
// "Qui est formateur" = qui possède un organisme (organismes.owner_user_id). C'est le
// pattern déjà établi ailleurs dans le projet (creer-compte-client) : la colonne
// role/user_metadata n'est pas fiable pour les comptes formateurs, alors qu'un compte
// client, lui, ne possède jamais d'organisme en propre.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: "Saisissez au moins 2 caractères." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Utilisateur non authentifié" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (user.user_metadata?.role === "client") {
      return new Response(
        JSON.stringify({ error: "Réservé aux comptes formateur." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: monProfil } = await supabase
      .from("profiles")
      .select("organisme_id")
      .eq("id", user.id)
      .maybeSingle();
    const monOrganismeId = monProfil?.organisme_id ?? null;

    const { data: organismes, error: searchError } = await supabase
      .from("organismes")
      .select("id, raison_sociale, owner_user_id")
      .ilike("raison_sociale", `%${query.trim()}%`)
      .not("owner_user_id", "is", null)
      .limit(10);

    if (searchError) throw searchError;

    const resultats = (organismes || []).filter((o) => o.id !== monOrganismeId);

    if (resultats.length === 0) {
      return new Response(
        JSON.stringify({ resultats: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ownerIds = resultats.map((o) => o.owner_user_id).filter(Boolean) as string[];
    const { data: profilsOwners } = await supabase
      .from("profiles")
      .select("id, nom_complet")
      .in("id", ownerIds);
    const nomParOwner: Record<string, string> = {};
    (profilsOwners || []).forEach((p: { id: string; nom_complet?: string }) => {
      nomParOwner[p.id] = p.nom_complet || "";
    });

    const payload = resultats.map((o) => ({
      organisme_id: o.id,
      raison_sociale: o.raison_sociale,
      formateur_profile_id: o.owner_user_id,
      formateur_nom: nomParOwner[o.owner_user_id as string] || o.raison_sociale,
    }));

    return new Response(
      JSON.stringify({ resultats: payload }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erreur rechercher-formateur:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
