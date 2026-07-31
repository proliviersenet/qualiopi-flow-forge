import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPPORT_BUCKET = "documents-qualiopi-support";
const SIGNED_URL_TTL_SECONDS = 900; // 15 minutes

// Edge Function publique (pas d'authentification) — correctif audit juillet 2026 :
// le support pédagogique doit être réellement inaccessible à un stagiaire tant que
// SON émargement n'est pas signé, pas juste masqué dans l'UI (l'ancien verrou dans
// EspaceClient.tsx était purement visuel côté CLIENT, et l'URL Storage publique du
// support restait de toute façon accessible à qui la devinait/interceptait, verrou
// ou pas). Même principe d'identification que emargement-public : le
// token_emargement du stagiaire fait office de clé d'autorisation — on réutilise
// volontairement ce même token (un seul lien à retenir pour le stagiaire, le
// support se débloque naturellement dès la signature). On utilise la clé
// service_role pour contourner la RLS du bucket privé "documents-qualiopi-support"
// (cf. migration 20260731090500_bucket_prive_support_pedagogique.sql) après avoir
// vérifié nous-mêmes la règle métier ci-dessous.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) throw new Error("token requis");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: stagiaire, error: sErr } = await supabase
      .from("stagiaires")
      .select("id, prenom, doc_emargement, session_id")
      .eq("token_emargement", token)
      .maybeSingle();

    if (sErr) throw new Error("Erreur lecture stagiaire : " + sErr.message);
    if (!stagiaire) throw new Error("Lien invalide ou expiré.");

    const s = stagiaire as Record<string, unknown>;

    // Règle métier (demande Olivier) : le support pédagogique reste bloqué pour
    // CE stagiaire tant que SON émargement à lui n'est pas signé — vérifié ici,
    // côté serveur, avec la clé service_role : impossible à contourner depuis le
    // navigateur, contrairement à l'ancien verrou purement visuel.
    if (s.doc_emargement !== "signe") {
      throw new Error(
        "Le support pédagogique est disponible dès que vous avez signé votre émargement. " +
        "Utilisez le lien d'émargement reçu par email/SMS."
      );
    }

    const { data: session, error: sessErr } = await supabase
      .from("sessions")
      .select("formation_id, formation:formation_id(titre)")
      .eq("id", s.session_id as string)
      .maybeSingle();

    if (sessErr || !session) throw new Error("Session introuvable.");
    const formationId = (session as Record<string, unknown>).formation_id as string;
    const formationInfo = (session as Record<string, unknown>).formation as Record<string, unknown> | null;
    const formationTitre = (formationInfo?.titre as string) || "votre formation";

    const { data: doc, error: docErr } = await supabase
      .from("documents_formation")
      .select("url")
      .eq("formation_id", formationId)
      .eq("type", "support")
      .maybeSingle();

    if (docErr) throw new Error("Erreur lecture support : " + docErr.message);
    const path = doc?.url as string | undefined;

    if (!path) {
      throw new Error("Le support pédagogique n'est pas encore disponible. Contactez votre formateur.");
    }
    if (path.startsWith("http://") || path.startsWith("https://")) {
      // Support uploadé AVANT le passage au bucket privé (ancienne URL publique
      // encore stockée telle quelle) : impossible d'en générer une URL signée.
      // Le formateur doit le re-uploader depuis FormationDetail.tsx pour migrer
      // (voir étapes manuelles de la migration).
      throw new Error("Le support pédagogique est en cours de migration. Contactez votre formateur.");
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(SUPPORT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (signErr || !signed?.signedUrl) {
      throw new Error("Impossible de générer le lien de consultation. Contactez votre formateur.");
    }

    return new Response(
      JSON.stringify({
        success: true,
        signed_url: signed.signedUrl,
        expires_in: SIGNED_URL_TTL_SECONDS,
        prenom: s.prenom,
        formation_titre: formationTitre,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
