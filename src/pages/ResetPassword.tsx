import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import Footer from "@/components/Footer";

const ResetPassword = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    // Si l'URL contient un token de reset (type=recovery), on passe en mode update
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setMode("update");
    }
  }, []);

  // Demande d'envoi du lien de réinitialisation
  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Email requis", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "https://qualioflex.fr/reset-password",
      });
      if (error) throw error;
      toast({
        title: "Email envoyé",
        description: "Vérifiez votre boîte mail et cliquez sur le lien de réinitialisation.",
      });
    } catch (error: unknown) {
      toast({ title: "Erreur", description: error instanceof Error ? error.message : "Erreur inconnue", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Mise à jour du mot de passe après clic sur le lien email
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Mot de passe trop court", description: "8 caractères minimum", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Mot de passe mis à jour", description: "Vous pouvez maintenant vous connecter." });
      navigate("/login");
    } catch (error: unknown) {
      toast({ title: "Erreur", description: error instanceof Error ? error.message : "Erreur inconnue", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-grow flex items-center justify-center p-4 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <Link to="/" className="inline-block">
              <span className="text-2xl font-bold" style={{ color: "#25245e" }}>QalioFlex</span>
              <span className="text-gray-400 text-xs block">by ExSenCo</span>
            </Link>
          </div>

          <Card>
            {mode === "request" ? (
              <>
                <CardHeader>
                  <CardTitle>Mot de passe oublié</CardTitle>
                  <CardDescription>
                    Saisissez votre email — nous vous envoyons un lien de réinitialisation.
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleRequest}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email professionnel</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="olivier@exsenco.fr"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col gap-3">
                    <Button type="submit" className="w-full font-bold" style={{ background: "#f2901e", color: "#fff", border: "none" }} disabled={isLoading}>
                      {isLoading ? "Envoi en cours..." : "Envoyer le lien de réinitialisation"}
                    </Button>
                    <Link to="/login" className="text-sm text-center" style={{ color: "#25245e" }}>
                      Retour à la connexion
                    </Link>
                  </CardFooter>
                </form>
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle>Nouveau mot de passe</CardTitle>
                  <CardDescription>Choisissez un nouveau mot de passe pour votre compte.</CardDescription>
                </CardHeader>
                <form onSubmit={handleUpdate}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">Nouveau mot de passe</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="8 caractères minimum"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          required
                          className="pr-10"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          aria-label={showPassword ? "Masquer" : "Voir"}>
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" className="w-full font-bold" style={{ background: "#f2901e", color: "#fff", border: "none" }} disabled={isLoading}>
                      {isLoading ? "Mise à jour..." : "Mettre à jour mon mot de passe"}
                    </Button>
                  </CardFooter>
                </form>
              </>
            )}
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ResetPassword;
