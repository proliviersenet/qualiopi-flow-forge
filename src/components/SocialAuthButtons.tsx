import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// Connexion via fournisseurs externes (Google pour l'instant, LinkedIn/Apple à
// venir dès que les identifiants seront configurés côté Supabase — voir
// échange du 12/09 avec Olivier). Dans tous les cas — inscription ou connexion
// classique — on redirige vers /dashboard : Dashboard.tsx détecte lui-même si
// l'organisme/l'entreprise doit encore être renseigné(e) (nouvel utilisateur
// arrivé via Google, jamais passé par le formulaire SIRET) et redirige au
// besoin vers /register pour compléter, sinon affiche directement le tableau
// de bord. Un seul et même bouton sert donc pour Login.tsx ET Register.tsx.
const PROVIDERS = [
  {
    id: "google" as const,
    label: "Continuer avec Google",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.91c1.7-1.57 2.69-3.88 2.69-6.64z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.27c-.8.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z" />
        <path fill="#FBBC05" d="M3.97 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.96A8.996 8.996 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.34z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
      </svg>
    ),
  },
];

const Divider = () => (
  <div className="relative">
    <div className="absolute inset-0 flex items-center">
      <span className="w-full border-t" />
    </div>
    <div className="relative flex justify-center text-xs uppercase">
      <span className="bg-white px-2 text-gray-400">ou</span>
    </div>
  </div>
);

const SocialAuthButtons = ({ dividerPosition = "before" }: { dividerPosition?: "before" | "after" }) => {
  const { toast } = useToast();
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const handleClick = async (providerId: "google") => {
    setLoadingProvider(providerId);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: providerId,
        options: { redirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;
      // En cas de succès, Supabase redirige immédiatement le navigateur vers
      // Google — le code après ce point ne s'exécute donc jamais.
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Connexion impossible pour le moment";
      toast({ title: "Erreur de connexion", description: msg, variant: "destructive" });
      setLoadingProvider(null);
    }
  };

  const buttons = PROVIDERS.map((p) => (
    <Button
      key={p.id}
      type="button"
      variant="outline"
      className="w-full"
      disabled={loadingProvider !== null}
      onClick={() => handleClick(p.id)}
    >
      {p.icon}
      {loadingProvider === p.id ? "Redirection..." : p.label}
    </Button>
  ));

  return (
    <div className="space-y-3">
      {dividerPosition === "before" && <Divider />}
      {buttons}
      {dividerPosition === "after" && <Divider />}
    </div>
  );
};

export default SocialAuthButtons;
