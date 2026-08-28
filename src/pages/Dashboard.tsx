import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import DashboardCard from '@/components/DashboardCard';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";

const COLORS = ['#4CAF50', '#8BC34A', '#FFC107', '#FF9800', '#F44336'];

// Badge d'alerte "Actions requises" cliquable — ouvre la liste précise des
// dossiers concernés, chacun lié vers la fiche client où traiter le problème.
// Corrige le point remonté par Olivier le 17/08 : les alertes n'atterrissaient
// nulle part auparavant.
const AlerteDetailPopover = ({
  icone,
  texte,
  items,
}: {
  icone: string;
  texte: string;
  items: { clientId: string | null; sessionId?: string | null; stagiaireId?: string | null; label: string }[];
}) => (
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" className="underline decoration-dotted hover:text-amber-900 transition-colors">
        {icone} {texte}
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-80 max-h-72 overflow-y-auto">
      <p className="text-xs font-medium text-gray-500 mb-2">Cliquez pour ouvrir la liste des formations du client :</p>
      <div className="space-y-1">
        {items.length === 0 && <p className="text-xs text-gray-400">Détail indisponible.</p>}
        {items.map((item, i) => {
          if (!item.clientId) {
            return (
              <Link
                key={i}
                to="/clients"
                className="block text-sm text-exsenco-blue hover:underline py-1 px-2 -mx-2 rounded hover:bg-gray-50"
              >
                {item.label} <span className="text-gray-400">(voir Clients)</span>
              </Link>
            );
          }
          // Le lien mène toujours à la liste des formations du client (jamais
          // directement au document manquant) — le paramètre ?session=/?stagiaire=
          // sert uniquement à surligner et scroller jusqu'à la bonne ligne une
          // fois sur cette liste, pour éviter d'avoir à la chercher à la main.
          const params = new URLSearchParams();
          if (item.sessionId) params.set("session", item.sessionId);
          if (item.stagiaireId) params.set("stagiaire", item.stagiaireId);
          const query = params.toString();
          return (
            <Link
              key={i}
              to={`/clients/${item.clientId}${query ? `?${query}` : ""}`}
              className="block text-sm text-exsenco-blue hover:underline py-1 px-2 -mx-2 rounded hover:bg-gray-50"
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </PopoverContent>
  </Popover>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };
  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [organisme, setOrganisme] = useState<Record<string, unknown> | null>(null);
  const [stats, setStats] = useState<{
    formations: number;
    sessions: number;
    beneficiaires: number;
    tauxSatisfaction: number;
    documentsEnAttente: number;
    relancesEnAttente: number;
    questionnairesEnAttente: number;
    indicateursOk: number;
    noteFormateur: number | null;
    nbAvisFormateur: number;
  }>({
    formations: 0,
    sessions: 0,
    beneficiaires: 0,
    tauxSatisfaction: 0,
    documentsEnAttente: 0,
    relancesEnAttente: 0,
    questionnairesEnAttente: 0,
    indicateursOk: 0,
    noteFormateur: null,
    nbAvisFormateur: 0,
  });
  const [sessionsRecentes, setSessionsRecentes] = useState<Record<string, unknown>[]>([]);
  const [documentsEnAttenteDetail, setDocumentsEnAttenteDetail] = useState<{ clientId: string | null; sessionId: string | null; label: string }[]>([]);
  const [questionnairesEnAttenteDetail, setQuestionnairesEnAttenteDetail] = useState<{ clientId: string | null; stagiaireId: string | null; label: string }[]>([]);
  const [satisfactionData, setSatisfactionData] = useState<{ name: string; value: number }[]>([]);
  // Chantier "sous-traitance" (28/08) : sessions confiées par un AUTRE organisme, où
  // je suis le formateur sous-traitant actif — distinct des stats ci-dessus (qui ne
  // portent que sur mes propres formations/clients), affiché à part pour ne pas les
  // fausser.
  const [sessionsSousTraitance, setSessionsSousTraitance] = useState<{
    session_id: string; formation_titre: string; organisme_demandeur_nom: string; date_debut: string | null;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate('/login'); return; }
    // Point non bloquant (audit test grandeur réelle 01/08) : un compte client
    // (role=client) pouvait naviguer directement sur cette page réservée au
    // formateur — pas de fuite de données (RLS scope déjà par organisme_id),
    // mais l'interface formateur restait accessible. On redirige vers son
    // propre espace, comme déjà fait sur EspaceClient/VeilleQualiopi/etc.
    if (authSession.user.user_metadata?.role === "client") { navigate('/espace-client'); return; }

    const init = async () => {
      const u = authSession.user;
      setUser({ name: u.user_metadata?.nom_complet || u.email || '', email: u.email || '', profileImage: '' });

      // Récupérer le profil + organisme
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, organisme_id')
        .eq('id', u.id)
        .single();

      if (profile?.organisme_id) {
        const { data: org } = await supabase
          .from('organismes')
          .select('*')
          .eq('id', profile.organisme_id)
          .single();
        setOrganisme(org);

        // Stats formations
        const { count: nbFormations } = await supabase
          .from('formations')
          .select('*', { count: 'exact', head: true })
          .eq('organisme_id', profile.organisme_id)
          .eq('statut', 'publie');

        // IDs des formations de l'organisme (toutes, pas seulement publiées) — sert de
        // périmètre pour scoper sessions/documents/signatures à CET organisme. Sans ce
        // filtre, les requêtes ci-dessous remontaient les données de TOUS les organismes
        // de la plateforme (bug multi-tenant : deux formateurs différents auraient vu les
        // mêmes chiffres) — invisible avec un seul organisme, critique dès qu'il y en a
        // plusieurs sur la plateforme.
        const { data: formationsOrg } = await supabase
          .from('formations')
          .select('id, titre')
          .eq('organisme_id', profile.organisme_id);
        const formationIds = (formationsOrg || []).map((f: { id: string }) => f.id);
        const formationTitreMap: Record<string, string> = {};
        (formationsOrg || []).forEach((f: { id: string; titre?: string }) => { formationTitreMap[f.id] = f.titre || 'Formation'; });

        // Stats sessions — scopées aux formations de l'organisme.
        const { data: sessions } = formationIds.length > 0
          ? await supabase
              .from('sessions')
              .select('id, statut, date_debut, date_fin, formations(titre)')
              .in('formation_id', formationIds)
              .order('date_debut', { ascending: false })
              .limit(5)
          : { data: [] as Record<string, unknown>[] };

        const { count: nbSessions } = formationIds.length > 0
          ? await supabase
              .from('sessions')
              .select('*', { count: 'exact', head: true })
              .eq('statut', 'terminee')
              .in('formation_id', formationIds)
          : { count: 0 };

        // Toutes les sessions de l'organisme (tous statuts) — périmètre pour les
        // documents/signatures ci-dessous. client_id/formation_id récupérés en plus
        // pour pouvoir faire pointer les alertes "Actions requises" directement vers
        // la fiche client concernée (point non bloquant remonté par Olivier : les
        // alertes n'atterrissaient nulle part).
        const { data: allSessionsOrg } = formationIds.length > 0
          ? await supabase.from('sessions').select('id, client_id, formation_id').in('formation_id', formationIds)
          : { data: [] as { id: string; client_id: string | null; formation_id: string | null }[] };
        const sessionIds = (allSessionsOrg || []).map((s: { id: string }) => s.id);
        const sessionInfoMap: Record<string, { clientId: string | null; formationId: string | null }> = {};
        (allSessionsOrg || []).forEach((s: { id: string; client_id: string | null; formation_id: string | null }) => {
          sessionInfoMap[s.id] = { clientId: s.client_id, formationId: s.formation_id };
        });

        // Stats bénéficiaires — la table "beneficiaires" est un reliquat d'un ancien
        // schéma, plus alimentée par le reste de l'app (confirmé : aucun autre écran
        // n'y écrit). Les vrais stagiaires vivent dans "stagiaires", rattachés à
        // l'organisme via clients.organisme_id (pas de colonne organisme_id directe
        // sur stagiaires, donc on passe par la liste des clients de l'organisme).
        const { data: clientsOrg } = await supabase
          .from('clients')
          .select('id, raison_sociale')
          .eq('organisme_id', profile.organisme_id);
        const clientIds = (clientsOrg || []).map((c: { id: string }) => c.id);
        const clientNomMap: Record<string, string> = {};
        (clientsOrg || []).forEach((c: { id: string; raison_sociale?: string }) => { clientNomMap[c.id] = c.raison_sociale || 'Client'; });

        const { count: nbBenef, data: stagiairesOrg } = clientIds.length > 0
          ? await supabase
              .from('stagiaires')
              .select('id, nom, prenom, client_id, session_id, doc_questionnaire_avant, reponses_evaluation_chaud, reponses_evaluation_formateur', { count: 'exact' })
              .in('client_id', clientIds)
          : {
              count: 0,
              data: [] as {
                id: string;
                nom?: string;
                prenom?: string;
                client_id?: string | null;
                session_id?: string | null;
                doc_questionnaire_avant?: string | null;
                reponses_evaluation_chaud?: { notes?: Record<string, number> } | null;
                reponses_evaluation_formateur?: { notes?: Record<string, number> } | null;
              }[],
            };

        // Documents en attente de signature — scopés à l'organisme via les formations/
        // sessions ci-dessus (les signatures pointent sur documents_formation, rattaché
        // soit à une formation soit à une session). Avant ce correctif, cette requête
        // n'était filtrée par aucun organisme et remontait les signatures de toute la
        // plateforme, pas seulement celles de l'organisme connecté.
        let nbDocs = 0;
        // Détail par client des documents en attente (point non bloquant du 17/08 :
        // l'alerte "Actions requises" ne menait nulle part — chaque entrée pointe
        // maintenant vers la fiche du client concerné).
        const documentsEnAttenteDetail: { clientId: string | null; sessionId: string | null; label: string }[] = [];
        if (formationIds.length > 0 || sessionIds.length > 0) {
          const orParts: string[] = [];
          if (formationIds.length > 0) orParts.push(`formation_id.in.(${formationIds.join(',')})`);
          if (sessionIds.length > 0) orParts.push(`session_id.in.(${sessionIds.join(',')})`);
          const { data: docsOrg } = await supabase
            .from('documents_formation')
            .select('id, type, session_id, formation_id')
            .or(orParts.join(','));
          const docsById: Record<string, { type?: string; session_id?: string | null; formation_id?: string | null }> = {};
          (docsOrg || []).forEach((d: { id: string; type?: string; session_id?: string | null; formation_id?: string | null }) => {
            docsById[d.id] = d;
          });
          const docIds = Object.keys(docsById);
          if (docIds.length > 0) {
            const { data: sigsEnAttente, count } = await supabase
              .from('signatures')
              .select('document_id', { count: 'exact' })
              .eq('statut', 'en_attente')
              .in('document_id', docIds);
            nbDocs = count || 0;
            (sigsEnAttente || []).forEach((sig: { document_id: string }) => {
              const doc = docsById[sig.document_id];
              if (!doc) return;
              const sessionInfo = doc.session_id ? sessionInfoMap[doc.session_id] : undefined;
              const clientId = sessionInfo?.clientId || null;
              const formationId = sessionInfo?.formationId || doc.formation_id || null;
              const typeLabel = doc.type ? doc.type.charAt(0).toUpperCase() + doc.type.slice(1) : 'Document';
              const formationTitre = formationId ? formationTitreMap[formationId] : undefined;
              const clientNom = clientId ? clientNomMap[clientId] : undefined;
              documentsEnAttenteDetail.push({
                clientId,
                sessionId: doc.session_id || null,
                label: `${typeLabel}${formationTitre ? ' — ' + formationTitre : ''}${clientNom ? ' (' + clientNom + ')' : ''}`,
              });
            });
          }
        }

        // Relances en attente — remis à 0 : "envoyer-relance" envoie l'email/SMS mais
        // n'écrit dans aucune table de suivi aujourd'hui (confirmé à la lecture de
        // l'edge function), la table "relances" ne reflète donc rien de réel.
        const nbRelances = 0;

        // Questionnaires non complétés — calculé directement sur les vrais stagiaires
        // de l'organisme (doc_questionnaire_avant non signé), au lieu de la table
        // "enquetes_preformation" qui n'est alimentée par aucun autre écran. Détail
        // par stagiaire pour que l'alerte pointe directement vers la bonne fiche
        // client (même correctif que documentsEnAttenteDetail ci-dessus).
        const stagiairesQuestionnaireEnAttente = (stagiairesOrg || []).filter(
          (s) => s.doc_questionnaire_avant !== 'signe'
        );
        const nbQuestionnaires = stagiairesQuestionnaireEnAttente.length;
        const questionnairesEnAttenteDetail = stagiairesQuestionnaireEnAttente.map((s) => ({
          clientId: s.client_id || null,
          stagiaireId: s.id || null,
          label: `${s.prenom || ''} ${s.nom || ''}`.trim() + (s.client_id && clientNomMap[s.client_id] ? ` (${clientNomMap[s.client_id]})` : ''),
        }));

        // Indicateurs Qualiopi OK
        const { count: nbIndicateurs } = await supabase
          .from('checklist_items')
          .select('*', { count: 'exact', head: true })
          .eq('organisme_id', profile.organisme_id)
          .eq('statut', 'ok');

        // Taux de satisfaction — calculé à partir des vraies réponses de l'évaluation
        // à chaud (reponses_evaluation_chaud, échelle 0 à 4 par question), au lieu de
        // la table "evaluations_formations"/note_globale qui n'est alimentée par aucun
        // autre écran de l'application.
        const notes: number[] = [];
        (stagiairesOrg || []).forEach((s) => {
          const reponses = s.reponses_evaluation_chaud?.notes || {};
          Object.values(reponses).forEach((v) => { if (typeof v === 'number') notes.push(v); });
        });
        const tauxSat = notes.length > 0
          ? Math.round((notes.reduce((a: number, b: number) => a + b, 0) / notes.length / 4) * 100)
          : 0;

        // Note formateur (point non bloquant #E2 de l'audit du 16/08 : absente du
        // Dashboard principal jusqu'ici, visible uniquement sur /notations-formateur).
        // Même logique de calcul que NotationsFormateur.tsx : notes 0-4 par question,
        // toutes questions confondues, moyenne convertie sur 5. Les avis stagiaires
        // (reponses_evaluation_formateur) et clients (evaluations_formateur_clients.
        // reponses) sont agrégés ensemble. Important : "nombre d'avis" compte les
        // RÉPONDANTS (une entrée par stagiaire/client ayant répondu), pas les notes
        // individuelles — sinon un seul répondant ayant noté sur plusieurs questions
        // gonflerait artificiellement le compteur (ex: 1 répondant × 6 questions
        // affichait à tort "6 avis"), en écart avec le "1" affiché sur
        // /notations-formateur pour les mêmes données.
        const notesFormateur: number[] = [];
        let nbAvisFormateur = 0;
        (stagiairesOrg || []).forEach((s) => {
          const reponses = s.reponses_evaluation_formateur?.notes || {};
          const valeurs = Object.values(reponses).filter((v) => typeof v === 'number');
          if (valeurs.length > 0) { notesFormateur.push(...valeurs); nbAvisFormateur++; }
        });
        if (sessionIds.length > 0) {
          const { data: evalsClients } = await supabase
            .from('evaluations_formateur_clients')
            .select('reponses')
            .in('session_id', sessionIds);
          (evalsClients || []).forEach((e: { reponses?: { notes?: Record<string, number> } | null }) => {
            const reponses = e.reponses?.notes || {};
            const valeurs = Object.values(reponses).filter((v) => typeof v === 'number');
            if (valeurs.length > 0) { notesFormateur.push(...valeurs); nbAvisFormateur++; }
          });
        }
        const noteFormateur = notesFormateur.length > 0
          ? Math.round((notesFormateur.reduce((a, b) => a + b, 0) / notesFormateur.length / 4) * 5 * 10) / 10
          : null;

        setStats({
          formations: nbFormations || 0,
          sessions: nbSessions || 0,
          beneficiaires: nbBenef || 0,
          tauxSatisfaction: tauxSat,
          documentsEnAttente: nbDocs || 0,
          relancesEnAttente: nbRelances || 0,
          questionnairesEnAttente: nbQuestionnaires || 0,
          indicateursOk: nbIndicateurs || 0,
          noteFormateur,
          nbAvisFormateur,
        });
        setDocumentsEnAttenteDetail(documentsEnAttenteDetail);
        setQuestionnairesEnAttenteDetail(questionnairesEnAttenteDetail);

        setSessionsRecentes((sessions || []) as Record<string, unknown>[]);

        // Données satisfaction pour graphique — notes sur une échelle 0 à 4 (même
        // échelle que reponses_evaluation_chaud), donc bucket direct par valeur
        // arrondie plutôt que la formule "/5" qui supposait une échelle sur 5.
        if (notes.length > 0) {
          const tranches = [0, 0, 0, 0, 0];
          notes.forEach((n: number) => {
            const idx = Math.max(0, Math.min(4, Math.round(n)));
            tranches[4 - idx]++;
          });
          setSatisfactionData([
            { name: 'Très satisfait', value: tranches[0] },
            { name: 'Satisfait', value: tranches[1] },
            { name: 'Neutre', value: tranches[2] },
            { name: 'Insatisfait', value: tranches[3] },
            { name: 'Très insatisfait', value: tranches[4] },
          ].filter(d => d.value > 0));
        }
      }

      // Chantier "sous-traitance" (28/08) : sessions où je suis sous-traitant actif,
      // indépendamment de l'organisme_id de mon propre profil (elles appartiennent à
      // l'organisme qui a sous-traité, pas au mien).
      const { data: sousTraitances } = await supabase
        .from("sessions_sous_traitance")
        .select("session_id, organisme_demandeur_id, session:session_id(date_debut, formation:formation_id(titre))")
        .eq("profile_sous_traitant_id", u.id)
        .eq("statut", "actif");
      if (sousTraitances && sousTraitances.length > 0) {
        const demandeurIds = Array.from(new Set(sousTraitances.map((s: { organisme_demandeur_id: string }) => s.organisme_demandeur_id)));
        const { data: orgsD } = await supabase.from("organismes").select("id, raison_sociale").in("id", demandeurIds);
        const nomParOrg: Record<string, string> = {};
        (orgsD as { id: string; raison_sociale: string }[] || []).forEach(o => { nomParOrg[o.id] = o.raison_sociale; });
        setSessionsSousTraitance(sousTraitances.map((s: { session_id: string; organisme_demandeur_id: string; session: { date_debut: string | null; formation: { titre: string } | null } | null }) => ({
          session_id: s.session_id,
          formation_titre: s.session?.formation?.titre || "Formation",
          organisme_demandeur_nom: nomParOrg[s.organisme_demandeur_id] || "Un formateur",
          date_debut: s.session?.date_debut || null,
        })));
      }

      setLoading(false);
    };
    init();
  }, [navigate, authSession, authLoading]);

  const statsData = [
    {
      title: "Formations publiées",
      value: loading ? "..." : String(stats.formations),
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
      trend: "up" as const,
      trendValue: "Actives",
      to: "/formations",
    },
    {
      title: "Bénéficiaires",
      value: loading ? "..." : String(stats.beneficiaires),
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
      trend: "up" as const,
      trendValue: "Total inscrits",
      to: "/clients",
    },
    {
      title: "Sessions terminées",
      value: loading ? "..." : String(stats.sessions),
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      trend: "neutral" as const,
      trendValue: "Clôturées",
      detail: "Nombre de sessions passées au statut \"terminée\", tous formats confondus. Le détail par session (dates, stagiaires, documents) se consulte dans la fiche de chaque formation, via l'onglet \"Clients\" du client concerné.",
    },
    {
      title: "Taux de satisfaction",
      value: loading ? "..." : stats.tauxSatisfaction > 0 ? `${stats.tauxSatisfaction}%` : "—",
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" /></svg>,
      trend: "up" as const,
      trendValue: "Évaluations reçues",
      detail: "Calculé à partir des réponses à l'évaluation \"à chaud\" remplie par les stagiaires en fin de session (échelle de 0 à 4 par question), moyenne de toutes les réponses reçues, converties en pourcentage. Se met à jour automatiquement à chaque nouvelle évaluation.",
    },
    {
      title: "Note formateur",
      value: loading ? "..." : stats.noteFormateur !== null ? `${stats.noteFormateur.toFixed(1)}/5` : "—",
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 21.04a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>,
      trend: "neutral" as const,
      trendValue: stats.nbAvisFormateur > 0 ? `${stats.nbAvisFormateur} avis` : "Aucun avis",
      to: "/notations-formateur",
    },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: '', email: '', profileImage: '' }} onLogout={handleLogout} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4">

          {/* En-tête avec nom organisme */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
              {organisme && (
                <p className="text-gray-500 mt-1">
                  {organisme.raison_sociale as string} — NDA {organisme.nda as string || 'Non renseigné'}
                </p>
              )}
            </div>
          </div>

          {/* Alertes actions requises — point non bloquant du 17/08 (Olivier) : ces
              alertes n'atterrissaient nulle part. Chaque badge ouvre désormais la
              liste précise des dossiers concernés, chacun lié à la fiche client où
              corriger réellement le problème. */}
          {!loading && (stats.documentsEnAttente > 0 || stats.relancesEnAttente > 0 || stats.questionnairesEnAttente > 0) && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="font-medium text-amber-800 mb-2">Actions requises</p>
              <div className="flex flex-wrap gap-3 text-sm text-amber-700">
                {stats.documentsEnAttente > 0 && (
                  <AlerteDetailPopover
                    icone="✍️"
                    texte={`${stats.documentsEnAttente} document(s) en attente de signature`}
                    items={documentsEnAttenteDetail}
                  />
                )}
                {stats.relancesEnAttente > 0 && <span>📧 {stats.relancesEnAttente} relance(s) à envoyer</span>}
                {stats.questionnairesEnAttente > 0 && (
                  <AlerteDetailPopover
                    icone="📋"
                    texte={`${stats.questionnairesEnAttente} questionnaire(s) non complété(s)`}
                    items={questionnairesEnAttenteDetail}
                  />
                )}
              </div>
            </div>
          )}

          {/* Chantier "sous-traitance" (28/08) : sessions confiées par un autre
              formateur/organisme, où j'anime en tant que sous-traitant — séparé des
              stats ci-dessous qui ne portent que sur mes propres formations/clients. */}
          {!loading && sessionsSousTraitance.length > 0 && (
            <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="font-medium text-purple-800 mb-2">🤝 Sessions en sous-traitance</p>
              <div className="space-y-1">
                {sessionsSousTraitance.map((s) => (
                  <Link
                    key={s.session_id}
                    to={`/sessions-sous-traitees/${s.session_id}`}
                    className="block text-sm text-purple-700 hover:underline py-1 px-2 -mx-2 rounded hover:bg-purple-100"
                  >
                    {s.formation_titre} — confiée par {s.organisme_demandeur_nom}
                    {s.date_debut ? ` (${new Date(s.date_debut).toLocaleDateString("fr-FR")})` : ""}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Cartes stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
            {statsData.map((stat, index) => (
              <DashboardCard
                key={index}
                title={stat.title}
                value={stat.value}
                icon={stat.icon}
                trend={stat.trend}
                trendValue={stat.trendValue}
                to={stat.to}
                detail={stat.detail}
              />
            ))}
          </div>

          <Tabs defaultValue="vue-generale" className="w-full">
            <TabsList>
              <TabsTrigger value="vue-generale">Vue générale</TabsTrigger>
              <TabsTrigger value="sessions">Sessions récentes</TabsTrigger>
              <TabsTrigger value="conformite">Conformité Qualiopi</TabsTrigger>
            </TabsList>

            <TabsContent value="vue-generale" className="space-y-6 mt-6">
              {satisfactionData.length > 0 ? (
                <Card className="p-6">
                  <h3 className="text-lg font-medium mb-4">Satisfaction des bénéficiaires</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={satisfactionData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} outerRadius={80} dataKey="value">
                          {satisfactionData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip /><Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              ) : (
                <Card className="p-6 text-center text-gray-500">
                  <p className="text-4xl mb-3">📊</p>
                  <p className="font-medium">Aucune donnée de satisfaction pour l'instant</p>
                  <p className="text-sm mt-1">Les graphiques s'alimenteront automatiquement après vos premières sessions.</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="sessions" className="mt-6">
              <Card className="p-6">
                <h3 className="text-lg font-medium mb-4">Sessions récentes</h3>
                {sessionsRecentes.length > 0 ? (
                  <div className="space-y-3">
                    {sessionsRecentes.map((s: Record<string, unknown>) => (
                      <div key={s.id as string} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{(s.formations as Record<string, string>)?.titre || 'Formation'}</p>
                          <p className="text-xs text-gray-500">{s.date_debut as string} → {s.date_fin as string}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          s.statut === 'terminee' ? 'bg-green-100 text-green-700' :
                          s.statut === 'en_cours' ? 'bg-exsenco-orange-light text-exsenco-blue' :
                          'bg-gray-100 text-gray-600'
                        }`}>{s.statut as string}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Aucune session pour l'instant. <a href="/formations/creation" className="text-exsenco-blue hover:underline">Créer votre première formation</a></p>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="conformite" className="mt-6">
              <Card className="p-6">
                <h3 className="text-lg font-medium mb-2">Conformité Qualiopi</h3>
                <p className="text-sm text-gray-500 mb-4">Indicateurs validés dans votre checklist</p>
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-bold text-exsenco-blue">{stats.indicateursOk}</div>
                  <div className="text-gray-500 text-sm">indicateurs validés<br />sur 32 au référentiel</div>
                  <div className="flex-1 bg-gray-200 rounded-full h-3">
                    <div className="bg-exsenco-blue h-3 rounded-full transition-all" style={{ width: `${(stats.indicateursOk / 32) * 100}%` }}></div>
                  </div>
                  <div className="text-sm font-medium">{Math.round((stats.indicateursOk / 32) * 100)}%</div>
                </div>
                {stats.indicateursOk === 0 && (
                  <p className="text-sm text-gray-500 mt-4">
                    Cette checklist se remplit à chaque pré-audit.{" "}
                    <Link to="/pre-audit" className="text-exsenco-blue hover:underline font-medium">Lancer votre premier pré-audit &rarr;</Link>
                  </p>
                )}
                {stats.indicateursOk > 0 && (
                  <p className="text-sm text-gray-500 mt-4">
                    <Link to="/pre-audit" className="text-exsenco-blue hover:underline font-medium">Voir le détail et relancer un pré-audit &rarr;</Link>
                  </p>
                )}
              </Card>
            </TabsContent>
          </Tabs>

        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Dashboard;
