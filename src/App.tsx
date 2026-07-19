import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
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
import ClientDetail from "./pages/ClientDetail";
import Features from "./pages/Features";
import Demo from "./pages/Demo";
import Mockup from "./pages/Mockup";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
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
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/features" element={<Features />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/mockup" element={<Mockup />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
