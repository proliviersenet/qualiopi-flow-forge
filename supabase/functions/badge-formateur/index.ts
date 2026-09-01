import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Widget public "note du formateur" (module de notation des formateurs,
// juillet 2026) — à la différence des autres Edge Functions publiques du
// projet, celle-ci doit répondre à un simple GET sans corps JSON, car elle
// est destinée à être appelée directement par le navigateur d'un site tiers
// via une balise <img src="..."> (widget site web, Google My Business,
// réseaux sociaux) — un <img> ne peut pas envoyer d'en-tête d'autorisation
// ni de corps POST. Le paramètre "org" (organisme_id, non sensible — un
// identifiant d'entreprise, pas un secret) suffit à calculer une moyenne
// PUBLIQUE et anonyme ; aucune donnée personnelle (nom de stagiaire,
// commentaire, etc.) n'est jamais exposée par cette fonction.
//
// GET .../badge-formateur?org=<organisme_id>            -> image SVG (badge)
// GET .../badge-formateur?org=<organisme_id>&format=json -> { moyenne, nbAvis, raisonSociale }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const organismeId = url.searchParams.get("org");
  const format = url.searchParams.get("format") === "json" ? "json" : "svg";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const badgeSvg = (moyenne: number | null, nbAvis: number) => {
    const noteTxt = moyenne !== null ? moyenne.toFixed(1) : "—";
    const etoilesPleines = moyenne !== null ? Math.round(moyenne) : 0;
    let etoiles = "";
    for (let i = 0; i < 5; i++) {
      etoiles += `<text x="${14 + i * 18}" y="46" font-size="18" fill="${i < etoilesPleines ? "#f2901e" : "#e2e2e2"}">★</text>`;
    }
    const sousTexte = nbAvis > 0 ? `${nbAvis} avis` : "Pas encore d'avis";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="90" viewBox="0 0 280 90">
  <rect width="280" height="90" rx="10" fill="#ffffff" stroke="#e5e5e5"/>
  <text x="14" y="24" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="#25245e">Note formateur QualioFlex</text>
  ${etoiles}
  <text x="112" y="46" font-family="Arial,sans-serif" font-size="20" font-weight="bold" fill="#25245e">${noteTxt}/5</text>
  <text x="14" y="70" font-family="Arial,sans-serif" font-size="12" fill="#818284">${sousTexte}</text>
  <text x="266" y="82" font-family="Arial,sans-serif" font-size="9" fill="#c3c3c3" text-anchor="end">qualioflex.fr</text>
</svg>`;
  };

  try {
    if (!organismeId) throw new Error("Paramètre org requis");

    const { data: organisme } = await supabase
      .from("organismes")
      .select("raison_sociale")
      .eq("id", organismeId)
      .maybeSingle();

    if (!organisme) throw new Error("Organisme introuvable");

    // Même agrégation que le tableau de bord privé (NotationsFormateur.tsx),
    // mais on ne renvoie jamais que la moyenne et le nombre d'avis — jamais
    // les commentaires ni l'identité des répondants.
    const valeurs: number[] = [];
    let nbRepondants = 0;

    const { data: stagiairesData } = await supabase
      .from("stagiaires")
      .select(`reponses_evaluation_formateur, sessions:session_id ( formations:formation_id ( organisme_id ) )`);

    (stagiairesData || []).forEach((s: Record<string, unknown>) => {
      const session = s.sessions as Record<string, unknown> | null;
      const formation = session?.formations as Record<string, unknown> | null;
      if (!formation || formation.organisme_id !== organismeId) return;
      const rep = s.reponses_evaluation_formateur as { notes?: Record<string, number> } | null;
      const notes = rep?.notes ? Object.values(rep.notes).filter((v) => typeof v === "number") as number[] : [];
      if (notes.length === 0) return;
      valeurs.push(...notes);
      nbRepondants += 1;
    });

    const { data: clientsEvalData } = await supabase
      .from("evaluations_formateur_clients")
      .select(`reponses, sessions:session_id ( formations:formation_id ( organisme_id ) )`);

    (clientsEvalData || []).forEach((e: Record<string, unknown>) => {
      const session = e.sessions as Record<string, unknown> | null;
      const formation = session?.formations as Record<string, unknown> | null;
      if (!formation || formation.organisme_id !== organismeId) return;
      const rep = e.reponses as { notes?: Record<string, number> } | null;
      const notes = rep?.notes ? Object.values(rep.notes).filter((v) => typeof v === "number") as number[] : [];
      if (notes.length === 0) return;
      valeurs.push(...notes);
      nbRepondants += 1;
    });

    const moyenne = valeurs.length > 0 ? (valeurs.reduce((a, b) => a + b, 0) / valeurs.length / 4) * 5 : null;

    if (format === "json") {
      return new Response(
        JSON.stringify({
          success: true,
          moyenne: moyenne !== null ? Math.round(moyenne * 10) / 10 : null,
          nbAvis: nbRepondants,
          raisonSociale: organisme.raison_sociale || "",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" } }
      );
    }

    return new Response(badgeSvg(moyenne, nbRepondants), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (format === "json") {
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Toujours renvoyer un SVG valide (même en cas d'erreur) pour ne jamais
    // casser l'affichage d'une image cassée chez un tiers qui aurait embed
    // le widget avec un mauvais paramètre.
    return new Response(badgeSvg(null, 0), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=60" },
    });
  }
});
