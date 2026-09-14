import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
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
import SessionSousTraitee from "./pages/SessionSousTraitee";
import Positionnement from "./pages/Positionnement";
import EvaluationPublic from "./pages/EvaluationPublic";
import EmargementPublic from "./pages/EmargementPublic";
import SupportPublic from "./pages/SupportPublic";
import LivretPublic from "./pages/LivretPublic";
import AttestationPublic from "./pages/AttestationPublic";
import Features from "./pages/Features";
import Demo from "./pages/Demo";
import Mockup from "./pages/Mockup";
import NotFound from "./pages/NotFound";
import ChatbotWidget from "./components/ChatbotWidget";
import OnboardingChecklist from "./components/OnboardingChecklist";
import ErrorBoundary from "./components/ErrorBoundary";
import GlobalErrorLogger from "./components/GlobalErrorLogger";
import SignalerBugButton from "./components/SignalerBugButton";
import SuperAdmin from "./pages/SuperAdmin";
import SuperAdminExplorer from "./pages/SuperAdminExplorer";
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
              <Route path="/sessions-sous-traitees/:sessionId" element={<SessionSousTraitee />} />
              <Route path="/features" element={<Features />} />
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
