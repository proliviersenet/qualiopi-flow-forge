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

// Bornes de période — dupliqué à l'identique depuis superadmin-kpis (chaque
// Edge Function est déployée indépendamment, pas de module partagé à ce jour)
// pour que la liste ouverte depuis une carte KPI corresponde exactement au
// chiffre affiché (12/09 : cartes KPI rendues cliquables → liste détaillée).
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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { action, query, organisme_id, session_id, type, periode: periodeBody, reference_date } = await req.json();

    // Point d'entrée pour les cartes KPI cliquables du tableau de bord
    // (SuperAdmin.tsx) : contrairement à "rechercher" (nécessite une saisie
    // texte), "lister" renvoie directement la liste complète correspondant à
    // un KPI donné, sans filtre.
    if (action === "lister") {
      if (type === "formateurs") {
        const { data: organismes, error } = await admin
          .from("organismes")
          .select("id, raison_sociale, nda, siret, email_contact")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;

        const ids = (organismes ?? []).map((o: { id: string }) => o.id);
        const [{ data: clientsCount }, { data: formationsCount }] = await Promise.all([
          ids.length ? admin.from("clients").select("organisme_id").in("organisme_id", ids) : Promise.resolve({ data: [] }),
          ids.length ? admin.from("formations").select("organisme_id").in("organisme_id", ids) : Promise.resolve({ data: [] }),
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

      if (type === "clients") {
        const { data: clients, error } = await admin
          .from("clients")
          .select("id, raison_sociale, contact_email, organisme_id")
          .order("created_at", { ascending: false })
          .limit(300);
        if (error) throw error;

        const orgIds = Array.from(new Set((clients ?? []).map((c: { organisme_id: string }) => c.organisme_id)));
        const { data: orgs } = orgIds.length
          ? await admin.from("organismes").select("id, raison_sociale").in("id", orgIds)
          : { data: [] };
        const nomParOrg: Record<string, string> = {};
        (orgs ?? []).forEach((o: { id: string; raison_sociale: string }) => { nomParOrg[o.id] = o.raison_sociale; });

        return new Response(
          JSON.stringify({
            clients: (clients ?? []).map((c: { id: string; raison_sociale: string; contact_email: string | null; organisme_id: string }) => ({
              ...c,
              organisme_nom: nomParOrg[c.organisme_id] || "—",
            })),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (type === "formations") {
        const { data: formations, error } = await admin
          .from("formations")
          .select("id, titre, statut, organisme_id")
          .eq("statut", "publie")
          .order("created_at", { ascending: false })
          .limit(300);
        if (error) throw error;

        const orgIds = Array.from(new Set((formations ?? []).map((f: { organisme_id: string }) => f.organisme_id)));
        const { data: orgs } = orgIds.length
          ? await admin.from("organismes").select("id, raison_sociale").in("id", orgIds)
          : { data: [] };
        const nomParOrg: Record<string, string> = {};
        (orgs ?? []).forEach((o: { id: string; raison_sociale: string }) => { nomParOrg[o.id] = o.raison_sociale; });

        return new Response(
          JSON.stringify({
            formations: (formations ?? []).map((f: { id: string; titre: string; statut: string; organisme_id: string }) => ({
              ...f,
              organisme_nom: nomParOrg[f.organisme_id] || "—",
            })),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (type === "sessions_periode") {
        const p: Periode = (["mois", "trimestre", "semestre", "annee"] as const).includes(periodeBody) ? periodeBody : "mois";
        const refDate = reference_date ? new Date(reference_date) : new Date();
        const nbMois = moisParPeriode(p);
        const debut = debutPeriode(refDate, p);
        const fin = ajouterMois(debut, nbMois);

        const { data: sessions, error } = await admin
          .from("sessions")
          .select("id, date_debut, statut, formation_id, client_id")
          .gte("date_debut", debut.toISOString())
          .lt("date_debut", fin.toISOString())
          .order("date_debut", { ascending: false })
          .limit(300);
        if (error) throw error;

        const formationIds = Array.from(new Set((sessions ?? []).map((s: { formation_id: string }) => s.formation_id)));
        const clientIds = Array.from(new Set((sessions ?? []).map((s: { client_id: string }) => s.client_id)));
        const [{ data: formations }, { data: clients }] = await Promise.all([
          formationIds.length ? admin.from("formations").select("id, titre, organisme_id").in("id", formationIds) : Promise.resolve({ data: [] }),
          clientIds.length ? admin.from("clients").select("id, raison_sociale").in("id", clientIds) : Promise.resolve({ data: [] }),
        ]);
        const orgIds = Array.from(new Set((formations ?? []).map((f: { organisme_id: string }) => f.organisme_id)));
        const { data: orgs } = orgIds.length
          ? await admin.from("organismes").select("id, raison_sociale").in("id", orgIds)
          : { data: [] };

        const formationMap: Record<string, { titre: string; organisme_id: string }> = {};
        (formations ?? []).forEach((f: { id: string; titre: string; organisme_id: string }) => { formationMap[f.id] = f; });
        const clientMap: Record<string, string> = {};
        (clients ?? []).forEach((c: { id: string; raison_sociale: string }) => { clientMap[c.id] = c.raison_sociale; });
        const orgMap: Record<string, string> = {};
        (orgs ?? []).forEach((o: { id: string; raison_sociale: string }) => { orgMap[o.id] = o.raison_sociale; });

        return new Response(
          JSON.stringify({
            sessions: (sessions ?? []).map((s: { id: string; date_debut: string | null; statut: string; formation_id: string; client_id: string }) => {
              const f = formationMap[s.formation_id];
              return {
                id: s.id,
                date_debut: s.date_debut,
                statut: s.statut,
                formation_titre: f?.titre || "Formation",
                client_nom: clientMap[s.client_id] || "—",
                organisme_id: f?.organisme_id || null,
                organisme_nom: f ? (orgMap[f.organisme_id] || "—") : "—",
              };
            }),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (type === "journal") {
        // Chantier "audit trail" (14/09) : consultation du journal générique
        // posé en trigger SQL sur organismes/formations/sessions/clients/
        // documents_formation/profiles (voir migration
        // 20260914120000_journal_modifications.sql). Ce journal est
        // volontairement inaccessible sans la clé service_role — seule
        // cette Edge Function (réservée à l'administrateur) peut le lire.
        const { data: entrees, error } = await admin
          .from("journal_modifications")
          .select("id, table_source, operation, enregistrement_id, ancien_contenu, nouveau_contenu, utilisateur_id, modifie_le")
          .order("modifie_le", { ascending: false })
          .limit(150);
        if (error) throw error;

        const userIds = Array.from(new Set((entrees ?? []).map((e: { utilisateur_id: string | null }) => e.utilisateur_id).filter((id): id is string => !!id)));
        const { data: profils } = userIds.length
          ? await admin.from("profiles").select("id, email, nom_complet").in("id", userIds)
          : { data: [] };
        const profilParUser: Record<string, { email: string; nom_complet: string }> = {};
        (profils ?? []).forEach((p: { id: string; email: string; nom_complet: string }) => { profilParUser[p.id] = p; });

        const resume = (tableSource: string, contenu: Record<string, unknown> | null) => {
          if (!contenu) return "—";
          switch (tableSource) {
            case "organismes": return (contenu.raison_sociale as string) || "—";
            case "formations": return (contenu.titre as string) || "—";
            case "clients": return (contenu.raison_sociale as string) || "—";
            case "profiles": return (contenu.email as string) || (contenu.nom_complet as string) || "—";
            case "documents_formation": return (contenu.type as string) || "—";
            case "sessions": return (contenu.date_debut as string) ? `Session du ${contenu.date_debut}` : "—";
            default: return "—";
          }
        };

        return new Response(
          JSON.stringify({
            journal: (entrees ?? []).map((e: {
              id: number; table_source: string; operation: string; enregistrement_id: string | null;
              ancien_contenu: Record<string, unknown> | null; nouveau_contenu: Record<string, unknown> | null;
              utilisateur_id: string | null; modifie_le: string;
            }) => ({
              id: e.id,
              table_source: e.table_source,
              operation: e.operation,
              enregistrement_id: e.enregistrement_id,
              resume: resume(e.table_source, e.nouveau_contenu || e.ancien_contenu),
              utilisateur_email: e.utilisateur_id ? (profilParUser[e.utilisateur_id]?.email || "—") : "— (action système)",
              modifie_le: e.modifie_le,
            })),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ error: "Type de liste inconnu." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "rechercher") {
      const q = (query || "").trim();
      if (q.length < 2) return new Response(JSON.stringify({ organismes: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Recherche directe sur l'organisme (raison sociale, NDA, SIRET, email
      // de contact déclaré à l'inscription).
      const { data: orgsDirects, error: errOrgs } = await admin
        .from("organismes")
        .select("id, raison_sociale, nda, siret, email_contact")
        .or(`raison_sociale.ilike.%${q}%,nda.ilike.%${q}%,siret.ilike.%${q}%,email_contact.ilike.%${q}%`)
        .limit(20);
      if (errOrgs) throw errOrgs;

      // Recherche complémentaire sur le nom/email du formateur lui-même (table
      // profiles) : un recherche souvent par le nom de la personne plutôt que
      // par la raison sociale de son entreprise — bug constaté le 14/09
      // (Olivier cherche "jean-pascal mollet", introuvable alors que son
      // organisme existe bien sous le nom "DAC CONSEIL ET FORMATION").
      const { data: profilsMatch, error: errProfils } = await admin
        .from("profiles")
        .select("organisme_id, nom_complet, email")
        .or(`nom_complet.ilike.%${q}%,email.ilike.%${q}%`)
        .not("organisme_id", "is", null)
        .limit(20);
      if (errProfils) throw errProfils;

      const idsDejaTrouves = new Set((orgsDirects ?? []).map((o: { id: string }) => o.id));
      const idsSupplementaires = Array.from(new Set(
        (profilsMatch ?? [])
          .map((p: { organisme_id: string | null }) => p.organisme_id)
          .filter((id): id is string => !!id && !idsDejaTrouves.has(id))
      ));
      const { data: orgsSupplementaires } = idsSupplementaires.length
        ? await admin.from("organismes").select("id, raison_sociale, nda, siret, email_contact").in("id", idsSupplementaires)
        : { data: [] };

      const organismes = [...(orgsDirects ?? []), ...(orgsSupplementaires ?? [])];
      const ids = organismes.map((o: { id: string }) => o.id);
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
