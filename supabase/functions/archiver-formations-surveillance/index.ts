import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Correctif audit du 31/07 (point non bloquant #60) : Qualiopi exige que les
// formations "publiées" restent à jour au regard du dernier audit de
// surveillance passé par l'organisme. On archive automatiquement (statut
// "archive") toute formation publiée qui n'a pas été mise à jour depuis le
// dernier audit de surveillance de son organisme, une fois que 18 mois se
// sont écoulés depuis cet audit — le formateur a alors eu le temps de revoir
// ses formations, celles non revues sont considérées obsolètes.
//
// Idempotent : ne fait rien pour les organismes sans date d'audit renseignée,
// ni pour les formations déjà archivées ou mises à jour après l'audit. Peut
// donc être appelée aussi souvent que voulu (tâche planifiée mensuelle, comme
// les autres bascules automatiques du flow) sans effet de bord.
//
// Déclenchée par un cron Postgres (pg_cron + pg_net), protégée par le même
// secret partagé que les autres Edge Functions cron-only (x-cron-secret /
// CRON_SECRET) — pas de JWT utilisateur disponible dans ce contexte.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
    const provided = req.headers.get("x-cron-secret") ?? "";
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: organismesData, error: orgErr } = await supabase
      .from("organismes")
      .select("id, raison_sociale, date_dernier_audit_surveillance")
      .not("date_dernier_audit_surveillance", "is", null);

    if (orgErr) throw new Error("Lecture organismes impossible : " + orgErr.message);

    const now = new Date();
    const resultats: Record<string, unknown>[] = [];

    for (const org of (organismesData ?? []) as Record<string, unknown>[]) {
      const dateAudit = org.date_dernier_audit_surveillance as string;
      const limiteArchivage = new Date(dateAudit);
      limiteArchivage.setMonth(limiteArchivage.getMonth() + 18);

      if (now < limiteArchivage) {
        resultats.push({ organisme_id: org.id, statut: "pas_encore_18_mois", limite_archivage: limiteArchivage.toISOString().slice(0, 10) });
        continue;
      }

      // Formations publiées de cet organisme, non mises à jour depuis le
      // dernier audit de surveillance : considérées obsolètes, à archiver.
      const { data: archivees, error: updErr } = await supabase
        .from("formations")
        .update({ statut: "archive", updated_at: now.toISOString() })
        .eq("organisme_id", org.id)
        .eq("statut", "publie")
        .lt("updated_at", dateAudit)
        .select("id");

      if (updErr) {
        resultats.push({ organisme_id: org.id, statut: "erreur", error: updErr.message });
        continue;
      }

      resultats.push({
        organisme_id: org.id,
        statut: "verifie",
        nb_formations_archivees: archivees?.length ?? 0,
      });
    }

    return new Response(
      JSON.stringify({ success: true, total_organismes: resultats.length, resultats }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
