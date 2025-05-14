
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const Demo = () => {
  const [activeTab, setActiveTab] = useState("gestion-formations");

  // Exemple de formation
  const formationExample = {
    title: "Formation Leadership et Management d'équipe",
    duration: "21 heures",
    price: "1800€",
    dates: "15-17 Juin 2025",
    location: "Paris / En ligne",
    description: "Formation intensive destinée aux managers souhaitant développer leurs compétences en leadership et gestion d'équipe.",
    objectives: [
      "Développer son leadership et son impact personnel",
      "Acquérir les techniques de management situationnel",
      "Apprendre à gérer les conflits et situations difficiles",
      "Savoir motiver et engager son équipe",
    ],
    modules: [
      "Module 1: Fondamentaux du leadership",
      "Module 2: Communication et feedback constructif",
      "Module 3: Gestion des conflits",
      "Module 4: Management de la performance",
    ]
  };

  // Exemples de documents
  const documents = [
    { name: "Convention de formation.pdf", type: "Convention", status: "Envoyé", date: "12/05/2025" },
    { name: "Programme détaillé.pdf", type: "Programme", status: "Téléchargé", date: "10/05/2025" },
    { name: "Questionnaire pré-formation.pdf", type: "Questionnaire", status: "En attente", date: "15/05/2025" },
    { name: "Émargement J1.pdf", type: "Émargement", status: "À générer", date: "15/06/2025" },
  ];

  // Exemples de participants
  const participants = [
    { name: "Marie Dupont", email: "m.dupont@entreprise.fr", company: "Entreprise A", status: "Inscrit", documents: "3/4" },
    { name: "Jean Martin", email: "j.martin@entreprise.fr", company: "Entreprise A", status: "En attente", documents: "1/4" },
    { name: "Sophie Bernard", email: "s.bernard@entreprise.fr", company: "Entreprise B", status: "Inscrit", documents: "4/4" },
    { name: "Thomas Legrand", email: "t.legrand@entreprise.fr", company: "Entreprise C", status: "Inscrit", documents: "2/4" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Démonstration de FormationPro</h1>
            <p className="text-lg text-gray-600">
              Découvrez les fonctionnalités clés de notre application pour gérer vos formations
            </p>
          </div>

          <Tabs 
            defaultValue="gestion-formations" 
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-4 mb-8">
              <TabsTrigger value="gestion-formations">Gestion des formations</TabsTrigger>
              <TabsTrigger value="participants">Gestion des participants</TabsTrigger>
              <TabsTrigger value="documents">Gestion documentaire</TabsTrigger>
              <TabsTrigger value="qualiopi">Conformité Qualiopi</TabsTrigger>
            </TabsList>
            
            {/* Gestion des formations */}
            <TabsContent value="gestion-formations" className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h2 className="text-2xl font-semibold mb-4">{formationExample.title}</h2>
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                          <p className="text-sm text-gray-500">Durée</p>
                          <p className="font-medium">{formationExample.duration}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Prix</p>
                          <p className="font-medium">{formationExample.price}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Dates</p>
                          <p className="font-medium">{formationExample.dates}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Lieu</p>
                          <p className="font-medium">{formationExample.location}</p>
                        </div>
                      </div>
                      <div className="mb-6">
                        <p className="text-sm text-gray-500">Description</p>
                        <p className="font-medium">{formationExample.description}</p>
                      </div>
                      <div className="flex space-x-3">
                        <Button>Modifier</Button>
                        <Button variant="outline">Dupliquer</Button>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Objectifs pédagogiques</h3>
                      <ul className="list-disc pl-5 mb-6 space-y-1">
                        {formationExample.objectives.map((objective, index) => (
                          <li key={index}>{objective}</li>
                        ))}
                      </ul>
                      
                      <h3 className="font-semibold mb-2">Modules</h3>
                      <ul className="list-disc pl-5 mb-6 space-y-1">
                        {formationExample.modules.map((module, index) => (
                          <li key={index}>{module}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-3 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center">
                      <div className="text-4xl font-bold text-blue-600 mb-2">12</div>
                      <div className="text-gray-500 text-center">Formations actives</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center">
                      <div className="text-4xl font-bold text-blue-600 mb-2">245</div>
                      <div className="text-gray-500 text-center">Participants total</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center">
                      <div className="text-4xl font-bold text-blue-600 mb-2">95%</div>
                      <div className="text-gray-500 text-center">Taux de satisfaction</div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            {/* Gestion des participants */}
            <TabsContent value="participants" className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-2xl font-semibold mb-4">Liste des participants</h2>
                  <div className="flex justify-between mb-6">
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">Tous</Button>
                      <Button variant="outline" size="sm">Inscrits</Button>
                      <Button variant="outline" size="sm">En attente</Button>
                    </div>
                    <Button size="sm">+ Ajouter un participant</Button>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nom</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Entreprise</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Documents</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {participants.map((participant, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{participant.name}</TableCell>
                            <TableCell>{participant.email}</TableCell>
                            <TableCell>{participant.company}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                participant.status === "Inscrit" 
                                  ? "bg-green-100 text-green-800" 
                                  : "bg-yellow-100 text-yellow-800"
                              }`}>
                                {participant.status}
                              </span>
                            </TableCell>
                            <TableCell>{participant.documents}</TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button variant="ghost" size="sm">Email</Button>
                                <Button variant="ghost" size="sm">Éditer</Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold mb-4">Suivi des documents</h2>
                  <div className="grid md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <h3 className="font-medium mb-1">Conventions</h3>
                        <div className="flex justify-between items-center">
                          <span className="text-2xl font-bold text-blue-600">85%</span>
                          <span className="text-sm text-gray-500">17/20</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: "85%" }}></div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <h3 className="font-medium mb-1">Questionnaires</h3>
                        <div className="flex justify-between items-center">
                          <span className="text-2xl font-bold text-blue-600">70%</span>
                          <span className="text-sm text-gray-500">14/20</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: "70%" }}></div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <h3 className="font-medium mb-1">Émargements</h3>
                        <div className="flex justify-between items-center">
                          <span className="text-2xl font-bold text-blue-600">100%</span>
                          <span className="text-sm text-gray-500">20/20</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: "100%" }}></div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <h3 className="font-medium mb-1">Évaluations</h3>
                        <div className="flex justify-between items-center">
                          <span className="text-2xl font-bold text-blue-600">90%</span>
                          <span className="text-sm text-gray-500">18/20</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: "90%" }}></div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Gestion documentaire */}
            <TabsContent value="documents" className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-2xl font-semibold mb-4">Documents de la formation</h2>
                  
                  <div className="flex justify-between mb-6">
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">Tous</Button>
                      <Button variant="outline" size="sm">Conventions</Button>
                      <Button variant="outline" size="sm">Questionnaires</Button>
                      <Button variant="outline" size="sm">Émargements</Button>
                    </div>
                    <div className="flex space-x-2">
                      <Button size="sm">Ajouter</Button>
                      <Button variant="outline" size="sm">Envoyer en masse</Button>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nom du document</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {documents.map((document, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{document.name}</TableCell>
                            <TableCell>{document.type}</TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                document.status === "Envoyé" 
                                  ? "bg-green-100 text-green-800"
                                  : document.status === "Téléchargé"
                                  ? "bg-blue-100 text-blue-800"
                                  : document.status === "En attente"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}>
                                {document.status}
                              </span>
                            </TableCell>
                            <TableCell>{document.date}</TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button variant="ghost" size="sm">Voir</Button>
                                <Button variant="ghost" size="sm">Télécharger</Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold mb-4">Signature électronique</h2>
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <p className="text-gray-600 mb-4">
                        La solution de signature électronique intégrée permet de faire signer tous vos documents administratifs en toute simplicité.
                      </p>
                      <div className="space-y-4">
                        <div className="flex items-center">
                          <span className="bg-green-100 text-green-800 p-1 rounded-full mr-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                          <span>Signature conforme eIDAS</span>
                        </div>
                        <div className="flex items-center">
                          <span className="bg-green-100 text-green-800 p-1 rounded-full mr-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                          <span>Envois automatisés par email</span>
                        </div>
                        <div className="flex items-center">
                          <span className="bg-green-100 text-green-800 p-1 rounded-full mr-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                          <span>Suivi en temps réel</span>
                        </div>
                        <div className="flex items-center">
                          <span className="bg-green-100 text-green-800 p-1 rounded-full mr-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                          <span>Relances automatiques</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="bg-gray-100 p-4 rounded-lg border border-gray-200 h-64 flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-gray-500 mb-2">Aperçu de l'interface de signature</p>
                          <Button>Voir la démonstration</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Conformité Qualiopi */}
            <TabsContent value="qualiopi" className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center mb-6">
                    <div className="mr-4">
                      <div className="bg-blue-600 p-3 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold">Conformité Qualiopi</h2>
                      <p className="text-gray-600">Gérez facilement votre certification qualité avec FormationPro</p>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="font-semibold text-lg mb-4">Indicateurs couverts</h3>
                      <div className="space-y-3">
                        <div className="flex items-start">
                          <span className="bg-green-100 text-green-800 p-1 rounded-full mr-2 mt-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                          <div>
                            <span className="font-medium">Critère 1 : Information des publics</span>
                            <p className="text-sm text-gray-600">Communication transparente sur l'offre de formation, délais d'accès et résultats.</p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <span className="bg-green-100 text-green-800 p-1 rounded-full mr-2 mt-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                          <div>
                            <span className="font-medium">Critère 3 : Adaptation aux publics bénéficiaires</span>
                            <p className="text-sm text-gray-600">Suivi personnalisé et adaptation des modalités pédagogiques.</p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <span className="bg-green-100 text-green-800 p-1 rounded-full mr-2 mt-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                          <div>
                            <span className="font-medium">Critère 5 : Qualification des formateurs</span>
                            <p className="text-sm text-gray-600">Gestion des CV et preuves de compétences des intervenants.</p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <span className="bg-green-100 text-green-800 p-1 rounded-full mr-2 mt-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                          <div>
                            <span className="font-medium">Critère 6 : Investissement dans l'environnement professionnel</span>
                            <p className="text-sm text-gray-600">Veille sectorielle et professionnelle.</p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <span className="bg-green-100 text-green-800 p-1 rounded-full mr-2 mt-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                          <div>
                            <span className="font-medium">Critère 7 : Recueil et prise en compte des appréciations</span>
                            <p className="text-sm text-gray-600">Analyse des évaluations et amélioration continue.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-4">État de votre conformité</h3>
                      
                      <div className="bg-white p-4 border border-gray-200 rounded-lg mb-5">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium">Progression globale</p>
                          <p className="font-bold">85%</p>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: "85%" }}></div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="bg-white p-3 border border-gray-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <p>Critère 1</p>
                            <p className="font-medium text-green-600">100%</p>
                          </div>
                        </div>
                        <div className="bg-white p-3 border border-gray-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <p>Critère 2</p>
                            <p className="font-medium text-green-600">90%</p>
                          </div>
                        </div>
                        <div className="bg-white p-3 border border-gray-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <p>Critère 3</p>
                            <p className="font-medium text-green-600">100%</p>
                          </div>
                        </div>
                        <div className="bg-white p-3 border border-gray-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <p>Critère 4</p>
                            <p className="font-medium text-yellow-600">75%</p>
                          </div>
                        </div>
                        <div className="bg-white p-3 border border-gray-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <p>Critère 5</p>
                            <p className="font-medium text-yellow-600">60%</p>
                          </div>
                        </div>
                        <Button className="w-full">Générer rapport d'audit</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Demo;
