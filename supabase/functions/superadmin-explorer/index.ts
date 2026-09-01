import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Chantier "superadmin" (28/08) : explorateur transverse pour intervention SAV
// (ex: "récupérer un doc et le renvoyer"). Même pattern d'auth que
// lister-demandes-suppression (JWT + ADMIN_EMAIL + service role). Trois
// actions selon le niveau de détail demandé par la page SuperAdminExplorer.tsx :
// - "rechercher" : liste d'organismes correspondant à une recherche texte
// - "organisme"  : détail d'un organisme (clients, formations, sessions)
// - "session"    : détail d'une session (documents générés + stagiaires) pour
//                  pouvoir régénérer/renvoyer un document précis. La régénération
//                  elle-même n'a pas besoin de passer par cette fonction : les
//                  generer-livret/generer-emargement/generer-devis/
//                  generer-convention n'ont aucun contrôle de propriétaire (déjà
//                  vérifié pendant le chantier sous-traitance) — le frontend les
//                  appelle directement avec le session_id renvoyé ici.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL = "olivier@exsenco.fr";

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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { action, query, organisme_id, session_id } = await req.json();

    if (action === "rechercher") {
      const q = (query || "").trim();
      if (q.length < 2) return new Response(JSON.stringify({ organismes: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: organismes, error } = await admin
        .from("organismes")
        .select("id, raison_sociale, nda, siret, email_contact")
        .or(`raison_sociale.ilike.%${q}%,nda.ilike.%${q}%,siret.ilike.%${q}%`)
        .limit(20);
      if (error) throw error;

      const ids = (organismes ?? []).map((o: { id: string }) => o.id);
      const [{ data: clientsCount }, { data: formationsCount }] = await Promise.all([
        admin.from("clients").select("organisme_id").in("organisme_id", ids),
        admin.from("formations").select("organisme_id").in("organisme_id", ids),
      ]);
      const nbClientsParOrg: Record<string, number> = {};
      (clientsCount ?? []).forEach((c: { organisme_id: string }) => { nbClientsParOrg[c.organisme_id] = (nbClientsParOrg[c.organisme_id] || 0) + 1; });
      const nbFormationsParOrg: Record<string, number> = {};
      (formationsCount ?? []).forEach((f: { organisme_id: string }) => { nbFormationsParOrg[f.organisme_id] = (nbFormationsParOrg[f.organisme_id] || 0) + 1; });

      return new Response(
        JSON.stringify({
          organismes: (organismes ?? []).map((o: { id: string; raison_sociale: string; nda: string; siret: string; email_contact: string }) => ({
            ...o,
            nb_clients: nbClientsParOrg[o.id] || 0,
            nb_formations: nbFormationsParOrg[o.id] || 0,
          })),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "organisme") {
      if (!organisme_id) throw new Error("organisme_id requis");
      const [{ data: organisme }, { data: clients }, { data: formations }, { data: abonnement }] = await Promise.all([
        admin.from("organismes").select("*").eq("id", organisme_id).maybeSingle(),
        admin.from("clients").select("id, raison_sociale, contact_email, siret").eq("organisme_id", organisme_id).order("raison_sociale"),
        admin.from("formations").select("id, titre, statut, tarif, montant_ht").eq("organisme_id", organisme_id).order("created_at", { ascending: false }),
        admin.from("abonnements_organismes").select("*").eq("organisme_id", organisme_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!organisme) return new Response(JSON.stringify({ error: "Organisme introuvable." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const formationIds = (formations ?? []).map((f: { id: string }) => f.id);
      const { data: sessions } = formationIds.length
        ? await admin
          .from("sessions")
          .select("id, formation_id, client_id, date_debut, date_fin, lieu, statut, formations:formation_id(titre), clients:client_id(raison_sociale)")
          .in("formation_id", formationIds)
          .order("date_debut", { ascending: false })
        : { data: [] };

      return new Response(
        JSON.stringify({ organisme, clients: clients ?? [], formations: formations ?? [], sessions: sessions ?? [], abonnement: abonnement ?? null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "session") {
      if (!session_id) throw new Error("session_id requis");
      const [{ data: session }, { data: documents }, { data: stagiaires }] = await Promise.all([
        admin
          .from("sessions")
          .select("id, date_debut, date_fin, lieu, statut, formations:formation_id(titre), clients:client_id(id, raison_sociale, contact_email)")
          .eq("id", session_id)
          .maybeSingle(),
        admin.from("documents_formation").select("id, type, contenu_html, fichier_url").eq("session_id", session_id),
        admin.from("stagiaires").select("id, nom, prenom, email, telephone").eq("session_id", session_id).order("nom"),
      ]);
      if (!session) return new Response(JSON.stringify({ error: "Session introuvable." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      return new Response(
        JSON.stringify({
          session,
          documents: (documents ?? []).map((d: { id: string; type: string; contenu_html: string | null; fichier_url: string | null }) => ({
            id: d.id, type: d.type, genere: !!d.contenu_html || !!d.fichier_url,
          })),
          stagiaires: stagiaires ?? [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Action inconnue." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("Erreur superadmin-explorer:", e);
    return new Response(
      JSON.stringify({ error: "Erreur serveur." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
