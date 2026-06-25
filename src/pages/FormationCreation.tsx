
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const mockUser = {
  name: "Jean Dupont",
  email: "jean@formationpro.fr",
  profileImage: "",
};

const FormationCreation = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    objectives: "",
    duration: "",
    price: "",
    targetAudience: "",
    prerequisites: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const nextStep = () => {
    // Simple validation for each step
    if (currentStep === 1) {
      if (!formData.title || !formData.description) {
        toast({
          title: "Champs requis",
          description: "Veuillez remplir tous les champs obligatoires",
          variant: "destructive",
        });
        return;
      }
    }
    
    setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Final validation
    if (!formData.title || !formData.description || !formData.duration) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Ici vous intégreriez votre logique d'enregistrement réelle
      // Simulating API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      toast({
        title: "Formation créée",
        description: "Votre formation a été créée avec succès!",
      });
      
      // Rediriger vers la liste des formations
      window.location.href = "/formations";
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue. Veuillez réessayer.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={mockUser} />
      
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
              <form onSubmit={handleSubmit}>
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold mb-4">Informations générales</h2>
                    
                    <div className="space-y-2">
                      <Label htmlFor="title">Titre de la formation <span className="text-red-500">*</span></Label>
                      <Input
                        id="title"
                        name="title"
                        value={formData.title}
                        onChange={handleChange}
                        placeholder="ex: Formation Excel Avancé"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
                      <Textarea
                        id="description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        placeholder="Décrivez votre formation en détail..."
                        rows={5}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="objectives">Objectifs pédagogiques</Label>
                      <Textarea
                        id="objectives"
                        name="objectives"
                        value={formData.objectives}
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
                        <Label htmlFor="duration">Durée <span className="text-red-500">*</span></Label>
                        <Input
                          id="duration"
                          name="duration"
                          value={formData.duration}
                          onChange={handleChange}
                          placeholder="ex: 3 jours (21h)"
                          required
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="price">Prix</Label>
                        <Input
                          id="price"
                          name="price"
                          type="number"
                          value={formData.price}
                          onChange={handleChange}
                          placeholder="ex: 1500"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="targetAudience">Public visé</Label>
                      <Textarea
                        id="targetAudience"
                        name="targetAudience"
                        value={formData.targetAudience}
                        onChange={handleChange}
                        placeholder="À qui s'adresse cette formation..."
                        rows={3}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="prerequisites">Prérequis</Label>
                      <Textarea
                        id="prerequisites"
                        name="prerequisites"
                        value={formData.prerequisites}
                        onChange={handleChange}
                        placeholder="Connaissances préalables nécessaires..."
                        rows={3}
                      />
                    </div>
                  </div>
                )}
                
                {currentStep === 3 && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold mb-4">Confirmation</h2>
                    
                    <div className="bg-gray-50 p-4 rounded-md space-y-4">
                      <div>
                        <h3 className="font-medium text-gray-700">Titre</h3>
                        <p>{formData.title}</p>
                      </div>
                      
                      <div>
                        <h3 className="font-medium text-gray-700">Description</h3>
                        <p className="text-sm">{formData.description}</p>
                      </div>
                      
                      {formData.objectives && (
                        <div>
                          <h3 className="font-medium text-gray-700">Objectifs</h3>
                          <p className="text-sm">{formData.objectives}</p>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h3 className="font-medium text-gray-700">Durée</h3>
                          <p>{formData.duration}</p>
                        </div>
                        
                        {formData.price && (
                          <div>
                            <h3 className="font-medium text-gray-700">Prix</h3>
                            <p>{formData.price} €</p>
                          </div>
                        )}
                      </div>
                      
                      {formData.targetAudience && (
                        <div>
                          <h3 className="font-medium text-gray-700">Public visé</h3>
                          <p className="text-sm">{formData.targetAudience}</p>
                        </div>
                      )}
                      
                      {formData.prerequisites && (
                        <div>
                          <h3 className="font-medium text-gray-700">Prérequis</h3>
                          <p className="text-sm">{formData.prerequisites}</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="border-t pt-4">
                      <p className="text-sm text-gray-600">
                        En cliquant sur "Créer la formation", vous certifiez que les informations fournies sont exactes et conformes au référentiel Qualiopi.
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
                    <Button type="submit" disabled={isLoading} className="ml-auto">
                      {isLoading ? "Création en cours..." : "Créer la formation"}
                    </Button>
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
