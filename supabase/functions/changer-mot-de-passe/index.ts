import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NB_HISTORIQUE = 5;

interface PasswordCheck {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasDigit: boolean;
  hasSpecial: boolean;
}

function validatePassword(password: string): PasswordCheck {
  return {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasDigit: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
}

function isPasswordValid(check: PasswordCheck): boolean {
  return check.minLength && check.hasUpper && check.hasLower && check.hasDigit && check.hasSpecial;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { newPassword } = await req.json();

    if (!newPassword || typeof newPassword !== "string") {
      return new Response(
        JSON.stringify({ error: "Nouveau mot de passe manquant." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const check = validatePassword(newPassword);
    if (!isPasswordValid(check)) {
      return new Response(
        JSON.stringify({
          error: "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Identifie l'utilisateur appelant à partir de son JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Utilisateur non authentifié." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Vérifie la réutilisation par rapport aux N derniers mots de passe
    const { data: historique, error: histErr } = await admin
      .from("password_history")
      .select("password_hash")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(NB_HISTORIQUE);

    if (histErr) {
      console.error("Erreur lecture historique mots de passe:", histErr);
      return new Response(
        JSON.stringify({ error: "Erreur serveur lors de la vérification de l'historique." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const entry of historique ?? []) {
      const { data: matches, error: matchErr } = await admin.rpc("password_matches_hash", {
        plain: newPassword,
        hash: entry.password_hash,
      });
      if (matchErr) {
        console.error("Erreur comparaison mot de passe:", matchErr);
        return new Response(
          JSON.stringify({ error: "Erreur serveur lors de la vérification de l'historique." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (matches) {
        return new Response(
          JSON.stringify({
            error: `Ce mot de passe a déjà été utilisé récemment. Merci d'en choisir un différent des ${NB_HISTORIQUE} derniers.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Met à jour le mot de passe
    const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (updateErr) {
      console.error("Erreur mise à jour mot de passe:", updateErr);
      return new Response(
        JSON.stringify({ error: updateErr.message || "Erreur lors de la mise à jour du mot de passe." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash et enregistre le nouveau mot de passe dans l'historique
    const { data: hashData, error: hashErr } = await admin.rpc("hash_password_for_history", {
      plain: newPassword,
    });
    if (hashErr) {
      console.error("Erreur hachage mot de passe pour historique:", hashErr);
      // Le mot de passe a déjà été changé avec succès : on ne bloque pas l'utilisateur
      // pour un souci d'historisation, mais on log l'erreur pour investigation.
    } else {
      const { error: insertErr } = await admin
        .from("password_history")
        .insert({ user_id: user.id, password_hash: hashData });
      if (insertErr) {
        console.error("Erreur insertion historique mot de passe:", insertErr);
      }

      // Purge : ne garde que les NB_HISTORIQUE plus récents
      const { data: tousLesHash } = await admin
        .from("password_history")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (tousLesHash && tousLesHash.length > NB_HISTORIQUE) {
        const idsAPurger = tousLesHash.slice(NB_HISTORIQUE).map((h) => h.id);
        await admin.from("password_history").delete().in("id", idsAPurger);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Erreur changer-mot-de-passe:", e);
    return new Response(
      JSON.stringify({ error: "Erreur serveur." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
