import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import Footer from "@/components/Footer";

const Register = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [siretLoading, setSiretLoading] = useState(false);
  const [siretTrouve, setSiretTrouve] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    siret: "",
    siren: "",
    raisonSociale: "",
    nomComplet: "",
    adresse: "",
    codeNaf: "",
    email: "",
    telephone: "",
    password: "",
    confirmPassword: "",
    role: "formateur_certifie",
    nda: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRoleChange = (value: string) => {
    setFormData(prev => ({ ...prev, role: value }));
  };

  // Étape 1 — Recherche SIRET et pré-remplissage automatique
  const fetchSiret = async () => {
    const siret = formData.siret.replace(/\s/g, "");
    if (siret.length !== 14) {
      toast({ title: "SIRET invalide", description: "Le SIRET doit contenir 14 chiffres", variant: "destructive" });
      return;
    }
    setSiretLoading(true);
    setSiretTrouve(false);
    try {
      const resp = await fetch(
        `https://recherche-entreprises.api.gouv.fr/search?q=${siret}&page=1&per_page=1`,
        { headers: { "Accept": "application/json" } }
      );
      if (!resp.ok) throw new Error("Erreur lors de la recherche");
      const json = await resp.json();
      if (!json.results?.length) throw new Error("Entreprise non trouvée");

      const r = json.results[0];
      const siege = r.siege || {};

      // Récupérer le NDA si disponible dans l'API
      const nda = r.complements?.liste_id_organisme_formation?.[0] || "";

      // Pré-remplir TOUS les champs automatiquement
      setFormData(prev => ({
        ...prev,
        siret,
        siren: r.siren || siret.slice(0, 9),
        raisonSociale: r.nom_raison_sociale || r.nom_complet || "",
        nomComplet: r.nom_raison_sociale || r.nom_complet || "",
        adresse: siege.adresse || "",
        codeNaf: r.activite_principale || "",
        nda,
      }));
      setSiretTrouve(true);
      toast({ title: "Entreprise trouvée !", description: `${r.nom_raison_sociale || r.nom_complet} — données pré-remplies` });
    } catch (err) {
      toast({ title: "SIRET non trouvé", description: err instanceof Error ? err.message : "Vérifiez le numéro", variant: "destructive" });
    } finally {
      setSiretLoading(false);
    }
  };

  // Étape 2 — Création de l'espace (auth + organisme + profil)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.password || !formData.confirmPassword) {
      toast({ title: "Erreur", description: "Email et mot de passe obligatoires", variant: "destructive" });
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    if (formData.password.length < 8) {
      toast({ title: "Erreur", description: "Mot de passe : 8 caractères minimum", variant: "destructive" });
      return;
    }
    if (!formData.siret) {
      toast({ title: "SIRET requis", description: "Recherchez votre entreprise par SIRET pour créer votre espace", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Créer le compte Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: { data: { nom_complet: formData.raisonSociale || formData.email } }
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error("Erreur lors de la création du compte");

      // 2. Créer l'organisme avec toutes les données SIRET
      const { data: orgData, error: orgError } = await supabase
        .from("organismes")
        .insert({
          owner_user_id: authData.user.id,
          siret: formData.siret,
          siren: formData.siren,
          raison_sociale: formData.raisonSociale,
          adresse: formData.adresse,
          code_naf: formData.codeNaf,
          nda: formData.nda,
          email_contact: formData.email,
          telephone: formData.telephone,
        })
        .select("id")
        .single();

      if (orgError) throw orgError;

      // 3. Mettre à jour le profil avec le rôle et l'organisme
      await supabase.from("profiles").upsert({
        id: authData.user.id,
        email: formData.email,
        nom_complet: formData.raisonSociale || formData.email,
        role: formData.role,
        organisme_id: orgData?.id,
        onboarding_complete: true,
      });

      toast({ title: "Espace créé !", description: `Bienvenue sur QalioFlex — ${formData.raisonSociale}` });
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
                Commencez par votre SIRET — vos informations sont pré-remplies automatiquement
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">

                {/* ÉTAPE 1 — SIRET */}
                <div className="space-y-2">
                  <Label htmlFor="siret">
                    <span className="inline-flex items-center gap-1">
                      <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">1</span>
                      SIRET de votre entreprise *
                    </span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="siret" name="siret"
                      placeholder="14 chiffres — ex : 89278745800017"
                      maxLength={14}
                      value={formData.siret}
                      onChange={handleChange}
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={fetchSiret} disabled={siretLoading}>
                      {siretLoading ? "Recherche..." : "Rechercher"}
                    </Button>
                  </div>
                </div>

                {/* Résultat SIRET — données auto-remplies */}
                {siretTrouve && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                      <span>✓</span> Entreprise trouvée — informations pré-remplies
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs text-gray-500">Raison sociale</Label>
                        <p className="text-sm font-medium">{formData.raisonSociale}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Adresse</Label>
                        <p className="text-sm">{formData.adresse}</p>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <Label className="text-xs text-gray-500">Code NAF</Label>
                          <p className="text-sm">{formData.codeNaf}</p>
                        </div>
                        {formData.nda && (
                          <div>
                            <Label className="text-xs text-gray-500">NDA Formation</Label>
                            <p className="text-sm font-medium text-blue-600">{formData.nda}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ÉTAPE 2 — Email + Tel */}
                {siretTrouve && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="email">
                        <span className="inline-flex items-center gap-1">
                          <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">2</span>
                          Email professionnel *
                        </span>
                      </Label>
                      <Input id="email" name="email" type="email" placeholder="olivier@exsenco.fr" value={formData.email} onChange={handleChange} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telephone">Téléphone</Label>
                      <Input id="telephone" name="telephone" placeholder="06 07 46 74 09" value={formData.telephone} onChange={handleChange} />
                    </div>

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
                      <Label htmlFor="password">
                        <span className="inline-flex items-center gap-1">
                          <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">3</span>
                          Mot de passe *
                        </span>
                      </Label>
                      <div className="relative">
                        <Input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="8 caractères minimum" value={formData.password} onChange={handleChange} required className="pr-10" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmer le mot de passe *</Label>
                      <div className="relative">
                        <Input id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="••••••••" value={formData.confirmPassword} onChange={handleChange} required className="pr-10" />
                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </>
                )}

              </CardContent>
              <CardFooter className="flex flex-col">
                {siretTrouve ? (
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Création de votre espace..." : `Créer l'espace ${formData.raisonSociale}`}
                  </Button>
                ) : (
                  <p className="text-sm text-gray-500 text-center">
                    Saisissez votre SIRET et cliquez sur Rechercher pour commencer
                  </p>
                )}
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
