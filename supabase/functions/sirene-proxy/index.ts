// ============================================================================
// QUALIFLOW — Edge Function : Proxy INSEE Sirene
// Fichier : supabase/functions/sirene-proxy/index.ts
// Déploiement : supabase functions deploy sirene-proxy
//
// Contourne le blocage CORS de l'API INSEE en proxyfiant l'appel
// depuis le serveur Supabase au lieu du navigateur.
//
// Variables d'environnement requises (Supabase Secrets) :
//   INSEE_API_TOKEN = 6240282d-6270-4698-8028-2d6270f69821
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const INSEE_TOKEN = Deno.env.get("INSEE_API_TOKEN")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const { siret } = await req.json();

    if (!siret || siret.replace(/\s/g, "").length !== 14) {
      return new Response(
        JSON.stringify({ error: "SIRET invalide — 14 chiffres attendus" }),
        { status: 400, headers: CORS }
      );
    }

    const siretClean = siret.replace(/\s/g, "");

    // Utilise entreprise.data.gouv.fr — données INSEE, sans problème HTTP/2
    const resp = await fetch(
      `https://entreprise.data.gouv.fr/api/sirene/v3/etablissements/${siretClean}`,
      { headers: { "Accept": "application/json" } }
    );

    if (resp.status === 404) {
      return new Response(
        JSON.stringify({ error: "Entreprise non trouvée pour ce SIRET" }),
        { status: 404, headers: CORS }
      );
    }

    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(
        JSON.stringify({ error: `Erreur API : ${resp.status} — ${txt.slice(0, 100)}` }),
        { status: resp.status, headers: CORS }
      );
    }

    const data = await resp.json();
    const etab = data.etablissement;
    const ul = etab?.unite_legale || {};

    const nom = ul.denomination ||
      `${ul.prenom_usuel || ""} ${ul.nom || ""}`.trim() ||
      "Entreprise";

    const naf = ul.activite_principale || etab?.activite_principale || "";
    const cp = etab?.code_postal || "";
    const ville = etab?.libelle_commune || "";
    const numVoie = etab?.numero_voie || "";
    const voie = etab?.libelle_voie || "";
    const siren = siretClean.slice(0, 9);

    return new Response(
      JSON.stringify({
        siret: siretClean,
        siren,
        raison_sociale: nom,
        adresse: `${numVoie} ${voie}`.trim(),
        code_postal: cp,
        ville,
        adresse_complete: `${numVoie} ${voie}, ${cp} ${ville}`.trim(),
        code_naf: naf,
      }),
      { status: 200, headers: CORS }
    );
  } catch (err) {
    console.error("Erreur sirene-proxy:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue" }),
      { status: 500, headers: CORS }
    );
  }
});
