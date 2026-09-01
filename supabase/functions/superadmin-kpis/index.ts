import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Chantier "superadmin" (28/08) : KPI plateforme pour le tableau de bord réservé
// à Olivier. Même pattern d'auth que lister-demandes-suppression : JWT vérifié,
// email comparé à ADMIN_EMAIL, puis client service-role pour traverser tous les
// organismes (RLS bypass volontaire et contrôlé, aucune policy authenticated
// large n'a été ouverte pour ça — voir la migration superadmin_bugs_abonnements).
//
// Important sur le CA : aucune intégration de facturation automatique
// (Stripe...) n'existe à ce jour dans QualioFlex. Les deux composantes du CA
// renvoyées ici sont donc des ESTIMATIONS :
// - ca_abonnements_centimes : régime mensuel équivalent des abonnements
//   actuellement actifs (table abonnements_organismes, alimentée à la main par
//   Olivier), multiplié par le nombre de mois de la période. Ce n'est PAS un
//   historique réel de facturation (pas de table de factures à ce jour).
// - ca_formations_centimes : somme de formations.montant_ht (champ numérique
//   optionnel, distinct du texte libre "tarif") pour chaque session démarrée
//   dans la période. Les formations sans montant_ht renseigné comptent pour 0.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL = "olivier@exsenco.fr";

type Periode = "mois" | "trimestre" | "semestre" | "annee";

function debutPeriode(ref: Date, periode: Periode): Date {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  if (periode === "mois") return new Date(Date.UTC(y, m, 1));
  if (periode === "trimestre") return new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1));
  if (periode === "semestre") return new Date(Date.UTC(y, m < 6 ? 0 : 6, 1));
  return new Date(Date.UTC(y, 0, 1));
}

function moisParPeriode(periode: Periode): number {
  return { mois: 1, trimestre: 3, semestre: 6, annee: 12 }[periode];
}

function ajouterMois(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
      return new Response(
        JSON.stringify({ error: "Action réservée à l'administrateur QualioFlex." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const periode: Periode = ["mois", "trimestre", "semestre", "annee"].includes(body?.periode) ? body.periode : "mois";
    const refDate = body?.reference_date ? new Date(body.reference_date) : new Date();

    const nbMois = moisParPeriode(periode);
    const debut = debutPeriode(refDate, periode);
    const fin = ajouterMois(debut, nbMois);
    const debutPrec = ajouterMois(debut, -nbMois);
    const finPrec = debut;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const [
      { count: nbFormateurs },
      { count: nbClients },
      { count: nbFormationsDisponibles },
      { data: sessionsPeriode },
      { count: nbSessionsPeriodePrec },
      { data: abonnementsActifs },
      { count: nbBugsNouveaux },
    ] = await Promise.all([
      admin.from("organismes").select("id", { count: "exact", head: true }),
      admin.from("clients").select("id", { count: "exact", head: true }),
      admin.from("formations").select("id", { count: "exact", head: true }).eq("statut", "publie"),
      admin
        .from("sessions")
        .select("id, formation_id, date_debut, formations:formation_id(montant_ht)")
        .gte("date_debut", debut.toISOString())
        .lt("date_debut", fin.toISOString()),
      admin
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .gte("date_debut", debutPrec.toISOString())
        .lt("date_debut", finPrec.toISOString()),
      admin
        .from("abonnements_organismes")
        .select("montant_centimes, periodicite")
        .eq("statut", "actif"),
      admin.from("bugs").select("id", { count: "exact", head: true }).eq("statut", "nouveau"),
    ]);

    const nbSessionsPeriode = sessionsPeriode?.length ?? 0;
    const croissancePct = (nbSessionsPeriodePrec ?? 0) > 0
      ? Math.round(((nbSessionsPeriode - (nbSessionsPeriodePrec ?? 0)) / (nbSessionsPeriodePrec ?? 1)) * 1000) / 10
      : (nbSessionsPeriode > 0 ? 100 : 0);

    const caFormationsCentimes = (sessionsPeriode ?? []).reduce((sum: number, s: { formations?: { montant_ht: number | null } | { montant_ht: number | null }[] }) => {
      const f = Array.isArray(s.formations) ? s.formations[0] : s.formations;
      const montant = f?.montant_ht ? Math.round(f.montant_ht * 100) : 0;
      return sum + montant;
    }, 0);
    const nbSessionsAvecPrix = (sessionsPeriode ?? []).filter((s: { formations?: { montant_ht: number | null } | { montant_ht: number | null }[] }) => {
      const f = Array.isArray(s.formations) ? s.formations[0] : s.formations;
      return !!f?.montant_ht;
    }).length;

    const mensuelEquivalent = (abonnementsActifs ?? []).reduce((sum: number, a: { montant_centimes: number; periodicite: string }) => {
      return sum + (a.periodicite === "mensuel" ? a.montant_centimes : Math.round(a.montant_centimes / 12));
    }, 0);
    const caAbonnementsCentimes = mensuelEquivalent * nbMois;

    return new Response(
      JSON.stringify({
        periode,
        debut: debut.toISOString(),
        fin: fin.toISOString(),
        nb_formateurs: nbFormateurs ?? 0,
        nb_clients: nbClients ?? 0,
        clients_par_formateur: (nbFormateurs ?? 0) > 0 ? Math.round(((nbClients ?? 0) / (nbFormateurs ?? 1)) * 10) / 10 : 0,
        nb_formations_disponibles: nbFormationsDisponibles ?? 0,
        nb_formations_produites_periode: nbSessionsPeriode,
        nb_formations_produites_periode_precedente: nbSessionsPeriodePrec ?? 0,
        croissance_pct: croissancePct,
        ca_abonnements_centimes: caAbonnementsCentimes,
        ca_formations_centimes: caFormationsCentimes,
        ca_total_centimes: caAbonnementsCentimes + caFormationsCentimes,
        nb_sessions_avec_prix_renseigne: nbSessionsAvecPrix,
        nb_sessions_sans_prix: nbSessionsPeriode - nbSessionsAvecPrix,
        nb_abonnements_actifs: abonnementsActifs?.length ?? 0,
        nb_bugs_nouveaux: nbBugsNouveaux ?? 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("Erreur superadmin-kpis:", e);
    return new Response(
      JSON.stringify({ error: "Erreur serveur lors du calcul des KPI." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
