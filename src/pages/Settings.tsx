import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";

const Settings = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);
  const [notifRelances, setNotifRelances] = useState(true);
  const [notifSignatures, setNotifSignatures] = useState(true);

  const [passwordForm, setPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }

      const u = session.user;
      setUser({
        name: u.user_metadata?.nom_complet || u.email || "",
        email: u.email || "",
        profileImage: "",
      });

      // Récupérer préférences depuis user_metadata si elles existent
      setNotifRelances(u.user_metadata?.notif_relances !== false);
      setNotifSignatures(u.user_metadata?.notif_signatures !== false);

      setLoading(false);
    };
    init();
  }, [navigate]);

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
    if (passwordForm.newPassword.length < 8) {
      toast({ title: "Erreur", description: "Le mot de passe doit contenir au moins 8 caractères.", variant: "destructive" });
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

  const saveNotifications = async () => {
    const { error } = await supabase.auth.updateUser({
      data: {
        notif_relances: notifRelances,
        notif_signatures: notifSignatures,
      },
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Préférences enregistrées" });
    }
  };

  if (loading) {
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

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />

      <main className="flex-grow bg-gray-50 py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-3xl font-bold mb-8">Paramètres</h1>

          {/* Sécurité */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: "#25245e" }}>
                🔐 Sécurité
              </CardTitle>
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
                    placeholder="8 caractères minimum"
                  />
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
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={savePassword}
                  disabled={savingPassword}
                  style={{ background: "#f2901e", color: "#fff" }}
                  className="font-bold"
                >
                  {savingPassword ? "Mise à jour..." : "Changer le mot de passe"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: "#25245e" }}>
                🔔 Notifications email
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-gray-500">Choisissez les emails automatiques que vous souhaitez recevoir.</p>

              <div className="flex items-center justify-between py-2 border-b">
                <div>
                  <p className="font-medium text-sm">Relances automatiques</p>
                  <p className="text-xs text-gray-400">Rappels avant expiration de documents Qualiopi</p>
                </div>
                <Switch
                  checked={notifRelances}
                  onCheckedChange={setNotifRelances}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-sm">Signatures électroniques</p>
                  <p className="text-xs text-gray-400">Confirmation quand un document est signé via DocuSign</p>
                </div>
                <Switch
                  checked={notifSignatures}
                  onCheckedChange={setNotifSignatures}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={saveNotifications}
                  style={{ background: "#f2901e", color: "#fff" }}
                  className="font-bold"
                >
                  Enregistrer les préférences
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Danger zone */}
          <Card className="border-red-100">
            <CardHeader>
              <CardTitle className="text-lg text-red-600">
                ⚠️ Zone de danger
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                La suppression de votre compte est irréversible. Toutes vos formations, sessions et documents seront perdus définitivement.
              </p>
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => toast({
                  title: "Action non disponible",
                  description: "Pour supprimer votre compte, contactez le support : olivier@exsenco.fr",
                  variant: "destructive",
                })}
              >
                Supprimer mon compte
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Settings;
