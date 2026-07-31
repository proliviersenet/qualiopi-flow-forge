import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Déclenche le flow documentaire Qualiopi de démarrage pour un lot de
// stagiaires (livret d'accueil + questionnaire de positionnement avant
// formation), appelé juste après l'import Excel côté espace client
// (src/pages/EspaceClient.tsx, handleFileUpload). Corrige un bug où le
// toast affiché au client promettait un envoi automatique qui ne se
// produisait jamais.
//
// Ne duplique pas l'envoi (email Brevo + SMS) : réutilise l'Edge Function
// envoyer-relance déjà utilisée pour les relances manuelles depuis
// StagiairesList.tsx, avec les mêmes motifs "livret" et "questionnaire_avant".
// Appelée ici avec un client service_role, ce qui satisfait l'auth de la
// passerelle Supabase Edge Functions sans dépendre du JWT de l'utilisateur
// appelant.
//
// Un échec d'envoi pour un stagiaire (Brevo en erreur, coordonnées absentes...)
// n'interrompt jamais le traitement des autres : chaque tentative est isolée
// et le résultat réel (succès/échec, par stagiaire et par motif) est renvoyé
// à l'appelant pour affichage dans un toast honnête côté client.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { session_id, stagiaire_ids } = await req.json();

    if (!session_id || typeof session_id !== "string") {
      return new Response(JSON.stringify({ error: "session_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(stagiaire_ids) || stagiaire_ids.length === 0) {
      return new Response(JSON.stringify({ error: "stagiaire_ids requis (tableau non vide)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Titre de la formation (pour le contenu de l'email/SMS envoyé par
    // envoyer-relance) — récupéré une seule fois pour tout le lot plutôt
    // que de le faire porter par l'appelant.
    const { data: sessionData, error: sessionErr } = await supabase
      .from("sessions")
      .select("formation:formation_id(titre)")
      .eq("id", session_id)
      .single();

    if (sessionErr || !sessionData) {
      throw new Error("Session introuvable : " + (sessionErr?.message ?? "id inconnu"));
    }
    const formationTitre =
      ((sessionData as Record<string, unknown>).formation as Record<string, unknown> | null)?.titre as
        | string
        | undefined ?? "votre formation";

    // On ne fait confiance qu'aux stagiaires réellement rattachés à cette
    // session (defense in depth : ignore silencieusement tout id fourni qui
    // n'appartiendrait pas à session_id).
    const { data: stagiairesData, error: stagErr } = await supabase
      .from("stagiaires")
      .select("id, nom, prenom, email_pro, telephone, doc_questionnaire_avant")
      .eq("session_id", session_id)
      .in("id", stagiaire_ids);

    if (stagErr) throw new Error("Lecture stagiaires impossible : " + stagErr.message);

    const MOTIFS = ["livret", "questionnaire_avant"] as const;
    const resultats: Record<string, unknown>[] = [];

    for (const s of (stagiairesData ?? []) as Record<string, unknown>[]) {
      const prenom = (s.prenom as string) ?? "";
      const nom = (s.nom as string) ?? "";
      const email = (s.email_pro as string) ?? "";
      const telephone = (s.telephone as string) ?? "";

      if (!email && !telephone) {
        for (const motif of MOTIFS) {
          resultats.push({
            stagiaire_id: s.id,
            motif,
            success: false,
            error: "Aucun email ni téléphone renseigné pour ce stagiaire",
          });
        }
        continue;
      }

      for (const motif of MOTIFS) {
        // Garde anti-doublon : pas de colonne dédiée pour "livret envoyé" (simple
        // document informatif, sans suivi de complétion), mais le questionnaire
        // avant a un statut de progression (doc_questionnaire_avant) — on évite
        // de le renvoyer s'il a déjà été transmis ou complété (ex. nouvel appel
        // sur les mêmes stagiaires).
        if (motif === "questionnaire_avant") {
          const statutActuel = s.doc_questionnaire_avant as string | null;
          if (statutActuel === "envoye" || statutActuel === "signe") {
            resultats.push({ stagiaire_id: s.id, motif, success: true, skipped: true, reason: "déjà envoyé" });
            continue;
          }
        }

        try {
          const { data, error } = await supabase.functions.invoke("envoyer-relance", {
            body: {
              prenom,
              nom,
              email,
              telephone,
              formation_titre: formationTitre,
              motif,
              canal: "les_deux",
              envoye_par: "system_import_stagiaires",
              stagiaire_id: s.id,
            },
          });

          if (error || (data as Record<string, unknown> | null)?.error) {
            const errMsg = (error as { message?: string } | null)?.message
              || (data as Record<string, unknown> | null)?.error
              || "Erreur inconnue";
            throw new Error(String(errMsg));
          }

          resultats.push({
            stagiaire_id: s.id,
            motif,
            success: true,
            details: (data as Record<string, unknown> | null)?.results ?? null,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          resultats.push({ stagiaire_id: s.id, motif, success: false, error: msg });
        }
      }
    }

    const nbOk = resultats.filter((r) => r.success === true).length;

    return new Response(
      JSON.stringify({ success: true, total: resultats.length, nb_ok: nbOk, resultats }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
