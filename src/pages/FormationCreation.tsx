
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";

const FormationCreation = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [organismeId, setOrganismeId] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const [formData, setFormData] = useState({
    titre: "",
    programme: "",
    objectifs: "",
    duree: "",
    tarif: "",
    modalites: "",
    prerequis: "",
    document_mode: "auto",
  });

  // Auth + récupération de l'organisme rattaché au profil, comme sur Formations.tsx
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }
      setUser({
        name: session.user.user_metadata?.nom_complet || session.user.email || "",
        email: session.user.email || "",
        profileImage: "",
      });

      const { data: profile } = await supabase
        .from("profiles")
        .select("organisme_id")
        .eq("id", session.user.id)
        .single();

      if (profile?.organisme_id) {
        setOrganismeId(profile.organisme_id);
      } else {
        toast({
          title: "Aucun organisme rattaché",
          description: "Votre profil n'est lié à aucun organisme. Impossible de créer une formation.",
          variant: "destructive",
        });
      }
      setCheckingSession(false);
    };
    init();
  }, [navigate, toast]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string) => (value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const nextStep = () => {
    if (currentStep === 1) {
      if (!formData.titre) {
        toast({
          title: "Champ requis",
          description: "Le titre de la formation est obligatoire.",
          variant: "destructive",
        });
        return;
      }
    }
    setCurrentStep((s) => s + 1);
  };

  const prevStep = () => setCurrentStep((s) => s - 1);

  const handleSubmit = async (e: React.SyntheticEvent, statut: "draft" | "publie") => {
    e.preventDefault();

    if (!formData.titre) {
      toast({
        title: "Erreur",
        description: "Le titre de la formation est obligatoire.",
        variant: "destructive",
      });
      return;
    }

    if (!organismeId) {
      toast({
        title: "Erreur",
        description: "Aucun organisme rattaché à votre compte.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.from("formations").insert({
      organisme_id: organismeId,
      titre: formData.titre,
      objectifs: formData.objectifs || null,
      programme: formData.programme || null,
      modalites: formData.modalites || null,
      prerequis: formData.prerequis || null,
      duree: formData.duree || null,
      tarif: formData.tarif || null,
      document_mode: formData.document_mode,
      statut,
    });

    setIsLoading(false);

    if (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Formation créée",
      description: statut === "publie" ? "Votre formation a été publiée avec succès !" : "Votre formation a été enregistrée en brouillon.",
    });

    navigate("/formations");
  };

  if (checkingSession) {
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
        <div className="container mx-auto px-4">
          <div className="flex items-center mb-6">
            <Link to="/formations" className="text-exsenco-blue hover:text-blue-800 mr-2">
              &larr; Retour aux formations
            </Link>
          </div>

          <h1 className="text-3xl font-bold mb-6">Créer une nouvelle formation</h1>

          <div className="mb-8">
            <div className="flex justify-between items-center max-w-3xl mx-auto mb-4">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`flex flex-col items-center ${step < currentStep ? "text-exsenco-blue" : step === currentStep ? "text-blue-800" : "text-gray-400"}`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 
                      ${step < currentStep
                        ? "bg-exsenco-blue text-white"
                        : step === currentStep
                        ? "bg-exsenco-orange-light text-blue-800 border-2 border-exsenco-blue"
                        : "bg-gray-100 text-gray-400"}`}
                  >
                    {step < currentStep ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      step
                    )}
                  </div>
                  <span className="text-sm">
                    {step === 1 ? "Informations" : step === 2 ? "Détails" : "Confirmation"}
                  </span>
                </div>
              ))}
            </div>

            <div className="h-2 bg-gray-200 rounded-full max-w-3xl mx-auto">
              <div
                className="h-full bg-exsenco-blue rounded-full transition-all"
                style={{ width: `${(currentStep - 1) * 50}%` }}
              ></div>
            </div>
          </div>

          <Card className="max-w-3xl mx-auto">
            <CardContent className="pt-6">
              <form onSubmit={(e) => handleSubmit(e, "publie")}>
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold mb-4">Informations générales</h2>

                    <div className="space-y-2">
                      <Label htmlFor="titre">Titre de la formation <span className="text-red-500">*</span></Label>
                      <Input
                        id="titre"
                        name="titre"
                        value={formData.titre}
                        onChange={handleChange}
                        placeholder="ex: Formation Excel Avancé"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="programme">Programme</Label>
                      <Textarea
                        id="programme"
                        name="programme"
                        value={formData.programme}
                        onChange={handleChange}
                        placeholder="Décrivez le déroulé et le contenu de votre formation..."
                        rows={5}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="objectifs">Objectifs pédagogiques</Label>
                      <Textarea
                        id="objectifs"
                        name="objectifs"
                        value={formData.objectifs}
                        onChange={handleChange}
                        placeholder="Listez les objectifs pédagogiques..."
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold mb-4">Détails de la formation</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="duree">Durée</Label>
                        <Input
                          id="duree"
                          name="duree"
                          value={formData.duree}
                          onChange={handleChange}
                          placeholder="ex: 3 jours (21h)"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="tarif">Tarif</Label>
                        <Input
                          id="tarif"
                          name="tarif"
                          value={formData.tarif}
                          onChange={handleChange}
                          placeholder="ex: 1500 € net de taxes"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="modalites">Modalités</Label>
                      <Textarea
                        id="modalites"
                        name="modalites"
                        value={formData.modalites}
                        onChange={handleChange}
                        placeholder="Présentiel / distanciel, public visé, accessibilité..."
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="prerequis">Prérequis</Label>
                      <Textarea
                        id="prerequis"
                        name="prerequis"
                        value={formData.prerequis}
                        onChange={handleChange}
                        placeholder="Connaissances préalables nécessaires..."
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="document_mode">Mode de gestion documentaire</Label>
                      <Select value={formData.document_mode} onValueChange={handleSelectChange("document_mode")}>
                        <SelectTrigger id="document_mode">
                          <SelectValue placeholder="Choisir un mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Automatique (génération + signature électronique)</SelectItem>
                          <SelectItem value="import">Import manuel (documents papier ou externes)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold mb-4">Confirmation</h2>

                    <div className="bg-gray-50 p-4 rounded-md space-y-4">
                      <div>
                        <h3 className="font-medium text-gray-700">Titre</h3>
                        <p>{formData.titre}</p>
                      </div>

                      {formData.programme && (
                        <div>
                          <h3 className="font-medium text-gray-700">Programme</h3>
                          <p className="text-sm">{formData.programme}</p>
                        </div>
                      )}

                      {formData.objectifs && (
                        <div>
                          <h3 className="font-medium text-gray-700">Objectifs</h3>
                          <p className="text-sm">{formData.objectifs}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        {formData.duree && (
                          <div>
                            <h3 className="font-medium text-gray-700">Durée</h3>
                            <p>{formData.duree}</p>
                          </div>
                        )}
                        {formData.tarif && (
                          <div>
                            <h3 className="font-medium text-gray-700">Tarif</h3>
                            <p>{formData.tarif}</p>
                          </div>
                        )}
                      </div>

                      {formData.modalites && (
                        <div>
                          <h3 className="font-medium text-gray-700">Modalités</h3>
                          <p className="text-sm">{formData.modalites}</p>
                        </div>
                      )}

                      {formData.prerequis && (
                        <div>
                          <h3 className="font-medium text-gray-700">Prérequis</h3>
                          <p className="text-sm">{formData.prerequis}</p>
                        </div>
                      )}

                      <div>
                        <h3 className="font-medium text-gray-700">Mode de gestion documentaire</h3>
                        <p className="text-sm">{formData.document_mode === "auto" ? "Automatique (génération + signature électronique)" : "Import manuel (documents papier ou externes)"}</p>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <p className="text-sm text-gray-600">
                        Vous pouvez enregistrer cette formation en brouillon pour la finaliser plus tard, ou la publier directement.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-between mt-8">
                  {currentStep > 1 && (
                    <Button type="button" variant="outline" onClick={prevStep}>
                      Retour
                    </Button>
                  )}

                  {currentStep < 3 ? (
                    <Button type="button" onClick={nextStep} className="ml-auto">
                      Continuer
                    </Button>
                  ) : (
                    <div className="ml-auto flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isLoading}
                        onClick={(e) => handleSubmit(e, "draft")}
                      >
                        {isLoading ? "Enregistrement..." : "Enregistrer en brouillon"}
                      </Button>
                      <Button type="submit" disabled={isLoading} className="btn-cta font-bold">
                        {isLoading ? "Publication..." : "Publier la formation"}
                      </Button>
                    </div>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FormationCreation;
