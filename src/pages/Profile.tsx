import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";

const Profile = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [organisme, setOrganisme] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profileForm, setProfileForm] = useState({
    nom_complet: "",
    telephone: "",
  });

  const [orgForm, setOrgForm] = useState({
    raison_sociale: "",
    siret: "",
    nda: "",
    adresse: "",
    code_postal: "",
    ville: "",
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

      setProfileForm({
        nom_complet: u.user_metadata?.nom_complet || "",
        telephone: u.user_metadata?.telephone || "",
      });

      const { data: profile } = await supabase
        .from("profiles")
        .select("*, organisme_id")
        .eq("id", u.id)
        .single();

      if (profile?.organisme_id) {
        const { data: org } = await supabase
          .from("organismes")
          .select("*")
          .eq("id", profile.organisme_id)
          .single();

        if (org) {
          setOrganisme(org as Record<string, string>);
          setOrgForm({
            raison_sociale: (org as Record<string, string>).raison_sociale || "",
            siret: (org as Record<string, string>).siret || "",
            nda: (org as Record<string, string>).nda || "",
            adresse: (org as Record<string, string>).adresse || "",
            code_postal: (org as Record<string, string>).code_postal || "",
            ville: (org as Record<string, string>).ville || "",
          });
        }
      }

      setLoading(false);
    };
    init();
  }, [navigate]);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleOrgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOrgForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const saveProfile = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.auth.updateUser({
      data: {
        nom_complet: profileForm.nom_complet,
        telephone: profileForm.telephone,
      },
    });

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      setUser((prev) => prev ? { ...prev, name: profileForm.nom_complet } : prev);
      toast({ title: "Profil mis à jour", description: "Vos informations personnelles ont été enregistrées." });
    }
    setSaving(false);
  };

  const saveOrganisme = async () => {
    if (!organisme?.id) return;
    setSaving(true);

    const { error } = await supabase
      .from("organismes")
      .update({
        raison_sociale: orgForm.raison_sociale,
        nda: orgForm.nda,
        adresse: orgForm.adresse,
        code_postal: orgForm.code_postal,
        ville: orgForm.ville,
      })
      .eq("id", organisme.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Organisme mis à jour", description: "Les informations de votre organisme ont été enregistrées." });
    }
    setSaving(false);
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
          <h1 className="text-3xl font-bold mb-8">Mon profil</h1>

          {/* Infos personnelles */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: "#25245e" }}>
                Informations personnelles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom complet</Label>
                  <Input
                    name="nom_complet"
                    value={profileForm.nom_complet}
                    onChange={handleProfileChange}
                    placeholder="Prénom Nom"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Téléphone</Label>
                  <Input
                    name="telephone"
                    value={profileForm.telephone}
                    onChange={handleProfileChange}
                    placeholder="06 00 00 00 00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ""} disabled className="bg-gray-100 text-gray-500" />
                <p className="text-xs text-gray-400">L'email ne peut pas être modifié ici. Contactez le support.</p>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={saveProfile}
                  disabled={saving}
                  style={{ background: "#f2901e", color: "#fff" }}
                  className="font-bold"
                >
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Infos organisme */}
          {organisme && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg" style={{ color: "#25245e" }}>
                  Mon organisme de formation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Raison sociale</Label>
                    <Input
                      name="raison_sociale"
                      value={orgForm.raison_sociale}
                      onChange={handleOrgChange}
                      placeholder="Nom de la structure"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SIRET</Label>
                    <Input
                      value={orgForm.siret}
                      disabled
                      className="bg-gray-100 text-gray-500"
                    />
                    <p className="text-xs text-gray-400">Le SIRET ne peut pas être modifié.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>NDA (N° de déclaration d'activité)</Label>
                    <Input
                      name="nda"
                      value={orgForm.nda}
                      onChange={handleOrgChange}
                      placeholder="ex: 24370470637"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Adresse</Label>
                    <Input
                      name="adresse"
                      value={orgForm.adresse}
                      onChange={handleOrgChange}
                      placeholder="80 rue du Nouveau Bois"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Code postal</Label>
                    <Input
                      name="code_postal"
                      value={orgForm.code_postal}
                      onChange={handleOrgChange}
                      placeholder="37550"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ville</Label>
                    <Input
                      name="ville"
                      value={orgForm.ville}
                      onChange={handleOrgChange}
                      placeholder="Saint-Avertin"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={saveOrganisme}
                    disabled={saving}
                    style={{ background: "#f2901e", color: "#fff" }}
                    className="font-bold"
                  >
                    {saving ? "Enregistrement..." : "Enregistrer"}
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

export default Profile;
