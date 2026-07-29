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

const EspaceClientProfil = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();

  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingEntreprise, setSavingEntreprise] = useState(false);

  const [profileForm, setProfileForm] = useState({ nom_complet: "", telephone: "" });
  const [entrepriseForm, setEntrepriseForm] = useState({
    raison_sociale: "",
    siret: "",
    siren: "",
    adresse: "",
    contact_nom: "",
  });

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
      setProfileForm({
        nom_complet: u.user_metadata?.nom_complet || "",
        telephone: u.user_metadata?.telephone || "",
      });

      const { data: clientData } = await supabase
        .from("clients")
        .select("id, raison_sociale, siret, siren, adresse, contact_nom")
        .eq("contact_email", u.email)
        .single();

      if (clientData) {
        const c = clientData as Record<string, string>;
        setClientId(c.id);
        setEntrepriseForm({
          raison_sociale: c.raison_sociale || "",
          siret: c.siret || "",
          siren: c.siren || "",
          adresse: c.adresse || "",
          contact_nom: c.contact_nom || "",
        });
      }

      setLoading(false);
    };
    init();
  }, [navigate, authSession, authLoading]);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleEntrepriseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEntrepriseForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({
      data: { nom_complet: profileForm.nom_complet, telephone: profileForm.telephone },
    });
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setUser((prev) => prev ? { ...prev, name: profileForm.nom_complet } : prev);
      toast({ title: "Profil mis à jour", description: "Vos informations personnelles ont été enregistrées." });
    }
    setSavingProfile(false);
  };

  const saveEntreprise = async () => {
    if (!clientId) return;
    setSavingEntreprise(true);
    // Fiche considérée complète dès que les champs essentiels sont renseignés —
    // fait disparaître le bandeau "Complétez votre profil" sur /espace-client.
    const complete = !!(entrepriseForm.raison_sociale && entrepriseForm.adresse && entrepriseForm.contact_nom);
    const { error } = await supabase
      .from("clients")
      .update({
        raison_sociale: entrepriseForm.raison_sociale,
        siret: entrepriseForm.siret,
        siren: entrepriseForm.siren,
        adresse: entrepriseForm.adresse,
        contact_nom: entrepriseForm.contact_nom,
        onboarding_complete: complete,
      })
      .eq("id", clientId);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Entreprise mise à jour", description: "Les informations de votre entreprise ont été enregistrées." });
    }
    setSavingEntreprise(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <ClientHeader active="profil" email={user?.email} onLogout={handleLogout} />
        <main className="flex-grow flex items-center justify-center">
          <p className="text-gray-400">Chargement...</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ClientHeader active="profil" email={user?.email} onLogout={handleLogout} />

      <main className="flex-grow py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-3xl font-bold mb-8" style={{ color: "#25245e" }}>Mon profil</h1>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: "#25245e" }}>Informations personnelles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom complet</Label>
                  <Input name="nom_complet" value={profileForm.nom_complet} onChange={handleProfileChange} placeholder="Prénom Nom" />
                </div>
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input name="telephone" value={profileForm.telephone} onChange={handleProfileChange} placeholder="06 00 00 00 00" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ""} disabled className="bg-gray-100 text-gray-500" />
                <p className="text-xs text-gray-400">L'email ne peut pas être modifié ici.</p>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveProfile} disabled={savingProfile} style={{ background: "#f2901e", color: "#fff" }} className="font-bold">
                  {savingProfile ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {clientId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg" style={{ color: "#25245e" }}>Mon entreprise</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Raison sociale</Label>
                    <Input name="raison_sociale" value={entrepriseForm.raison_sociale} onChange={handleEntrepriseChange} placeholder="Nom de votre entreprise" />
                  </div>
                  <div className="space-y-2">
                    <Label>SIRET</Label>
                    <Input name="siret" value={entrepriseForm.siret} onChange={handleEntrepriseChange} placeholder="ex: 892 787 458 000 17" />
                  </div>
                  <div className="space-y-2">
                    <Label>SIREN</Label>
                    <Input name="siren" value={entrepriseForm.siren} onChange={handleEntrepriseChange} placeholder="ex: 892 787 458" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Adresse</Label>
                    <Input name="adresse" value={entrepriseForm.adresse} onChange={handleEntrepriseChange} placeholder="Adresse complète de l'entreprise" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Nom du contact</Label>
                    <Input name="contact_nom" value={entrepriseForm.contact_nom} onChange={handleEntrepriseChange} placeholder="Prénom Nom du référent" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveEntreprise} disabled={savingEntreprise} style={{ background: "#f2901e", color: "#fff" }} className="font-bold">
                    {savingEntreprise ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default EspaceClientProfil;
