import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const InvitationClient = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<"verification" | "siren" | "compte" | "done" | "invalide">("verification");
  const [invitation, setInvitation] = useState<Record<string, string> | null>(null);
  const [entreprise, setEntreprise] = useState<{ nom: string; adresse: string; siret: string } | null>(null);
  const [siren, setSiren] = useState("");
  const [sirenLoading, setSirenLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // Vérification du token
  useEffect(() => {
    const verifierToken = async () => {
      const { data, error } = await supabase
        .from("invitations_clients")
        .select("*")
        .eq("token", token)
        .eq("statut", "en_attente")
        .gte("expires_at", new Date().toISOString())
        .single();

      if (error || !data) {
        setStep("invalide");
        return;
      }
      setInvitation(data as Record<string, string>);
      setStep("siren");
    };
    if (token) verifierToken();
  }, [token]);

  const rechercherSiren = async () => {
    const sirenPropre = siren.replace(/\s/g, "");
    if (sirenPropre.length !== 9) {
      toast({ title: "SIREN invalide", description: "Le SIREN doit contenir 9 chiffres.", variant: "destructive" });
      return;
    }
    setSirenLoading(true);
    try {
      const resp = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${sirenPropre}&page=1&per_page=1`);
      const json = await resp.json();
      if (!json.results?.length) throw new Error("Non trouvé");
      const r = json.results[0];
      setEntreprise({
        nom: r.nom_raison_sociale || r.nom_complet || "",
        adresse: r.siege?.adresse || "",
        siret: r.siege?.siret || sirenPropre + "00000",
      });
      setStep("compte");
    } catch {
      toast({ title: "SIREN introuvable", description: "Vérifiez votre numéro SIREN (9 chiffres).", variant: "destructive" });
    } finally {
      setSirenLoading(false);
    }
  };

  const creerCompte = async () => {
    if (!password || password.length < 8) {
      toast({ title: "Mot de passe trop court", description: "8 caractères minimum.", variant: "destructive" }); return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Les mots de passe ne correspondent pas", variant: "destructive" }); return;
    }
    if (!invitation || !entreprise) return;

    setSaving(true);
    try {
      // 1. Créer le compte Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: { data: { nom_complet: entreprise.nom, role: "client" } },
      });

      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error("Erreur création compte");

      // 2. Créer le client dans la table clients
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .insert({
          organisme_id: invitation.organisme_id,
          siret: entreprise.siret,
          siren: siren.replace(/\s/g, ""),
          raison_sociale: entreprise.nom,
          adresse: entreprise.adresse,
          contact_email: invitation.email,
        })
        .select()
        .single();

      if (clientError) throw clientError;

      // 3. Marquer l'invitation comme utilisée
      await supabase
        .from("invitations_clients")
        .update({ statut: "utilisee" })
        .eq("token", token);

      setStep("done");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─── ÉCRANS ───

  if (step === "verification") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Vérification de votre invitation...</p>
      </div>
    );
  }

  if (step === "invalide") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-4xl mb-4">❌</p>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Lien invalide ou expiré</h2>
            <p className="text-gray-500 text-sm">Ce lien d'invitation n'est plus valide (expiré après 7 jours ou déjà utilisé). Contactez votre formateur pour recevoir un nouveau lien.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-5xl mb-4">🎉</p>
            <h2 className="text-xl font-bold mb-2" style={{ color: "#25245e" }}>Votre espace est créé !</h2>
            <p className="text-gray-500 text-sm mb-6">Bienvenue sur QalioFlex. Votre formateur a été notifié et va prochainement affecter vos formations. Vous pouvez maintenant vous connecter.</p>
            <Button
              onClick={() => navigate("/login")}
              style={{ background: "#f2901e", color: "#fff" }}
              className="font-bold w-full"
            >
              Me connecter →
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "#25245e" }}>QalioFlex</h1>
          <p className="text-sm text-gray-400">by ExSenCo</p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Étape 1 — SIREN */}
            {step === "siren" && (
              <>
                <div className="text-center pb-2">
                  <p className="text-2xl mb-2">🏢</p>
                  <h2 className="text-xl font-bold" style={{ color: "#25245e" }}>Créez votre espace client</h2>
                  <p className="text-sm text-gray-500 mt-1">Invitation reçue pour <strong>{invitation?.email}</strong></p>
                </div>
                <div className="space-y-2">
                  <Label>Votre numéro SIREN <span className="text-red-500">*</span></Label>
                  <p className="text-xs text-gray-400">9 chiffres — trouvez-le sur votre Kbis ou sur societe.com</p>
                  <div className="flex gap-2">
                    <Input
                      value={siren}
                      onChange={e => setSiren(e.target.value)}
                      placeholder="ex: 892787458"
                      maxLength={9}
                      onKeyDown={e => e.key === "Enter" && rechercherSiren()}
                    />
                    <Button
                      onClick={rechercherSiren}
                      disabled={sirenLoading}
                      style={{ background: "#25245e", color: "#fff" }}
                    >
                      {sirenLoading ? "..." : "Valider"}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Étape 2 — Création compte */}
            {step === "compte" && entreprise && (
              <>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-700 font-medium">✓ Entreprise trouvée</p>
                  <p className="font-bold text-gray-800 mt-1">{entreprise.nom}</p>
                  {entreprise.adresse && <p className="text-xs text-gray-500 mt-0.5">{entreprise.adresse}</p>}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email de connexion</Label>
                    <Input value={invitation?.email || ""} disabled className="bg-gray-100 text-gray-500" />
                  </div>
                  <div className="space-y-2">
                    <Label>Mot de passe <span className="text-red-500">*</span></Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="8 caractères minimum"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirmer le mot de passe <span className="text-red-500">*</span></Label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Répétez le mot de passe"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("siren")} className="flex-1">
                    Retour
                  </Button>
                  <Button
                    onClick={creerCompte}
                    disabled={saving}
                    style={{ background: "#f2901e", color: "#fff" }}
                    className="font-bold flex-1"
                  >
                    {saving ? "Création..." : "Créer mon espace →"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          QalioFlex by SARL EXSENCO · <a href="https://qualioflex.fr/confidentialite" className="hover:underline">Confidentialité</a>
        </p>
      </div>
    </div>
  );
};

export default InvitationClient;
