import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useStatutAbonnement } from "@/hooks/useStatutAbonnement";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
import Verification2FA from "./pages/Verification2FA";
import Formations from "./pages/Formations";
import FormationCreation from "./pages/FormationCreation";
import FormationDetail from "./pages/FormationDetail";
import FormationEdit from "./pages/FormationEdit";
import Clients from "./pages/Clients";
import Documents from "./pages/Documents";
import BPF from "./pages/BPF";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Confidentialite from "./pages/Confidentialite";
import Conditions from "./pages/Conditions";
import RGPD from "./pages/RGPD";
import Contact from "./pages/Contact";
import Aide from "./pages/Aide";
import Documentation from "./pages/Documentation";
import Qualiopi from "./pages/Qualiopi";
import MentionsLegales from "./pages/MentionsLegales";
import InvitationClient from "./pages/InvitationClient";
import EspaceClient from "./pages/EspaceClient";
import EspaceClientProfil from "./pages/EspaceClientProfil";
import EspaceClientParametres from "./pages/EspaceClientParametres";
import Factures from "./pages/Factures";
import VeilleQualiopi from "./pages/VeilleQualiopi";
import AdminSuppressions from "./pages/AdminSuppressions";
import PreAudit from "./pages/PreAudit";
import NotationsFormateur from "./pages/NotationsFormateur";
import ChatbotEscalades from "./pages/ChatbotEscalades";
import AvisPublic from "./pages/AvisPublic";
import ClientDetail from "./pages/ClientDetail";
import PreuveAuditSession from "./pages/PreuveAuditSession";
import SessionSousTraitee from "./pages/SessionSousTraitee";
import Positionnement from "./pages/Positionnement";
import EvaluationPublic from "./pages/EvaluationPublic";
import EmargementPublic from "./pages/EmargementPublic";
import SupportPublic from "./pages/SupportPublic";
import LivretPublic from "./pages/LivretPublic";
import AttestationPublic from "./pages/AttestationPublic";
import Demo from "./pages/Demo";
import Mockup from "./pages/Mockup";
import NotFound from "./pages/NotFound";
import ChatbotWidget from "./components/ChatbotWidget";
import OnboardingChecklist from "./components/OnboardingChecklist";
import OnboardingSpotlight from "./components/OnboardingSpotlight";
import ErrorBoundary from "./components/ErrorBoundary";
import GlobalErrorLogger from "./components/GlobalErrorLogger";
import SignalerBugButton from "./components/SignalerBugButton";
import SuperAdmin from "./pages/SuperAdmin";
import SuperAdminExplorer from "./pages/SuperAdminExplorer";
import SuperAdminFacturation from "./pages/SuperAdminFacturation";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

const queryClient = new QueryClient();

// Chantier "2FA" (14/09, point 13 de l'audit) : redirection globale vers
// l'écran de vérification du second facteur (/verification-2fa) dès qu'une
// session est authentifiée à l'aal1 alors qu'un facteur TOTP vérifié existe
// (donc aal2 requis). Centralisé ici plutôt que dans chaque page qui navigue
// vers /dashboard après authentification, car l'application a plusieurs
// points d'entrée après connexion : mot de passe (Register.tsx, mode
// "access"), retour Google (SocialAuthButtons), et potentiellement d'autres
// à l'avenir — un garde unique reste valable pour tous sans avoir à les
// modifier un par un.
const MfaGuard = () => {
  const { mfaRequired, mfaLoading, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || mfaLoading) return;
    if (mfaRequired && location.pathname !== "/verification-2fa") {
      navigate("/verification-2fa", { replace: true });
    }
  }, [mfaRequired, mfaLoading, loading, location.pathname, navigate]);

  return null;
};

// Chantier facturation, lot 2 (12/11/2026) : abonnement obligatoire pour
// utiliser l'espace formateur UNE FOIS la facturation activée (interrupteur
// parametres_plateforme.facturation_active, coupé pendant la bêta). Un
// formateur sans abonnement en cours (et non exempté ambassadeur) est
// renvoyé vers /factures pour démarrer son essai gratuit de 7 jours (carte
// demandée). Seules les pages de travail sont protégées : profil,
// paramètres, factures, pages légales et liens publics restent accessibles.
// Une erreur de lecture du statut ne bloque jamais (cf. useStatutAbonnement).
const ZONES_ABONNEMENT = [
  "/dashboard", "/formations", "/clients", "/documents", "/bpf", "/pre-audit",
  "/notations-formateur", "/qualiopi-statut", "/session/", "/sessions-sous-traitees",
  "/chatbot-escalades",
];

const AbonnementGuard = () => {
  const { loading, rafraichir } = useStatutAbonnement();
  const location = useLocation();
  const navigate = useNavigate();

  // Lot 5 (parrainage) : un lien qualioflex.fr/register?parrain=CODE mémorise
  // le code jusqu'au démarrage de l'essai (pré-rempli sur la page Abonnement).
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("parrain");
    if (code) {
      try { localStorage.setItem("qf_parrain", code.trim().toUpperCase().slice(0, 20)); } catch { /* stockage indisponible */ }
    }
  }, [location.search]);

  // Statut relu à CHAQUE arrivée sur une page protégée (retour test Olivier
  // du 12/11 : un statut lu une seule fois à l'ouverture du site devenait
  // périmé — activation de la facturation, souscription, coupure…).
  useEffect(() => {
    if (loading) return;
    const protegee = ZONES_ABONNEMENT.some((z) => location.pathname.startsWith(z));
    if (!protegee) return;
    let annule = false;
    rafraichir().then((frais) => {
      if (!annule && frais?.acces_requis) navigate("/factures?activation=1", { replace: true });
    });
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, location.pathname]);

  return null;
};

// Demande Olivier (23/09, sécurité) : déconnexion automatique après
// inactivité, côté formateur ET côté client — un seul garde global (même
// principe que MfaGuard ci-dessus) puisque le besoin est identique quel que
// soit l'espace : la session existe ou non, peu importe le rôle derrière. La
// fermeture d'onglet/navigateur sans déconnexion explicite est couverte
// séparément par le passage en sessionStorage dans
// integrations/supabase/client.ts.
//
// Bug remonté par Olivier (04/10) : en quittant l'onglet QualioFlex (ex.
// taper une recherche dans la barre d'adresse) puis en y revenant plus tard,
// la session était toujours active. Cause : un simple setTimeout ne tourne
// QUE tant que la page QualioFlex est chargée dans l'onglet — dès qu'on
// navigue ailleurs dans ce même onglet, le JS (et donc le minuteur) est
// entièrement déchargé et ne peut plus se déclencher, même si on revient
// ensuite sur QualioFlex. On stocke donc en plus un horodatage de dernière
// activité dans sessionStorage (survit à la navigation dans le même onglet,
// disparaît à sa fermeture comme le reste de la session) et on le vérifie à
// chaque remontage ET à chaque fois que l'onglet redevient visible, pour
// rattraper une inactivité qui s'est écoulée hors-page.
//
// Correctif du 06/11/2026 (retour Olivier : 5 minutes, c'est trop court en
// usage réel) : délai porté à 15 minutes. Le message affiché au moment de la
// déconnexion (ci-dessous) reprend désormais cette valeur depuis la constante
// plutôt que de l'avoir en dur, pour que les deux ne puissent plus diverger
// si ce délai est encore ajusté un jour.
const DELAI_INACTIVITE_MINUTES = 15;
const DELAI_INACTIVITE_MS = DELAI_INACTIVITE_MINUTES * 60 * 1000;
const CLE_DERNIERE_ACTIVITE = "qf_derniere_activite";

const InactivityGuard = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) return;

    const deconnecterPourInactivite = async () => {
      try { sessionStorage.removeItem(CLE_DERNIERE_ACTIVITE); } catch { /* sessionStorage indisponible : on ignore */ }
      await supabase.auth.signOut();
      toast({
        title: "Déconnecté pour inactivité",
        description: `Aucune activité détectée depuis ${DELAI_INACTIVITE_MINUTES} minutes — reconnectez-vous pour continuer.`,
      });
      navigate("/", { replace: true });
    };

    const enregistrerActivite = () => {
      try { sessionStorage.setItem(CLE_DERNIERE_ACTIVITE, String(Date.now())); } catch { /* sessionStorage indisponible : on ignore */ }
    };

    const resetTimer = () => {
      enregistrerActivite();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(deconnecterPourInactivite, DELAI_INACTIVITE_MS);
    };

    // Rattrape l'inactivité écoulée pendant que l'onglet n'affichait pas
    // QualioFlex (navigation ailleurs dans le même onglet, mise en veille de
    // l'ordinateur, onglet resté en arrière-plan) : si le délai est déjà
    // dépassé au moment où on revérifie, on déconnecte immédiatement au lieu
    // d'attendre un minuteur qui n'a jamais pu tourner.
    const verifierInactiviteEcoulee = () => {
      let derniere: number | null = null;
      try {
        const brut = sessionStorage.getItem(CLE_DERNIERE_ACTIVITE);
        derniere = brut ? Number(brut) : null;
      } catch { /* sessionStorage indisponible : on ignore, pas de rattrapage possible */ }

      if (derniere && Date.now() - derniere >= DELAI_INACTIVITE_MS) {
        deconnecterPourInactivite();
      } else {
        resetTimer();
      }
    };

    const evenementsActivite = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"];
    evenementsActivite.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    const surVisibilite = () => {
      if (document.visibilityState === "visible") verifierInactiviteEcoulee();
    };
    document.addEventListener("visibilitychange", surVisibilite);
    window.addEventListener("focus", verifierInactiviteEcoulee);

    verifierInactiviteEcoulee();

    return () => {
      evenementsActivite.forEach((evt) => window.removeEventListener(evt, resetTimer));
      document.removeEventListener("visibilitychange", surVisibilite);
      window.removeEventListener("focus", verifierInactiviteEcoulee);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ChatbotWidget />
        <OnboardingChecklist />
        <GlobalErrorLogger />
        <SignalerBugButton />
        <ErrorBoundary>
          <BrowserRouter>
            <MfaGuard />
            <InactivityGuard />
            <AbonnementGuard />
            {/* Utilise useLocation (bulles pas-à-pas déclenchées par la page
                courante) : doit impérativement rester à l'intérieur du
                BrowserRouter, contrairement à OnboardingChecklist ci-dessus
                qui n'en a pas besoin. */}
            <OnboardingSpotlight />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/dashboard" element={<Dashboard />} />
              {/* Fusion "Connexion" / "Inscription" (12/09) : les deux URLs pointent
                  vers le même composant Register, qui détecte automatiquement s'il
                  s'agit d'une connexion ou d'une création de compte — évite la
                  confusion constatée en beta test (bouton Google ambigu entre les
                  deux pages, cf. retour Jean-Pascal Mollet). */}
              <Route path="/login" element={<Register />} />
              <Route path="/register" element={<Register />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verification-2fa" element={<Verification2FA />} />
              <Route path="/formations" element={<Formations />} />
              <Route path="/formations/creation" element={<FormationCreation />} />
              <Route path="/formations/:id" element={<FormationDetail />} />
              <Route path="/formations/:id/edit" element={<FormationEdit />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/bpf" element={<BPF />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/confidentialite" element={<Confidentialite />} />
              <Route path="/conditions" element={<Conditions />} />
              <Route path="/rgpd" element={<RGPD />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/aide" element={<Aide />} />
              <Route path="/documentation" element={<Documentation />} />
              <Route path="/qualiopi" element={<Qualiopi />} />
              <Route path="/mentions-legales" element={<MentionsLegales />} />
              <Route path="/invitation/:token" element={<InvitationClient />} />
              <Route path="/espace-client" element={<EspaceClient />} />
              <Route path="/espace-client/profil" element={<EspaceClientProfil />} />
              <Route path="/espace-client/parametres" element={<EspaceClientParametres />} />
              <Route path="/factures" element={<Factures />} />
              <Route path="/qualiopi-statut" element={<VeilleQualiopi />} />
              <Route path="/admin/suppressions" element={<AdminSuppressions />} />
              <Route path="/superadmin" element={<SuperAdmin />} />
              <Route path="/superadmin/explorer" element={<SuperAdminExplorer />} />
              <Route path="/superadmin/facturation" element={<SuperAdminFacturation />} />
              <Route path="/pre-audit" element={<PreAudit />} />
              <Route path="/notations-formateur" element={<NotationsFormateur />} />
              <Route path="/chatbot-escalades" element={<ChatbotEscalades />} />
              <Route path="/avis/:organismeId" element={<AvisPublic />} />
              <Route path="/positionnement/:token" element={<Positionnement />} />
              <Route path="/evaluation/:token" element={<EvaluationPublic />} />
              <Route path="/emargement/:token" element={<EmargementPublic />} />
              <Route path="/support/:token" element={<SupportPublic />} />
              <Route path="/livret/:token" element={<LivretPublic />} />
              <Route path="/attestation/:token" element={<AttestationPublic />} />
              <Route path="/clients/:id" element={<ClientDetail />} />
              <Route path="/session/:id/preuve-audit" element={<PreuveAuditSession />} />
              <Route path="/sessions-sous-traitees/:sessionId" element={<SessionSousTraitee />} />
              {/* 14/11/2026 : l'ancienne page Fonctionnalités affichait une grille tarifaire
                  obsolète (39 / 99 €) : redirigée vers la section de la page d'accueil. */}
              <Route path="/features" element={<Navigate to="/#fonctionnalites" replace />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/mockup" element={<Mockup />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
