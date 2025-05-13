
import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const mockUser = {
  name: "Jean Dupont",
  email: "jean@formationpro.fr",
  profileImage: "",
};

// Liste des fonctionnalités par catégorie, inspirées du concurrent
const featuresList = {
  gestionAdministrative: [
    "Gestion des contacts et prospects",
    "Gestion des entreprises clientes",
    "CRM intégré avec historique des échanges",
    "Automatisation des rappels et relances",
    "Édition et envoi automatisé de factures",
    "Tableau de bord administratif",
    "Suivi des paiements et impayés"
  ],
  gestionFormation: [
    "Création et gestion du catalogue de formations",
    "Planification des sessions de formation",
    "Gestion des formateurs et intervenants",
    "Affectation des ressources pédagogiques",
    "Suivi des compétences et certifications",
    "Gestion multi-sites de formation",
    "Plan de charge des formateurs"
  ],
  gestionDocumentaire: [
    "Génération automatique des conventions",
    "Création automatisée des feuilles d'émargement",
    "Gestion des attestations de présence",
    "Signature électronique intégrée",
    "Archivage numérique sécurisé",
    "Gestion des modèles de documents",
    "Conformité RGPD des documents"
  ],
  suiviQualite: [
    "Questionnaires de satisfaction automatisés",
    "Évaluations pré et post-formation",
    "Tableaux de bord qualité",
    "Suivi des indicateurs Qualiopi",
    "Alertes et notifications de conformité",
    "Rapports d'évaluation personnalisables",
    "Synthèse d'activité et bilan pédagogique"
  ],
  commercial: [
    "Gestion des devis et propositions commerciales",
    "Suivi du pipeline commercial",
    "Tableaux de bord des ventes",
    "Intégration avec les financeurs (OPCO)",
    "Gestion des abonnements et formations récurrentes",
    "Analyse de la rentabilité par formation",
    "Statistiques et reporting commercial"
  ]
};

// Plans tarifaires
const pricingPlans = [
  {
    name: "Essentiel",
    price: "39€",
    period: "/mois",
    description: "Idéal pour les formateurs indépendants",
    features: [
      "Gestion de 50 apprenants",
      "Création de 10 formations",
      "Génération de documents Qualiopi",
      "Signature électronique (100/an)",
      "Support par email",
    ],
    cta: "Commencer",
    highlighted: false,
  },
  {
    name: "Professionnel",
    price: "99€",
    period: "/mois",
    description: "Pour les organismes de formation en croissance",
    features: [
      "Gestion illimitée d'apprenants",
      "Formations illimitées",
      "Suite complète de documents Qualiopi",
      "Signature électronique illimitée",
      "Automatisation des relances",
      "Tableau de bord analytique",
      "Support prioritaire",
    ],
    cta: "Essai gratuit",
    highlighted: true,
  },
  {
    name: "Entreprise",
    price: "Sur mesure",
    period: "",
    description: "Pour les grands organismes avec besoins spécifiques",
    features: [
      "Toutes les fonctionnalités professionnelles",
      "API personnalisée",
      "Intégration avec vos outils existants",
      "Personnalisation avancée",
      "Accompagnement dédié",
      "Formation de vos équipes",
      "SLA garanti",
    ],
    cta: "Contacter l'équipe",
    highlighted: false,
  },
];

const Features = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <Header user={mockUser} />

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-blue-50 to-white py-16 px-4">
          <div className="container mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              La solution complète pour votre organisme de formation
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Simplifiez votre gestion administrative, assurez votre conformité Qualiopi 
              et concentrez-vous sur l'essentiel : former vos apprenants
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button size="lg" className="text-lg px-8 py-6">
                Essayer gratuitement
              </Button>
              <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                Voir une démonstration
              </Button>
            </div>
          </div>
        </section>

        {/* Fonctionnalités */}
        <section className="py-16 px-4 bg-white">
          <div className="container mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">
              Toutes les fonctionnalités dont vous avez besoin
            </h2>

            <Tabs defaultValue="gestionAdministrative" className="max-w-5xl mx-auto">
              <TabsList className="grid grid-cols-2 md:grid-cols-5 mb-8">
                <TabsTrigger value="gestionAdministrative">Administration</TabsTrigger>
                <TabsTrigger value="gestionFormation">Formation</TabsTrigger>
                <TabsTrigger value="gestionDocumentaire">Documents</TabsTrigger>
                <TabsTrigger value="suiviQualite">Qualité</TabsTrigger>
                <TabsTrigger value="commercial">Commercial</TabsTrigger>
              </TabsList>

              <TabsContent value="gestionAdministrative" className="space-y-4">
                <h3 className="text-2xl font-semibold text-center mb-6">Gestion Administrative</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {featuresList.gestionAdministrative.map((feature, index) => (
                    <Card key={index} className="h-full">
                      <CardHeader className="flex flex-row items-center gap-4">
                        <div className="bg-blue-100 p-2 rounded-full">
                          <Check className="h-5 w-5 text-blue-600" />
                        </div>
                        <CardTitle className="text-lg">{feature}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="gestionFormation" className="space-y-4">
                <h3 className="text-2xl font-semibold text-center mb-6">Gestion de la Formation</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {featuresList.gestionFormation.map((feature, index) => (
                    <Card key={index} className="h-full">
                      <CardHeader className="flex flex-row items-center gap-4">
                        <div className="bg-green-100 p-2 rounded-full">
                          <Check className="h-5 w-5 text-green-600" />
                        </div>
                        <CardTitle className="text-lg">{feature}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="gestionDocumentaire" className="space-y-4">
                <h3 className="text-2xl font-semibold text-center mb-6">Gestion Documentaire</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {featuresList.gestionDocumentaire.map((feature, index) => (
                    <Card key={index} className="h-full">
                      <CardHeader className="flex flex-row items-center gap-4">
                        <div className="bg-purple-100 p-2 rounded-full">
                          <Check className="h-5 w-5 text-purple-600" />
                        </div>
                        <CardTitle className="text-lg">{feature}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="suiviQualite" className="space-y-4">
                <h3 className="text-2xl font-semibold text-center mb-6">Suivi Qualité et Qualiopi</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {featuresList.suiviQualite.map((feature, index) => (
                    <Card key={index} className="h-full">
                      <CardHeader className="flex flex-row items-center gap-4">
                        <div className="bg-yellow-100 p-2 rounded-full">
                          <Check className="h-5 w-5 text-yellow-600" />
                        </div>
                        <CardTitle className="text-lg">{feature}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="commercial" className="space-y-4">
                <h3 className="text-2xl font-semibold text-center mb-6">Gestion Commerciale</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {featuresList.commercial.map((feature, index) => (
                    <Card key={index} className="h-full">
                      <CardHeader className="flex flex-row items-center gap-4">
                        <div className="bg-red-100 p-2 rounded-full">
                          <Check className="h-5 w-5 text-red-600" />
                        </div>
                        <CardTitle className="text-lg">{feature}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </section>

        {/* Tarifs */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="container mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">
              Des formules adaptées à vos besoins
            </h2>
            <p className="text-xl text-gray-600 text-center max-w-3xl mx-auto mb-12">
              Choisissez le plan qui correspond à la taille de votre organisme de formation
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {pricingPlans.map((plan, index) => (
                <Card 
                  key={index} 
                  className={`flex flex-col h-full ${plan.highlighted ? 'border-blue-500 border-2 shadow-xl' : ''}`}
                >
                  <CardHeader className={plan.highlighted ? 'bg-blue-50' : ''}>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="text-gray-500">{plan.period}</span>
                    </div>
                    <CardDescription className="mt-2 text-base">{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-grow">
                    <ul className="space-y-3">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start">
                          <Check className="h-5 w-5 mr-2 text-green-500 flex-shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className={`w-full py-6 ${plan.highlighted ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                      variant={plan.highlighted ? "default" : "outline"}
                    >
                      {plan.cta}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Final */}
        <section className="py-16 px-4 bg-blue-600 text-white">
          <div className="container mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">
              Prêt à simplifier la gestion de votre organisme de formation ?
            </h2>
            <p className="text-xl mb-8 max-w-3xl mx-auto">
              Rejoignez des centaines d'organismes de formation qui utilisent notre plateforme pour automatiser leur gestion administrative et garantir leur conformité Qualiopi.
            </p>
            <Button size="lg" variant="secondary" className="text-blue-600 text-lg px-8 py-6">
              Essayer gratuitement pendant 14 jours
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Features;
