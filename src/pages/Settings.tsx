import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { validatePassword } from "@/lib/passwordUtils";

// Étapes du tunnel de suppression
type DeleteStep = "idle" | "confirm" | "recovery" | "payment" | "done";

const Settings = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);
  const [notifRelances, setNotifRelances] = useState(true);
  const [notifSignatures, setNotifSignatures] = useState(true);

  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("idle");
  const [deleting, setDeleting] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }

    const init = async () => {
      const u = authSession.user;
      setUser({ name: u.user_metadata?.nom_complet || u.email || "", email: u.email || "", profileImage: "" });
      setNotifRelances(u.user_metadata?.notif_relances !== false);
      setNotifSignatures(u.user_metadata?.notif_signatures !== false);
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

  const saveNotifications = async () => {
    const { error } = await supabase.auth.updateUser({
      data: { notif_relances: notifRelances, notif_signatures: notifSignatures },
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Préférences enregistrées" });
    }
  };

  // Suppression sans récupération — marque le compte comme "à supprimer"
  const handleDeleteNoRecovery = async () => {
    setDeleting(true);
    const { error } = await supabase.auth.updateUser({
      data: { deletion_requested: true, deletion_requested_at: new Date().toISOString() },
    });
    setDeleting(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    setDeleteStep("done");
    // Déconnexion après 3s
    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate("/login");
    }, 3000);
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
                  {/* Indicateur de force */}
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

          {/* Notifications */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: "#25245e" }}>🔔 Notifications email</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-gray-500">Choisissez les emails automatiques que vous souhaitez recevoir.</p>
              <div className="flex items-center justify-between py-2 border-b">
                <div>
                  <p className="font-medium text-sm">Relances automatiques</p>
                  <p className="text-xs text-gray-400">Rappels avant expiration de documents Qualiopi</p>
                </div>
                <Switch checked={notifRelances} onCheckedChange={setNotifRelances} />
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-sm">Signatures électroniques</p>
                  <p className="text-xs text-gray-400">Confirmation quand un document est signé via DocuSign</p>
                </div>
                <Switch checked={notifSignatures} onCheckedChange={setNotifSignatures} />
              </div>
              <div className="flex justify-end">
                <Button onClick={saveNotifications} style={{ background: "#f2901e", color: "#fff" }} className="font-bold">
                  Enregistrer les préférences
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Zone de danger */}
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-lg text-red-600">⚠️ Zone de danger</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                La suppression de votre compte est irréversible. Toutes vos données (formations, sessions, clients, stagiaires, BPF...) seront définitivement perdues.
              </p>
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => setDeleteStep("confirm")}
              >
                Supprimer mon compte
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />

      {/* ─── TUNNEL SUPPRESSION DE COMPTE ─── */}

      {/* Étape 1 — Confirmation initiale */}
      <Dialog open={deleteStep === "confirm"} onOpenChange={() => setDeleteStep("idle")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Supprimer votre compte ?</DialogTitle>
            <DialogDescription className="pt-2 space-y-2">
              <p>Vous êtes sur le point de supprimer définitivement votre espace QalioFlex.</p>
              <p className="font-medium text-gray-700">Données concernées :</p>
              <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                <li>Formations et programmes</li>
                <li>Sessions et participations</li>
                <li>Clients et stagiaires</li>
                <li>BPF et documents Qualiopi</li>
                <li>Évaluations et questionnaires</li>
              </ul>
              <p className="text-sm text-gray-500 pt-2">Voulez-vous récupérer vos données avant de partir ?</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteStep("idle")}>
              Annuler
            </Button>
            <Button
              variant="outline"
              className="border-orange-300 text-orange-600 hover:bg-orange-50"
              onClick={() => setDeleteStep("recovery")}
            >
              Oui, je veux récupérer mes données
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => setDeleteStep("recovery")}
            >
              Continuer sans récupération
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Étape 2 — Récupération des données */}
      <Dialog open={deleteStep === "recovery"} onOpenChange={() => setDeleteStep("idle")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Récupérer vos données</DialogTitle>
            <DialogDescription className="pt-2 space-y-3">
              <p>Vous pouvez recevoir l'export complet de vos données (formations, sessions, clients, stagiaires, BPF, documents) au format ZIP.</p>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-sm font-medium text-orange-800">Frais de récupération technique : <span className="text-lg">10 €</span></p>
                <p className="text-xs text-orange-600 mt-1">Paiement sécurisé par CB — traitement sous 48h ouvrées</p>
              </div>
              <p className="text-sm text-gray-500">Souhaitez-vous payer 10 € pour récupérer l'intégralité de vos données ?</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteStep("idle")}>
              Annuler
            </Button>
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
              onClick={handleDeleteNoRecovery}
              disabled={deleting}
            >
              {deleting ? "Traitement..." : "Supprimer sans récupérer"}
            </Button>
            <Button
              style={{ background: "#f2901e", color: "#fff" }}
              className="font-bold"
              onClick={() => setDeleteStep("payment")}
            >
              Payer 10 € et récupérer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Étape 3 — Paiement (placeholder Stripe) */}
      <Dialog open={deleteStep === "payment"} onOpenChange={() => setDeleteStep("idle")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paiement — 10 €</DialogTitle>
            <DialogDescription className="pt-2 space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-700 font-medium">Module de paiement en cours d'intégration</p>
                <p className="text-xs text-blue-500 mt-1">(Stripe — disponible prochainement)</p>
              </div>
              <p className="text-sm text-gray-600">
                En attendant, envoyez un virement de <strong>10 €</strong> avec la référence <strong>RECUP-{user?.email}</strong> à :
              </p>
              <div className="bg-gray-50 rounded-lg p-3 text-sm font-mono">
                <p>EXSENCO</p>
                <p>IBAN : FR76 XXXX XXXX XXXX XXXX XXXX XXX</p>
              </div>
              <p className="text-xs text-gray-400">
                Votre export sera envoyé à <strong>{user?.email}</strong> sous 48h ouvrées après réception du paiement.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteStep("idle")}>
              Annuler
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteNoRecovery}
              disabled={deleting}
            >
              {deleting ? "Traitement..." : "J'ai payé — supprimer mon compte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Étape 4 — Confirmation finale */}
      <Dialog open={deleteStep === "done"} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demande enregistrée</DialogTitle>
            <DialogDescription className="pt-2 space-y-2">
              <p>Votre demande de suppression a bien été prise en compte.</p>
              <p className="text-sm text-gray-500">Votre compte sera supprimé dans les <strong>48h ouvrées</strong>. Vous allez être déconnecté dans quelques secondes.</p>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Settings;
