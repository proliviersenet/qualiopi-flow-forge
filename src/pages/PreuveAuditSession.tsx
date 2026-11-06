import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Clock, Printer, FileSignature, AlertTriangle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ---------------------------------------------------------------------------
// Preuve d'audit Qualiopi — page de LECTURE uniquement.
//
// Rien de ce qui est affiché ici n'est une nouvelle fonctionnalité de suivi :
// tout existe déjà en base. Deux sources sont utilisées :
//
// 1. Les colonnes d'horodatage dédiées, déjà présentes sur `stagiaires`
//    (doc_*_envoye_le, doc_emargement_signe_le, consentement_*_date...),
//    `documents_formation` (created_at) et `derogations_qualiopi`
//    (decidee_le) : lues telles quelles, aucun calcul.
//
// 2. Pour les évènements qui n'ont PAS de colonne de date dédiée — les
//    relances/alertes automatiques (de simples booléens : ex.
//    doc_emargement_relance_j2_envoyee) et la complétion d'un questionnaire/
//    d'une évaluation (une colonne jsonb qui passe de NULL à remplie, ex.
//    reponses_evaluation_chaud) — la date exacte n'existe que dans
//    `journal_modifications` (branché sur la table `stagiaires` par la
//    migration 20261106140000). On y cherche la ligne où la colonne est
//    passée de "pas vraie" à vraie (booléens) ou de NULL à "remplie"
//    (jsonb), et on prend son `modifie_le`.
//
// Choix d'implémentation (SQL direct vs PostgREST + traitement JS) :
// on a choisi PostgREST + traitement côté client (ce fichier), plutôt
// qu'une fonction SQL dédiée exposée en RPC, pour deux raisons :
//   - Aucune nouvelle fonction/migration à ajouter en base : cette page
//     reste strictement additive, sans toucher au schéma ni passer une
//     nouvelle migration en prod pour une simple page de consultation.
//   - Le volume est faible et borné (une session = quelques stagiaires,
//     quelques dizaines de lignes de journal chacun) : un simple
//     `.select()` filtré sur `table_source` + `enregistrement_id in (...)`
//     suffit, et le traitement (recherche de transition) est trivial en TS.
//
// Si une colonne booléenne/jsonb est à "vrai"/"remplie" alors qu'aucune
// transition n'est trouvée dans le journal, c'est que l'évènement a eu lieu
// avant la mise en place du journal sur cette table (06/11/2026) : on
// l'affiche quand même comme "fait", avec une mention explicite que la date
// exacte n'a pas pu être retrouvée, plutôt que de l'omettre ou d'inventer
// une date.
// ---------------------------------------------------------------------------

interface SessionDate {
  date: string;
  creneau: "journee" | "matin" | "apres_midi";
}

interface SessionInfo {
  id: string;
  client_id: string;
  formation_id: string;
  date_debut: string | null;
  date_fin: string | null;
  lieu: string | null;
  lien_visio: string | null;
  statut: string;
  montant_devis: number | null;
  formation?: { titre: string; duree: string; organisme_id: string } | null;
}

interface ClientInfo {
  raison_sociale: string;
  siret: string | null;
}

interface Stagiaire {
  id: string;
  nom: string;
  prenom: string;
  email_pro: string | null;
  created_at: string;
  consentement_email: boolean | null;
  consentement_email_date: string | null;
  consentement_sms: boolean | null;
  consentement_sms_date: string | null;
  doc_livret_envoye_le: string | null;
  doc_livret_relance_j2_envoyee: boolean | null;
  doc_livret_alerte_envoyee: boolean | null;
  doc_questionnaire_avant_envoye_le: string | null;
  doc_questionnaire_avant_relance_j2_envoyee: boolean | null;
  doc_questionnaire_avant_alerte_envoyee: boolean | null;
  reponses_questionnaire_avant: Record<string, unknown> | null;
  doc_emargement_envoye_le: string | null;
  doc_emargement_relance_j2_envoyee: boolean | null;
  doc_emargement_alerte_envoyee: boolean | null;
  doc_emargement_signe_le: string | null;
  doc_evaluation_chaud_envoye_le: string | null;
  doc_evaluation_chaud_relance_j2_envoyee: boolean | null;
  doc_evaluation_chaud_alerte_envoyee: boolean | null;
  reponses_evaluation_chaud: Record<string, unknown> | null;
  doc_evaluation_formateur_envoye_le: string | null;
  doc_evaluation_formateur_relance_j2_envoyee: boolean | null;
  doc_evaluation_formateur_alerte_envoyee: boolean | null;
  reponses_evaluation_formateur: Record<string, unknown> | null;
  doc_attestation_envoye_le: string | null;
  doc_evaluation_froid_envoye_le: string | null;
  doc_evaluation_froid_relance_j2_envoyee: boolean | null;
  doc_evaluation_froid_alerte_envoyee: boolean | null;
  reponses_evaluation_froid: Record<string, unknown> | null;
  doc_evaluation_acquis_envoye_le: string | null;
  doc_evaluation_acquis_relance_j2_envoyee: boolean | null;
  doc_evaluation_acquis_alerte_envoyee: boolean | null;
  reponses_evaluation_acquis: Record<string, unknown> | null;
  score_evaluation_acquis: number | null;
}

interface DocumentSession {
  id: string;
  type: string;
  nom_fichier: string | null;
  genere_par: string | null;
  created_at: string;
}

interface SignatureRow {
  id: string;
  statut: string;
  provider: string | null;
  provider_signature_request_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Derogation {
  id: string;
  type_manquant: string | null;
  motif_derogation: string | null;
  decision: string | null;
  decidee_le: string | null;
  created_at: string;
}

interface JournalRow {
  enregistrement_id: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  ancien_contenu: Record<string, unknown> | null;
  nouveau_contenu: Record<string, unknown> | null;
  modifie_le: string;
}

interface Evenement {
  label: string;
  date: string | null;
  statut: "fait" | "attente";
  secondaire?: boolean;
  dateApproximative?: boolean;
}

const STATUT_SIGNATURE_LABEL: Record<string, string> = {
  en_attente: "Envoyée — en attente de signature",
  signe: "Signée par les deux parties",
  refuse: "Signature refusée",
  expire: "Signature expirée",
};

const formatDateHeure = (iso: string | null) => {
  if (!iso) return null;
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

const formatDate = (iso: string | null) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR");
};

// Valeur booléenne d'une colonne dans un instantané jsonb (ancien_contenu ou
// nouveau_contenu) — tolère aussi bien un booléen natif qu'une chaîne "true"/"false".
const valeurBool = (obj: Record<string, unknown> | null | undefined, col: string): boolean | undefined => {
  if (!obj) return undefined;
  const v = obj[col];
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return undefined;
};

// Première ligne de journal (triées par modifie_le croissant) où `col` passe
// de "pas vraie" à vraie — c'est l'horodatage exact d'une relance/alerte
// automatique, qui n'a pas de colonne de date dédiée.
const dateDePassageAVrai = (lignes: JournalRow[], col: string): string | null => {
  for (const l of lignes) {
    if (l.operation !== "UPDATE") continue;
    const avant = valeurBool(l.ancien_contenu, col);
    const apres = valeurBool(l.nouveau_contenu, col);
    if (apres === true && avant !== true) return l.modifie_le;
  }
  return null;
};

// Première ligne de journal où `col` (une colonne jsonb de réponses) passe de
// NULL à remplie — c'est l'horodatage exact de la complétion d'un
// questionnaire ou d'une évaluation, qui n'a pas de colonne "complété_le".
const dateDeRemplissage = (lignes: JournalRow[], col: string): string | null => {
  for (const l of lignes) {
    if (l.operation !== "UPDATE") continue;
    const avant = l.ancien_contenu ? l.ancien_contenu[col] : undefined;
    const apres = l.nouveau_contenu ? l.nouveau_contenu[col] : undefined;
    const avantVide = avant === null || avant === undefined;
    const apresRempli = apres !== null && apres !== undefined;
    if (avantVide && apresRempli) return l.modifie_le;
  }
  return null;
};

// Construit la frise complète d'un stagiaire : une liste ordonnée
// d'évènements attendus, chacun "fait" (avec date) ou "en attente" (sans
// date) — jamais omis, pour que l'absence de preuve reste visible.
const construireEvenementsStagiaire = (s: Stagiaire, journalDuStagiaire: JournalRow[]): Evenement[] => {
  const evts: Evenement[] = [];

  evts.push({ label: "Stagiaire enregistré dans la session", date: s.created_at, statut: "fait" });

  if (s.consentement_email) {
    evts.push({ label: "Consentement email donné", date: s.consentement_email_date, statut: "fait" });
  }
  if (s.consentement_sms) {
    evts.push({ label: "Consentement SMS donné", date: s.consentement_sms_date, statut: "fait" });
  }

  // Ajoute l'étape "envoi" (toujours affichée, "en attente" si pas de date),
  // puis ses relances/alertes éventuelles (seulement si elles ont eu lieu),
  // puis l'étape "complétion" dérivée du journal (seulement si l'envoi a eu
  // lieu : sinon la complétion n'a pas de sens).
  const ajouterEtapeEnvoi = (
    label: string,
    dateEnvoi: string | null,
    relanceCol?: string,
    alerteCol?: string,
  ) => {
    evts.push({ label, date: dateEnvoi, statut: dateEnvoi ? "fait" : "attente" });
    if (!dateEnvoi) return;
    if (relanceCol) {
      const d = dateDePassageAVrai(journalDuStagiaire, relanceCol);
      if (d) evts.push({ label: "↳ Relance de rappel (J+2) envoyée", date: d, statut: "fait", secondaire: true });
    }
    if (alerteCol) {
      const d = dateDePassageAVrai(journalDuStagiaire, alerteCol);
      if (d) evts.push({ label: "↳ Alerte formateur envoyée (sans réponse du stagiaire)", date: d, statut: "fait", secondaire: true });
    }
  };

  const ajouterEtapeCompletion = (label: string, dateEnvoi: string | null, reponsesCol: Record<string, unknown> | null, colName: string) => {
    if (!dateEnvoi) return;
    const rempli = reponsesCol !== null && reponsesCol !== undefined;
    if (!rempli) { evts.push({ label, date: null, statut: "attente" }); return; }
    const d = dateDeRemplissage(journalDuStagiaire, colName);
    evts.push({ label, date: d, statut: "fait", dateApproximative: !d });
  };

  ajouterEtapeEnvoi("Livret d'accueil envoyé", s.doc_livret_envoye_le, "doc_livret_relance_j2_envoyee", "doc_livret_alerte_envoyee");

  ajouterEtapeEnvoi("Questionnaire de pré-formation envoyé", s.doc_questionnaire_avant_envoye_le, "doc_questionnaire_avant_relance_j2_envoyee", "doc_questionnaire_avant_alerte_envoyee");
  ajouterEtapeCompletion("Questionnaire de pré-formation complété", s.doc_questionnaire_avant_envoye_le, s.reponses_questionnaire_avant, "reponses_questionnaire_avant");

  ajouterEtapeEnvoi("Feuille d'émargement envoyée", s.doc_emargement_envoye_le, "doc_emargement_relance_j2_envoyee", "doc_emargement_alerte_envoyee");
  if (s.doc_emargement_envoye_le) {
    evts.push({ label: "Émargement signé", date: s.doc_emargement_signe_le, statut: s.doc_emargement_signe_le ? "fait" : "attente" });
  }

  ajouterEtapeEnvoi("Évaluation à chaud envoyée", s.doc_evaluation_chaud_envoye_le, "doc_evaluation_chaud_relance_j2_envoyee", "doc_evaluation_chaud_alerte_envoyee");
  ajouterEtapeCompletion("Évaluation à chaud complétée", s.doc_evaluation_chaud_envoye_le, s.reponses_evaluation_chaud, "reponses_evaluation_chaud");

  ajouterEtapeEnvoi("Évaluation du formateur envoyée", s.doc_evaluation_formateur_envoye_le, "doc_evaluation_formateur_relance_j2_envoyee", "doc_evaluation_formateur_alerte_envoyee");
  ajouterEtapeCompletion("Évaluation du formateur complétée", s.doc_evaluation_formateur_envoye_le, s.reponses_evaluation_formateur, "reponses_evaluation_formateur");

  evts.push({ label: "Attestation de formation envoyée", date: s.doc_attestation_envoye_le, statut: s.doc_attestation_envoye_le ? "fait" : "attente" });

  ajouterEtapeEnvoi("Évaluation à froid envoyée", s.doc_evaluation_froid_envoye_le, "doc_evaluation_froid_relance_j2_envoyee", "doc_evaluation_froid_alerte_envoyee");
  ajouterEtapeCompletion("Évaluation à froid complétée", s.doc_evaluation_froid_envoye_le, s.reponses_evaluation_froid, "reponses_evaluation_froid");

  ajouterEtapeEnvoi("Évaluation des acquis envoyée", s.doc_evaluation_acquis_envoye_le, "doc_evaluation_acquis_relance_j2_envoyee", "doc_evaluation_acquis_alerte_envoyee");
  ajouterEtapeCompletion(
    `Évaluation des acquis complétée${s.score_evaluation_acquis != null ? ` (score : ${s.score_evaluation_acquis})` : ""}`,
    s.doc_evaluation_acquis_envoye_le, s.reponses_evaluation_acquis, "reponses_evaluation_acquis",
  );

  return evts;
};

const PreuveAuditSession = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [introuvable, setIntrouvable] = useState(false);

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [dates, setDates] = useState<SessionDate[]>([]);
  const [stagiaires, setStagiaires] = useState<Stagiaire[]>([]);
  const [devisDoc, setDevisDoc] = useState<DocumentSession | null>(null);
  const [conventionDoc, setConventionDoc] = useState<DocumentSession | null>(null);
  const [signaturesConvention, setSignaturesConvention] = useState<{ sig: SignatureRow; journal: JournalRow[] }[]>([]);
  const [derogations, setDerogations] = useState<Derogation[]>([]);
  const [journalParStagiaire, setJournalParStagiaire] = useState<Map<string, JournalRow[]>>(new Map());

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    if (authSession.user.user_metadata?.role === "client") { navigate("/espace-client"); return; }

    const charger = async () => {
      try {
        setUser({
          name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "",
          email: authSession.user.email || "",
          profileImage: "",
        });

        const { data: profile } = await supabase
          .from("profiles")
          .select("organisme_id")
          .eq("id", authSession.user.id)
          .single();
        if (!profile?.organisme_id) { setIntrouvable(true); return; }

        const { data: sessionData, error: sessionErr } = await supabase
          .from("sessions")
          .select("*, formation:formation_id(titre, duree, organisme_id)")
          .eq("id", id)
          .single();

        const sess = sessionData as SessionInfo | null;
        if (sessionErr || !sess || sess.formation?.organisme_id !== profile.organisme_id) {
          setIntrouvable(true);
          return;
        }
        setSession(sess);

        const [{ data: clientData }, { data: datesData }, { data: stagData }, { data: docsData }, { data: derogData }] = await Promise.all([
          supabase.from("clients").select("raison_sociale, siret").eq("id", sess.client_id).single(),
          supabase.from("session_dates").select("date, creneau").eq("session_id", id).order("date"),
          supabase
            .from("stagiaires")
            .select(
              "id, nom, prenom, email_pro, created_at, " +
              "consentement_email, consentement_email_date, consentement_sms, consentement_sms_date, " +
              "doc_livret_envoye_le, doc_livret_relance_j2_envoyee, doc_livret_alerte_envoyee, " +
              "doc_questionnaire_avant_envoye_le, doc_questionnaire_avant_relance_j2_envoyee, doc_questionnaire_avant_alerte_envoyee, reponses_questionnaire_avant, " +
              "doc_emargement_envoye_le, doc_emargement_relance_j2_envoyee, doc_emargement_alerte_envoyee, doc_emargement_signe_le, " +
              "doc_evaluation_chaud_envoye_le, doc_evaluation_chaud_relance_j2_envoyee, doc_evaluation_chaud_alerte_envoyee, reponses_evaluation_chaud, " +
              "doc_evaluation_formateur_envoye_le, doc_evaluation_formateur_relance_j2_envoyee, doc_evaluation_formateur_alerte_envoyee, reponses_evaluation_formateur, " +
              "doc_attestation_envoye_le, " +
              "doc_evaluation_froid_envoye_le, doc_evaluation_froid_relance_j2_envoyee, doc_evaluation_froid_alerte_envoyee, reponses_evaluation_froid, " +
              "doc_evaluation_acquis_envoye_le, doc_evaluation_acquis_relance_j2_envoyee, doc_evaluation_acquis_alerte_envoyee, reponses_evaluation_acquis, score_evaluation_acquis"
            )
            .eq("session_id", id)
            .order("nom"),
          supabase.from("documents_formation").select("id, type, nom_fichier, genere_par, created_at").eq("session_id", id).in("type", ["devis", "convention"]),
          supabase.from("derogations_qualiopi").select("id, type_manquant, motif_derogation, decision, decidee_le, created_at").eq("session_id", id).order("created_at"),
        ]);

        setClient((clientData as ClientInfo) || null);
        setDates((datesData as SessionDate[]) || []);
        const stags = (stagData as Stagiaire[]) || [];
        setStagiaires(stags);
        setDerogations((derogData as Derogation[]) || []);

        const docs = (docsData as DocumentSession[]) || [];
        const devis = docs.find(d => d.type === "devis") || null;
        const convention = docs.find(d => d.type === "convention") || null;
        setDevisDoc(devis);
        setConventionDoc(convention);

        // Journal des stagiaires de la session, en une seule requête (plutôt
        // qu'une par stagiaire) — table_source='stagiaires', filtré sur les
        // ids présents, trié chronologiquement pour pouvoir y chercher des
        // transitions dans l'ordre.
        if (stags.length > 0) {
          const { data: journalStag } = await supabase
            .from("journal_modifications")
            .select("enregistrement_id, operation, ancien_contenu, nouveau_contenu, modifie_le")
            .eq("table_source", "stagiaires")
            .in("enregistrement_id", stags.map(s => s.id))
            .order("modifie_le", { ascending: true });
          const map = new Map<string, JournalRow[]>();
          (journalStag as JournalRow[] || []).forEach(l => {
            const liste = map.get(l.enregistrement_id) || [];
            liste.push(l);
            map.set(l.enregistrement_id, liste);
          });
          setJournalParStagiaire(map);
        }

        // Historique de signature de la convention : toutes les demandes de
        // signature envoyées pour ce document (normalement une, parfois
        // plusieurs si renvoyée après refus/expiration), chacune avec son
        // propre historique de changements de statut tiré du journal.
        if (convention) {
          const { data: sigsData } = await supabase
            .from("signatures")
            .select("id, statut, provider, provider_signature_request_id, created_at, updated_at")
            .eq("document_id", convention.id)
            .order("created_at", { ascending: true });
          const sigs = (sigsData as SignatureRow[]) || [];
          if (sigs.length > 0) {
            const { data: journalSig } = await supabase
              .from("journal_modifications")
              .select("enregistrement_id, operation, ancien_contenu, nouveau_contenu, modifie_le")
              .eq("table_source", "signatures")
              .in("enregistrement_id", sigs.map(s => s.id))
              .order("modifie_le", { ascending: true });
            const jRows = (journalSig as JournalRow[]) || [];
            setSignaturesConvention(sigs.map(sig => ({ sig, journal: jRows.filter(j => j.enregistrement_id === sig.id) })));
          }
        }
      } catch (err) {
        console.error("Erreur PreuveAuditSession:", err);
        setIntrouvable(true);
      } finally {
        setLoading(false);
      }
    };
    charger();
  }, [id, navigate, authSession, authLoading]);

  const renderStatutIcone = (statut: "fait" | "attente") =>
    statut === "fait"
      ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
      : <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />;

  const renderEvenement = (e: Evenement, key: string) => (
    <li key={key} className={`flex items-center gap-2 py-1 text-sm ${e.secondaire ? "ml-6 text-gray-500" : ""}`}>
      {renderStatutIcone(e.statut)}
      <span className={e.statut === "attente" ? "text-gray-500" : "text-gray-800"}>{e.label}</span>
      {e.statut === "fait" ? (
        <span className="text-gray-400 ml-auto whitespace-nowrap">
          {formatDateHeure(e.date)}
          {e.dateApproximative && " (date exacte non tracée — avant le 06/11/2026)"}
        </span>
      ) : (
        <Badge className="ml-auto bg-amber-100 text-amber-700">Non envoyé / en attente</Badge>
      )}
    </li>
  );

  if (loading || authLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
        <main className="flex-grow flex items-center justify-center bg-gray-50">
          <p className="text-gray-400">Chargement...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (introuvable || !session) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
        <main className="flex-grow flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <p className="text-gray-500 mb-3">Session introuvable.</p>
            <Link to="/clients" className="text-exsenco-blue hover:underline">&larr; Retour aux clients</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const devisLabel = devisDoc ? (devisDoc.genere_par === "import" ? "Devis importé" : "Devis généré") : "Devis";
  const conventionLabel = conventionDoc ? (conventionDoc.genere_par === "import" ? "Convention importée" : "Convention générée") : "Convention";

  return (
    <div className="flex flex-col min-h-screen print:block">
      <div className="print:hidden">
        <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      </div>

      <main className="flex-grow bg-gray-50 py-8 print:bg-white print:py-0">
        <div className="container mx-auto px-4 max-w-4xl print:max-w-full print:px-0">

          <div className="flex items-center justify-between mb-6 print:hidden">
            <Link to={`/clients/${session.client_id}`} className="text-exsenco-blue hover:text-blue-800 text-sm">
              &larr; Retour à la fiche client
            </Link>
            <Button onClick={() => window.print()} style={{ background: "#25245e", color: "#fff" }} className="font-bold">
              <Printer className="h-4 w-4 mr-2" /> Imprimer / Exporter en PDF
            </Button>
          </div>

          {/* En-tête de la session */}
          <Card className="mb-6 print:shadow-none print:border-black">
            <CardHeader>
              <CardTitle className="text-2xl" style={{ color: "#25245e" }}>
                Preuve d'audit Qualiopi — {session.formation?.titre || "Formation"}
              </CardTitle>
              <p className="text-sm text-gray-500">
                Client : {client?.raison_sociale || "—"}{client?.siret ? ` (SIRET ${client.siret})` : ""}
              </p>
            </CardHeader>
            <CardContent className="text-sm text-gray-700 space-y-2">
              <div className="grid grid-cols-2 gap-4">
                {dates.length > 0 ? (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400 mb-1">Dates de la formation</p>
                    <ul className="list-disc list-inside">
                      {dates.map((d, i) => (
                        <li key={i}>
                          {formatDate(d.date)} — {d.creneau === "journee" ? "journée complète" : d.creneau === "matin" ? "matin" : "après-midi"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <>
                    {session.date_debut && <div><p className="text-xs text-gray-400 mb-1">Début</p><p>{formatDate(session.date_debut)}</p></div>}
                    {session.date_fin && <div><p className="text-xs text-gray-400 mb-1">Fin</p><p>{formatDate(session.date_fin)}</p></div>}
                  </>
                )}
                {session.lieu && <div><p className="text-xs text-gray-400 mb-1">Lieu</p><p>{session.lieu}</p></div>}
                <div><p className="text-xs text-gray-400 mb-1">Statut de la session</p><p>{session.statut}</p></div>
              </div>
            </CardContent>
          </Card>

          {/* Historique de la convention (niveau session) */}
          <Card className="mb-6 print:shadow-none print:border-black print:break-inside-avoid">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2" style={{ color: "#25245e" }}>
                <FileSignature className="h-5 w-5" /> Devis et convention de formation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-gray-100">
                {renderEvenement({ label: devisLabel, date: devisDoc?.created_at || null, statut: devisDoc ? "fait" : "attente" }, "devis")}
                {renderEvenement({ label: conventionLabel, date: conventionDoc?.created_at || null, statut: conventionDoc ? "fait" : "attente" }, "convention")}
              </ul>

              {conventionDoc && signaturesConvention.length === 0 && (
                <p className="text-sm text-gray-500 mt-2">Convention générée, jamais envoyée pour signature.</p>
              )}

              {signaturesConvention.map(({ sig, journal }, idx) => {
                // S'il y a des lignes de journal pour cette demande de signature,
                // on affiche chaque changement de statut avec sa date exacte.
                // Sinon (demande envoyée avant la mise en place du journal), on
                // retombe sur le statut actuel avec sa date de dernière mise à
                // jour, par défaut.
                const transitions = journal
                  .filter(l => l.operation === "UPDATE")
                  .map(l => ({
                    avant: (l.ancien_contenu?.statut as string) || null,
                    apres: (l.nouveau_contenu?.statut as string) || null,
                    date: l.modifie_le,
                  }))
                  .filter(t => t.avant !== t.apres);

                return (
                  <div key={sig.id} className="mt-3">
                    <p className="text-sm font-medium text-gray-700">
                      Demande de signature {signaturesConvention.length > 1 ? `n°${idx + 1}` : ""} ({sig.provider || "DocuSign"})
                    </p>
                    <ul className="divide-y divide-gray-100">
                      {renderEvenement({ label: "Envoyée pour signature", date: sig.created_at, statut: "fait" }, `${sig.id}-envoi`)}
                      {transitions.length > 0 ? (
                        transitions.map((t, i) => renderEvenement({
                          label: `Statut : ${STATUT_SIGNATURE_LABEL[t.apres || ""] || t.apres || "—"}`,
                          date: t.date, statut: "fait",
                        }, `${sig.id}-t${i}`))
                      ) : (
                        renderEvenement({
                          label: `Statut actuel : ${STATUT_SIGNATURE_LABEL[sig.statut] || sig.statut}`,
                          date: sig.updated_at, statut: "fait", dateApproximative: true,
                        }, `${sig.id}-actuel`)
                      )}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Dérogations Qualiopi (niveau session) */}
          {derogations.length > 0 && (
            <Card className="mb-6 print:shadow-none print:border-black print:break-inside-avoid">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2" style={{ color: "#25245e" }}>
                  <AlertTriangle className="h-5 w-5" /> Dérogations Qualiopi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {derogations.map(d => (
                  <div key={d.id} className="text-sm border border-gray-100 rounded-lg p-3">
                    <p className="font-medium text-gray-700">{d.type_manquant || "Manquement non précisé"}</p>
                    {d.motif_derogation && <p className="text-gray-600 mt-1">Motif : {d.motif_derogation}</p>}
                    <p className="text-gray-400 mt-1">
                      {d.decision ? `Décision : ${d.decision} — ` : ""}
                      {d.decidee_le ? `décidée le ${formatDateHeure(d.decidee_le)}` : "décision en attente"}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Frise par stagiaire */}
          <h2 className="text-xl font-bold mb-3" style={{ color: "#25245e" }}>Traçabilité par stagiaire</h2>
          {stagiaires.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-gray-400">Aucun stagiaire sur cette session.</CardContent></Card>
          ) : (
            <div className="space-y-4">
              {stagiaires.map(s => {
                const journalStag = journalParStagiaire.get(s.id) || [];
                const evts = construireEvenementsStagiaire(s, journalStag);
                return (
                  <Card key={s.id} className="print:shadow-none print:border-black print:break-inside-avoid">
                    <CardHeader>
                      <CardTitle className="text-base" style={{ color: "#25245e" }}>
                        {s.prenom} {s.nom}
                      </CardTitle>
                      {s.email_pro && <p className="text-xs text-gray-400">{s.email_pro}</p>}
                    </CardHeader>
                    <CardContent>
                      <ul className="divide-y divide-gray-100">
                        {evts.map((e, i) => renderEvenement(e, `${s.id}-${i}`))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <Separator className="my-6 print:hidden" />

          <p className="text-xs text-gray-400 text-center mb-6 print:block print:mt-4 print:text-black">
            Document généré le {formatDateHeure(new Date().toISOString())} depuis QualioFlex — toutes les dates affichées proviennent des horodatages existants en base (colonnes de date dédiées ou journal de modifications).
          </p>
        </div>
      </main>

      <div className="print:hidden">
        <Footer />
      </div>
    </div>
  );
};

export default PreuveAuditSession;
