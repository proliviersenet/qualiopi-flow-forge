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

// Chantier "2FA" (14/09, point 13 de l'audit) : facteur TOTP tel que renvoyé
// par supabase.auth.mfa.listFactors() — on ne garde que les champs utilisés
// ici plutôt que le type complet du SDK.
type FacteurMfa = { id: string; status: string; friendly_name?: string | null };

const Settings = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading, refreshMfaStatus } = useAuth();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);
  const [notifRelances, setNotifRelances] = useState(true);
  const [notifSignatures, setNotifSignatures] = useState(true);

  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("idle");
  const [deleting, setDeleting] = useState(false);
  const [payingStripe, setPayingStripe] = useState(false);

  // Chantier "2FA" (14/09, point 13 de l'audit) : activation opt-in de la
  // double authentification (TOTP), proposée ici dans la carte "Sécurité"
  // existante, sur le même principe que le tunnel de suppression de compte
  // ci-dessous (étapes successives dans un état local dédié).
  const [mfaFactors, setMfaFactors] = useState<FacteurMfa[]>([]);
  const [mfaLoadingList, setMfaLoadingList] = useState(true);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaPendingFactorId, setMfaPendingFactorId] = useState<string | null>(null);
  const [mfaQrCode, setMfaQrCode] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState("");
  const [mfaVerifying, setMfaVerifying] = useState(false);
  const [mfaUnenrollingId, setMfaUnenrollingId] = useState<string | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const chargerFacteursMfa = async () => {
    setMfaLoadingList(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error && data) {
      setMfaFactors(data.totp.map((f) => ({ id: f.id, status: f.status, friendly_name: f.friendly_name })));
    }
    setMfaLoadingList(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    // Point non bloquant (audit test grandeur réelle 01/08) : redirige un
    // compte client vers son espace au lieu de laisser voir l'UI formateur.
    if (authSession.user.user_metadata?.role === "client") { navigate("/espace-client"); return; }

    const init = async () => {
      const u = authSession.user;
      setUser({ name: u.user_metadata?.nom_complet || u.email || "", email: u.email || "", profileImage: "" });
      setNotifRelances(u.user_metadata?.notif_relances !== false);
      setNotifSignatures(u.user_metadata?.notif_signatures !== false);
      await chargerFacteursMfa();
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
    const { data, error } = await supabase.functions.invoke("changer-mot-de-passe", {
      body: { newPassword: passwordForm.newPassword },
    });
    if (error || data?.error) {
      let message = data?.error || error?.message;
      const ctx = (error as { context?: Response })?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          if (body?.error) message = body.error;
        } catch {
          // corps non-JSON, on garde le message par défaut
        }
      }
      toast({ title: "Erreur", description: message, variant: "destructive" });
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

  // Chantier "2FA" — étape 1 : démarre l'activation (génère le secret + QR
  // code côté Supabase, non encore vérifié tant que confirmerActivationMfa
  // n'a pas réussi).
  const demarrerActivationMfa = async () => {
    setMfaEnrolling(true);
    setMfaVerifyCode("");
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `QualioFlex ${new Date().toLocaleDateString("fr-FR")}`,
    });
    if (error || !data) {
      toast({ title: "Erreur", description: error?.message || "Impossible de démarrer l'activation.", variant: "destructive" });
      setMfaEnrolling(false);
      return;
    }
    setMfaPendingFactorId(data.id);
    setMfaQrCode(data.totp.qr_code);
    setMfaSecret(data.totp.secret);
  };

  const annulerActivationMfa = async () => {
    if (mfaPendingFactorId) {
      await supabase.auth.mfa.unenroll({ factorId: mfaPendingFactorId });
    }
    setMfaEnrolling(false);
    setMfaPendingFactorId(null);
    setMfaQrCode(null);
    setMfaSecret(null);
    setMfaVerifyCode("");
  };

  // Chantier "2FA" — étape 2 : vérifie le code à 6 chiffres pour confirmer
  // que l'application d'authentification est bien configurée, et n'active
  // le facteur qu'à ce moment-là (Supabase le considère "verified").
  const confirmerActivationMfa = async () => {
    if (!mfaPendingFactorId) return;
    if (mfaVerifyCode.trim().length !== 6) {
      toast({ title: "Code invalide", description: "Saisissez le code à 6 chiffres affiché par votre application d'authentification.", variant: "destructive" });
      return;
    }
    setMfaVerifying(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaPendingFactorId, code: mfaVerifyCode.trim() });
    setMfaVerifying(false);
    if (error) {
      toast({ title: "Code incorrect", description: "Vérifiez le code affiché par votre application et réessayez.", variant: "destructive" });
      return;
    }
    toast({ title: "Double authentification activée", description: "Un code vous sera désormais demandé à chaque connexion." });
    setMfaEnrolling(false);
    setMfaPendingFactorId(null);
    setMfaQrCode(null);
    setMfaSecret(null);
    setMfaVerifyCode("");
    await chargerFacteursMfa();
    await refreshMfaStatus();
  };

  const desactiverMfa = async (factorId: string) => {
    setMfaUnenrollingId(factorId);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setMfaUnenrollingId(null);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Double authentification désactivée" });
    await chargerFacteursMfa();
    await refreshMfaStatus();
  };

  // Demande de suppression de compte : rend le compte immédiatement inaccessible
  // (le formateur ne peut plus se reconnecter) mais NE supprime PAS les données —
  // celles-ci restent récupérables manuellement par Olivier pendant 30 jours.
  const demanderSuppression = async (avecRecuperation: boolean, modePaiement: "stripe" | "virement" | null) => {
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("demander-suppression-compte", {
      body: { avec_recuperation: avecRecuperation, mode_paiement: modePaiement },
    });
    setDeleting(false);
    if (error || data?.error) {
      let message = data?.error || error?.message;
      const ctx = (error as { context?: Response })?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          if (body?.error) message = body.error;
        } catch {
          // corps non-JSON, on garde le message par défaut
        }
      }
      toast({ title: "Erreur", description: message, variant: "destructive" });
      return;
    }
    setDeleteStep("done");
    // Déconnexion après 3s — le compte est de toute façon déjà bloqué côté serveur
    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate("/login");
    }, 3000);
  };

  // Conservé pour compatibilité : suppression sans récupération de données
  const handleDeleteNoRecovery = () => demanderSuppression(false, null);

  // Paiement Stripe (10 € de frais de récupération de données)
  const payerAvecStripe = async () => {
    setPayingStripe(true);
    const { data, error } = await supabase.functions.invoke("stripe-checkout-recuperation");
    if (error || data?.error) {
      let message = data?.error || error?.message;
      const ctx = (error as { context?: Response })?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          if (body?.error) message = body.error;
        } catch {
          // corps non-JSON, on garde le message par défaut
        }
      }
      toast({ title: "Paiement indisponible", description: message, variant: "destructive" });
      setPayingStripe(false);
      return;
    }
    if (data?.url) {
      window.location.href = data.url;
    } else {
      setPayingStripe(false);
    }
  };

  // Retour depuis Stripe Checkout (succès ou annulation)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paiement = params.get("paiement");
    if (paiement === "succes") {
      window.history.replaceState({}, "", "/settings");
      toast({ title: "Paiement reçu", description: "Merci ! Votre demande de suppression avec récupération de données est enregistrée." });
      demanderSuppression(true, "stripe");
    } else if (paiement === "annule") {
      window.history.replaceState({}, "", "/settings");
      toast({ title: "Paiement annulé", description: "Vous pouvez réessayer à tout moment.", variant: "destructive" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const facteursVerifies = mfaFactors.filter((f) => f.status === "verified");

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

              {/* Chantier "2FA" (14/09, point 13 de l'audit) : activation
                  optionnelle d'un second facteur (TOTP, type Google
                  Authenticator/Authy). Volontairement opt-in — l'audit
                  demande d'"étudier l'activation", pas de l'imposer. */}
              <div className="pt-6 mt-2 border-t space-y-4">
                <div>
                  <p className="font-medium text-sm">Double authentification (2FA)</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Ajoutez une couche de sécurité supplémentaire : un code à 6 chiffres généré par une application d'authentification (Google Authenticator, Microsoft Authenticator...) vous sera demandé à chaque connexion.
                  </p>
                </div>

                {mfaLoadingList ? (
                  <p className="text-sm text-gray-400">Chargement...</p>
                ) : mfaEnrolling ? (
                  <div className="bg-gray-50 border rounded-lg p-4 space-y-3">
                    <p className="text-sm text-gray-600">
                      Scannez ce QR code avec votre application d'authentification, puis saisissez le code à 6 chiffres qu'elle affiche pour confirmer l'activation.
                    </p>
                    {mfaQrCode && (
                      <div className="flex justify-center bg-white p-3 rounded border">
                        <img src={mfaQrCode} alt="QR code d'activation de la double authentification" className="h-40 w-40" />
                      </div>
                    )}
                    {mfaSecret && (
                      <p className="text-xs text-gray-400 text-center break-all">
                        Ou saisissez manuellement cette clé : <span className="font-mono">{mfaSecret}</span>
                      </p>
                    )}
                    <div className="space-y-2 max-w-[200px] mx-auto">
                      <Label htmlFor="mfa-verify-code">Code de vérification</Label>
                      <Input
                        id="mfa-verify-code"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="123456"
                        value={mfaVerifyCode}
                        onChange={(e) => setMfaVerifyCode(e.target.value.replace(/\D/g, ""))}
                        className="text-center tracking-widest"
                      />
                    </div>
                    <div className="flex justify-center gap-2">
                      <Button variant="outline" onClick={annulerActivationMfa} disabled={mfaVerifying}>
                        Annuler
                      </Button>
                      <Button onClick={confirmerActivationMfa} disabled={mfaVerifying} style={{ background: "#f2901e", color: "#fff" }} className="font-bold">
                        {mfaVerifying ? "Vérification..." : "Activer"}
                      </Button>
                    </div>
                  </div>
                ) : facteursVerifies.length > 0 ? (
                  <div className="space-y-2">
                    {facteursVerifies.map((f) => (
                      <div key={f.id} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-sm text-green-700">✓ Double authentification activée{f.friendly_name ? ` — ${f.friendly_name}` : ""}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => desactiverMfa(f.id)}
                          disabled={mfaUnenrollingId === f.id}
                        >
                          {mfaUnenrollingId === f.id ? "Désactivation..." : "Désactiver"}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Button variant="outline" onClick={demarrerActivationMfa} disabled={mfaEnrolling}>
                    Activer la double authentification
                  </Button>
                )}
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
                La suppression de votre compte rend votre accès immédiatement inaccessible. Vos données (formations, sessions, clients, stagiaires, BPF...) sont conservées 30 jours puis définitivement perdues.
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
              <p>Votre espace QualioFlex sera <strong>immédiatement rendu inaccessible</strong> : vous ne pourrez plus vous reconnecter.</p>
              <p className="font-medium text-gray-700">Données concernées :</p>
              <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                <li>Formations et programmes</li>
                <li>Sessions et participations</li>
                <li>Clients et stagiaires</li>
                <li>BPF et documents Qualiopi</li>
                <li>Évaluations et questionnaires</li>
              </ul>
              <p className="text-sm text-gray-500 pt-2">Vos données sont conservées 30 jours (annulation possible via le support durant ce délai), puis définitivement supprimées. Voulez-vous récupérer vos données avant de partir ?</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 pt-2 sm:flex-col">
            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              onClick={() => setDeleteStep("recovery")}
            >
              Continuer sans récupération
            </Button>
            <Button
              variant="outline"
              className="w-full border-orange-300 text-orange-600 hover:bg-orange-50"
              onClick={() => setDeleteStep("recovery")}
            >
              Oui, je veux récupérer mes données
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setDeleteStep("idle")}>
              Annuler
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
          <DialogFooter className="flex flex-col gap-2 pt-2 sm:flex-col">
            <Button
              style={{ background: "#f2901e", color: "#fff" }}
              className="w-full font-bold"
              onClick={() => setDeleteStep("payment")}
            >
              Payer 10 € et récupérer
            </Button>
            <Button
              variant="outline"
              className="w-full border-red-300 text-red-600 hover:bg-red-50"
              onClick={handleDeleteNoRecovery}
              disabled={deleting}
            >
              {deleting ? "Traitement..." : "Supprimer sans récupérer"}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setDeleteStep("idle")}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Étape 3 — Paiement (Stripe Checkout, avec virement en repli) */}
      <Dialog open={deleteStep === "payment"} onOpenChange={() => setDeleteStep("idle")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paiement — 10 €</DialogTitle>
            <DialogDescription className="pt-2 space-y-3">
              <p className="text-sm text-gray-600">
                Réglez les <strong>10 €</strong> de frais de récupération par carte bancaire (paiement sécurisé Stripe).
              </p>
              <Button
                className="w-full font-bold"
                style={{ background: "#635bff", color: "#fff" }}
                onClick={payerAvecStripe}
                disabled={payingStripe}
              >
                {payingStripe ? "Redirection vers Stripe..." : "💳 Payer 10 € par carte"}
              </Button>
              <div className="relative py-1 text-center">
                <span className="text-xs text-gray-400 bg-white px-2">ou par virement</span>
              </div>
              <p className="text-sm text-gray-600">
                Envoyez un virement de <strong>10 €</strong> avec la référence <strong>RECUP-{user?.email}</strong> à :
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
          <DialogFooter className="flex flex-col gap-2 pt-2 sm:flex-col">
            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              onClick={() => demanderSuppression(true, "virement")}
              disabled={deleting}
            >
              {deleting ? "Traitement..." : "J'ai payé par virement — supprimer mon compte"}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setDeleteStep("idle")}>
              Annuler
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
              <p>Votre demande de suppression a bien été prise en compte. Votre compte est <strong>immédiatement inaccessible</strong> — vous ne pourrez plus vous reconnecter.</p>
              <p className="text-sm text-gray-500">Vos données sont conservées <strong>30 jours</strong>. Si vous changez d'avis durant ce délai, contactez le support pour annuler la suppression. Passé ce délai, il ne sera plus possible d'y accéder ni de les récupérer.</p>
              <p className="text-sm text-gray-400">Vous allez être déconnecté dans quelques secondes.</p>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Settings;
