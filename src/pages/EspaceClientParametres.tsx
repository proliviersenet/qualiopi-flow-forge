import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import ClientHeader from "@/components/ClientHeader";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { validatePassword } from "@/lib/passwordUtils";

const EspaceClientParametres = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();

  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }

    const init = async () => {
      const u = authSession.user;
      const role = u.user_metadata?.role;
      if (role && role !== "client") { navigate("/dashboard"); return; }

      setUser({ name: u.user_metadata?.nom_complet || u.email || "", email: u.email || "" });
      setLoading(false);
    };
    init();
  }, [navigate, authSession, authLoading]);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswordForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const savePassword = async () => {
    if (!passwordForm.newPassword) {
      toast({ title: "Erreur", description: "Le mot de passe ne peut pas être vide.", variant: "destructive" });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas.", variant: "destructive" });
      return;
    }
    const check = validatePassword(passwordForm.newPassword);
    if (!check.valid) {
      toast({ title: "Mot de passe insuffisant", description: check.message, variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setPasswordForm({ newPassword: "", confirmPassword: "" });
      toast({ title: "Mot de passe mis à jour", description: "Votre mot de passe a bien été modifié." });
    }
    setSavingPassword(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <ClientHeader active="parametres" email={user?.email} onLogout={handleLogout} />
        <main className="flex-grow flex items-center justify-center">
          <p className="text-gray-400">Chargement...</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ClientHeader active="parametres" email={user?.email} onLogout={handleLogout} />

      <main className="flex-grow py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-3xl font-bold mb-8" style={{ color: "#25245e" }}>Paramètres</h1>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: "#25245e" }}>🔐 Sécurité</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">Modifier votre mot de passe de connexion.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nouveau mot de passe</Label>
                  <Input
                    type="password"
                    name="newPassword"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordChange}
                    placeholder="Ex: MonMot2Passe!"
                  />
                  {passwordForm.newPassword.length > 0 && (() => {
                    const check = validatePassword(passwordForm.newPassword);
                    return (
                      <div className="space-y-1 pt-1">
                        {check.rules.map((rule) => (
                          <div key={rule.label} className={`flex items-center gap-1.5 text-xs ${rule.ok ? "text-green-600" : "text-gray-400"}`}>
                            <span>{rule.ok ? "✓" : "○"}</span>
                            <span>{rule.label}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-2">
                  <Label>Confirmer le mot de passe</Label>
                  <Input
                    type="password"
                    name="confirmPassword"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordChange}
                    placeholder="Répétez le mot de passe"
                  />
                  {passwordForm.confirmPassword.length > 0 && (
                    <p className={`text-xs ${passwordForm.newPassword === passwordForm.confirmPassword ? "text-green-600" : "text-red-400"}`}>
                      {passwordForm.newPassword === passwordForm.confirmPassword ? "✓ Les mots de passe correspondent" : "○ Les mots de passe ne correspondent pas"}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={savePassword} disabled={savingPassword} style={{ background: "#f2901e", color: "#fff" }} className="font-bold">
                  {savingPassword ? "Mise à jour..." : "Changer le mot de passe"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default EspaceClientParametres;
