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
import Clients from "./pages/Clients";
import Documents from "./pages/Documents";
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
          <Route path="/clients" element={<Clients />} />
          <Route path="/documents" element={<Documents />} />
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
