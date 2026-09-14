import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import Logo from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";

// Chantier "2FA" (14/09, point 13 de l'audit) : écran de vérification du second
// facteur (TOTP), affiché automatiquement par le garde global (voir App.tsx,
// MfaGuard) juste après une connexion réussie par mot de passe ou par Google,
// quand le compte a activé la double authentification (voir Settings.tsx).
//
// La session existe déjà à ce stade (niveau "aal1") mais reste bloquée ici
// tant que le code n'est pas validé : ce garde applicatif empêche l'accès à
// l'interface avant l'aal2, même si les policies RLS elles-mêmes ne
// dépendent pas du niveau d'authentification.
const Verification2FA = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session, refreshMfaStatus } = useAuth();
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loadingFactor, setLoadingFactor] = useState(true);

  useEffect(() => {
    const chargerFacteur = async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error || !data) {
        setLoadingFactor(false);
        return;
      }
      const facteurVerifie = data.totp.find((f) => f.status === "verified") || data.totp[0] || null;
      setFactorId(facteurVerifie?.id || null);
      setLoadingFactor(false);
    };
    chargerFacteur();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) {
      toast({
        title: "Erreur",
        description: "Aucun facteur de double authentification trouvé sur ce compte. Contactez le support.",
        variant: "destructive",
      });
      return;
    }
    if (code.trim().length !== 6) {
      toast({
        title: "Code invalide",
        description: "Saisissez le code à 6 chiffres affiché par votre application d'authentification.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (error) {
        toast({
          title: "Code incorrect",
          description: "Vérifiez le code affiché par votre application d'authentification et réessayez.",
          variant: "destructive",
        });
        return;
      }
      await refreshMfaStatus();
      const role = session?.user?.user_metadata?.role;
      navigate(role === "client" ? "/espace-client" : "/dashboard", { replace: true });
    } catch (error: unknown) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Une erreur est survenue",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Logo size={32} withWordmark />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Vérification en deux étapes</CardTitle>
            <CardDescription>
              Saisissez le code à 6 chiffres généré par votre application d'authentification (Google Authenticator, Microsoft Authenticator...).
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="mfa-code">Code de vérification</Label>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  disabled={loadingFactor}
                  className="text-center text-lg tracking-widest"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={isLoading || loadingFactor} style={{ background: "#f2901e", color: "#fff" }}>
                {isLoading ? "Vérification..." : "Valider"}
              </Button>
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
              >
                Ce n'est pas moi / je n'ai plus accès à mon application d'authentification — se déconnecter
              </button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Verification2FA;
