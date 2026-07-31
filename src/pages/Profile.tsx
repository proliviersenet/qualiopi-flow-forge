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
import { useAuth } from "@/contexts/AuthContext";

const Profile = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [organismeId, setOrganismeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profileForm, setProfileForm] = useState({
    nom_complet: "",
    telephone: "",
  });

  const [orgForm, setOrgForm] = useState({
    raison_sociale: "",
    siret: "",
    siren: "",
    nda: "",
    adresse: "",
    code_naf: "",
    site_web: "",
    telephone: "",
    email_contact: "",
    logo_url: "",
    date_dernier_audit_surveillance: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }

    const init = async () => {
      const u = authSession.user;
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
        .select("organisme_id")
        .eq("id", u.id)
        .single();

      if (profile?.organisme_id) {
        setOrganismeId(profile.organisme_id);

        const { data: org } = await supabase
          .from("organismes")
          .select("*")
          .eq("id", profile.organisme_id)
          .single();

        if (org) {
          const o = org as Record<string, string>;
          setOrgForm({
            raison_sociale: o.raison_sociale || "",
            siret: o.siret || "",
            siren: o.siren || "",
            nda: o.nda || "",
            adresse: o.adresse || "",
            code_naf: o.code_naf || "",
            site_web: o.site_web || "",
            telephone: o.telephone || "",
            email_contact: o.email_contact || "",
            logo_url: o.logo_url || "",
            date_dernier_audit_surveillance: o.date_dernier_audit_surveillance || "",
          });
          if (o.logo_url) setLogoPreview(o.logo_url);
        }
      }

      setLoading(false);
    };
    init();
  }, [navigate, authSession, authLoading]);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleOrgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOrgForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const saveProfile = async () => {
    setSaving(true);
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

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Format non supporté", description: "PNG, JPG, WebP ou SVG uniquement.", variant: "destructive" }); return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async () => {
    if (!logoFile || !organismeId) return;
    setUploadingLogo(true);
    const ext = logoFile.name.split(".").pop();
    const path = `logos/${organismeId}/logo.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("documents-qualiopi")
      .upload(path, logoFile, { upsert: true, contentType: logoFile.type });

    if (upErr) {
      toast({ title: "Erreur upload logo", description: upErr.message, variant: "destructive" });
      setUploadingLogo(false); return;
    }

    const { data: urlData } = supabase.storage.from("documents-qualiopi").getPublicUrl(path);
    const logoUrl = urlData?.publicUrl || "";

    const { error: updateErr } = await supabase
      .from("organismes")
      .update({ logo_url: logoUrl })
      .eq("id", organismeId);

    setUploadingLogo(false);
    if (updateErr) {
      toast({ title: "Erreur mise à jour logo", description: updateErr.message, variant: "destructive" }); return;
    }
    setOrgForm(prev => ({ ...prev, logo_url: logoUrl }));
    toast({ title: "✅ Logo uploadé", description: "Votre logo sera intégré dans les documents générés." });
  };

  const saveOrganisme = async () => {
    if (!organismeId) return;
    setSaving(true);
    const { error } = await supabase
      .from("organismes")
      .update({
        raison_sociale: orgForm.raison_sociale,
        nda: orgForm.nda,
        adresse: orgForm.adresse,
        code_naf: orgForm.code_naf,
        site_web: orgForm.site_web,
        telephone: orgForm.telephone,
        email_contact: orgForm.email_contact,
        date_dernier_audit_surveillance: orgForm.date_dernier_audit_surveillance || null,
      })
      .eq("id", organismeId);

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
                <p className="text-xs text-gray-400">L'email ne peut pas être modifié ici.</p>
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
          {organismeId && (
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
                    <Input value={orgForm.siret} disabled className="bg-gray-100 text-gray-500" />
                    <p className="text-xs text-gray-400">Non modifiable.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>SIREN</Label>
                    <Input value={orgForm.siren} disabled className="bg-gray-100 text-gray-500" />
                  </div>

                  <div className="space-y-2">
                    <Label>NDA (N° déclaration d'activité)</Label>
                    <Input
                      name="nda"
                      value={orgForm.nda}
                      onChange={handleOrgChange}
                      placeholder="ex: 24370470637"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Adresse</Label>
                    <Input
                      name="adresse"
                      value={orgForm.adresse}
                      onChange={handleOrgChange}
                      placeholder="80 rue du Nouveau Bois, 37550 Saint-Avertin"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Code NAF</Label>
                    <Input
                      name="code_naf"
                      value={orgForm.code_naf}
                      onChange={handleOrgChange}
                      placeholder="ex: 8559A"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Site web</Label>
                    <Input
                      name="site_web"
                      value={orgForm.site_web}
                      onChange={handleOrgChange}
                      placeholder="https://monsite.fr"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Téléphone de l'organisme</Label>
                    <Input
                      name="telephone"
                      value={orgForm.telephone}
                      onChange={handleOrgChange}
                      placeholder="02 47 00 00 00"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Date du dernier audit de surveillance Qualiopi</Label>
                    <Input
                      type="date"
                      name="date_dernier_audit_surveillance"
                      value={orgForm.date_dernier_audit_surveillance}
                      onChange={handleOrgChange}
                    />
                    <p className="text-xs text-gray-400">
                      {orgForm.date_dernier_audit_surveillance
                        ? `Les formations publiées non mises à jour depuis cette date seront archivées automatiquement à partir du ${new Date(
                            new Date(orgForm.date_dernier_audit_surveillance).setMonth(
                              new Date(orgForm.date_dernier_audit_surveillance).getMonth() + 18
                            )
                          ).toLocaleDateString("fr-FR")} (18 mois après l'audit).`
                        : "Sert de référence pour l'archivage automatique de tes formations (18 mois après cette date, celles non mises à jour depuis sont archivées)."}
                    </p>
                  </div>

                  {/* Logo */}
                  <div className="space-y-2 md:col-span-2">
                    <Label>Logo de l'organisme</Label>
                    <p className="text-xs text-gray-400">Sera intégré automatiquement dans tous les documents générés (PNG, JPG, WebP, SVG)</p>
                    <div className="flex items-center gap-4">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="h-16 w-auto object-contain border rounded-lg p-2 bg-gray-50" />
                      ) : (
                        <div className="h-16 w-24 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-gray-300 text-xs">Logo</div>
                      )}
                      <div className="flex gap-2">
                        <label htmlFor="logo-upload" className="cursor-pointer">
                          <div className="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
                            {logoPreview ? "Changer" : "Choisir un logo"}
                          </div>
                          <input id="logo-upload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoChange} />
                        </label>
                        {logoFile && (
                          <Button size="sm" onClick={uploadLogo} disabled={uploadingLogo} style={{ background: "#f2901e", color: "#fff" }} className="font-bold">
                            {uploadingLogo ? "Upload..." : "Enregistrer le logo"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Email de contact</Label>
                    <Input
                      name="email_contact"
                      value={orgForm.email_contact}
                      onChange={handleOrgChange}
                      placeholder="contact@monof.fr"
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
