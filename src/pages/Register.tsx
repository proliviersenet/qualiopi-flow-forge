import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import Footer from "@/components/Footer";

const Register = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [siretLoading, setSiretLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "formateur_certifie",
    siret: "",
    raisonSociale: "",
    adresse: "",
    codeNaf: "",
    telephone: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleRoleChange = (value: string) => {
    setFormData({ ...formData, role: value });
  };

  // Autocomplétion via API Sirene INSEE
  const fetchSiret = async () => {
    const siret = formData.siret.replace(/\s/g, "");
    if (siret.length !== 14) {
      toast({ title: "SIRET invalide", description: "Le SIRET doit contenir 14 chiffres", variant: "destructive" });
      return;
    }
    setSiretLoading(true);
    try {
      const resp = await fetch(
        `https://api.insee.fr/entreprises/sirene/V3.11/siret/${siret}`,
        { headers: { "Authorization": "Bearer 6240282d-6270-4698-8028-2d6270f69821", "Accept": "application/json" } }
      );
      if (!resp.ok) throw new Error("Entreprise non trouvée");
      const data = await resp.json();
      const u = data.etablissement;
      const nom = u.uniteLegale?.denominationUniteLegale ||
        `${u.uniteLegale?.prenomUsuelUniteLegale || ""} ${u.uniteLegale?.nomUniteLegale || ""}`.trim();
      const naf = u.uniteLegale?.activitePrincipaleUniteLegale || "";
      const cp = u.adresseEtablissement?.codePostalEtablissement || "";
      const ville = u.adresseEtablissement?.libelleCommuneEtablissement || "";
      const voie = u.adresseEtablissement?.libelleVoieEtablissement || "";
      const numVoie = u.adresseEtablissement?.numeroVoieEtablissement || "";
      setFormData(prev => ({
        ...prev,
        raisonSociale: nom,
        adresse: `${numVoie} ${voie}, ${cp} ${ville}`.trim(),
        codeNaf: naf,
      }));
      toast({ title: "Entreprise trouvée", description: nom });
    } catch {
      toast({ title: "SIRET non trouvé", description: "Vérifiez le numéro ou saisissez manuellement", variant: "destructive" });
    } finally {
      setSiretLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword) {
      toast({ title: "Erreur", description: "Veuillez remplir tous les champs obligatoires", variant: "destructive" });
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    if (formData.password.length < 8) {
      toast({ title: "Erreur", description: "Le mot de passe doit contenir au moins 8 caractères", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Créer le compte Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: { nom_complet: formData.name }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Erreur lors de la création du compte");

      // 2. Créer l'organisme si SIRET fourni
      if (formData.siret && authData.user) {
        await supabase.from("organismes").insert({
          owner_user_id: authData.user.id,
          siret: formData.siret.replace(/\s/g, ""),
          siren: formData.siret.replace(/\s/g, "").slice(0, 9),
          raison_sociale: formData.raisonSociale,
          adresse: formData.adresse,
          code_naf: formData.codeNaf,
          email_contact: formData.email,
          telephone: formData.telephone,
          nda: "",
        });
      }

      // 3. Mettre à jour le profil avec le rôle
      if (authData.user) {
        await supabase.from("profiles").upsert({
          id: authData.user.id,
          email: formData.email,
          nom_complet: formData.name,
          role: formData.role,
        });
      }

      toast({
        title: "Inscription réussie !",
        description: "Votre espace QalioFlex est prêt.",
      });

      navigate("/dashboard");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Une erreur est survenue";
      toast({ title: "Erreur d'inscription", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-grow flex items-center justify-center p-4 bg-gray-50">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center">
            <Link to="/" className="inline-block">
              <span className="text-blue-600 text-2xl font-bold">QalioFlex</span>
              <span className="text-gray-400 text-xs block">by ExSenCo</span>
            </Link>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Créer votre espace formateur</CardTitle>
              <CardDescription>
                Inscription gratuite — votre espace Qualiopi est prêt en 2 minutes
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">

                {/* Identité */}
                <div className="space-y-2">
                  <Label htmlFor="name">Nom complet *</Label>
                  <Input id="name" name="name" placeholder="Olivier Senet" value={formData.name} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email professionnel *</Label>
                  <Input id="email" name="email" type="email" placeholder="olivier@exsenco.fr" value={formData.email} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telephone">Téléphone</Label>
                  <Input id="telephone" name="telephone" placeholder="06 07 46 74 09" value={formData.telephone} onChange={handleChange} />
                </div>

                {/* SIRET + autocomplétion */}
                <div className="space-y-2">
                  <Label htmlFor="siret">SIRET — complétion automatique</Label>
                  <div className="flex gap-2">
                    <Input
                      id="siret" name="siret"
                      placeholder="89278745800017"
                      maxLength={14}
                      value={formData.siret}
                      onChange={handleChange}
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={fetchSiret} disabled={siretLoading}>
                      {siretLoading ? "..." : "Rechercher"}
                    </Button>
                  </div>
                </div>

                {formData.raisonSociale && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                    <strong>{formData.raisonSociale}</strong><br />
                    {formData.adresse}<br />
                    NAF : {formData.codeNaf}
                  </div>
                )}

                {/* Rôle */}
                <div className="space-y-2">
                  <Label>Je suis *</Label>
                  <RadioGroup value={formData.role} onValueChange={handleRoleChange} className="flex flex-col space-y-1">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="formateur_certifie" id="formateur_certifie" />
                      <Label htmlFor="formateur_certifie">Formateur indépendant certifié Qualiopi</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="of_complet" id="of_complet" />
                      <Label htmlFor="of_complet">Organisme de formation (OF)</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Mot de passe */}
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe *</Label>
                  <Input id="password" name="password" type="password" placeholder="8 caractères minimum" value={formData.password} onChange={handleChange} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmer le mot de passe *</Label>
                  <Input id="confirmPassword" name="confirmPassword" type="password" placeholder="••••••••" value={formData.confirmPassword} onChange={handleChange} required />
                </div>

              </CardContent>
              <CardFooter className="flex flex-col">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Création de votre espace..." : "Créer mon espace QalioFlex"}
                </Button>
                <p className="mt-4 text-center text-sm text-gray-600">
                  Déjà un compte ?{" "}
                  <Link to="/login" className="text-blue-600 hover:underline">Se connecter</Link>
                </p>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Register;
