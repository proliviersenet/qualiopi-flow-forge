
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const Mockup = () => {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="bg-white py-4 px-6 border-b border-gray-200 sticky top-0 z-10">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-md bg-blue-600 mr-3 flex items-center justify-center">
              <span className="text-white font-bold">FP</span>
            </div>
            <h1 className="text-xl font-bold text-blue-600">QalioFlex</h1>
          </div>
          <div className="flex space-x-4">
            <div className="w-8 h-8 rounded-full bg-gray-200"></div>
            <div className="w-8 h-8 rounded-full bg-gray-300"></div>
            <div className="w-8 h-8 rounded-full bg-gray-400"></div>
          </div>
        </div>
      </div>

      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="hidden md:block w-64 bg-white border-r border-gray-200 p-4">
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="px-3 py-2 rounded-md bg-blue-50 text-blue-700 font-medium">Dashboard</div>
              <div className="px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">Formations</div>
              <div className="px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">Participants</div>
              <div className="px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">Documents</div>
              <div className="px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">Statistiques</div>
            </div>
            <div className="pt-4 border-t border-gray-200">
              <div className="px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">Paramètres</div>
              <div className="px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100">Aide</div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 p-6">
          <Tabs 
            defaultValue="dashboard" 
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-4 mb-8">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="formations">Formations</TabsTrigger>
              <TabsTrigger value="participants">Participants</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>
            
            {/* Dashboard Mockup */}
            <TabsContent value="dashboard" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Stats cards */}
                {['Formations actives', 'Participants', 'Taux de satisfaction'].map((title, i) => (
                  <Card key={i} className="shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex flex-col items-center text-center">
                        <div className="text-3xl font-bold text-blue-600 mb-1">
                          {i === 0 ? '12' : i === 1 ? '245' : '95%'}
                        </div>
                        <div className="text-gray-500">{title}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {/* Upcoming formations */}
              <Card className="shadow-sm">
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4">Prochaines formations</h2>
                  <div className="space-y-4">
                    {[
                      {title: "Leadership et Management d'équipe", date: "15-17 Juin 2025"},
                      {title: "Communication efficace", date: "22-23 Juin 2025"},
                      {title: "Gestion de projet avancée", date: "5-8 Juillet 2025"}
                    ].map((formation, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                        <div>
                          <div className="font-medium">{formation.title}</div>
                          <div className="text-sm text-gray-500">{formation.date}</div>
                        </div>
                        <Button variant="outline" size="sm">Détails</Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
              {/* Recent activity & chart */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="shadow-sm">
                  <CardContent className="p-6">
                    <h2 className="text-xl font-bold mb-4">Activité récente</h2>
                    <div className="space-y-4">
                      {[
                        {action: "Convention signée", user: "Marie Dupont", time: "il y a 2h"},
                        {action: "Nouveau participant", user: "Thomas Legrand", time: "il y a 5h"},
                        {action: "Évaluation complétée", user: "Sophie Bernard", time: "il y a 1j"}
                      ].map((activity, i) => (
                        <div key={i} className="flex items-start">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-3 mt-1">
                            <span className="text-blue-600 text-xs font-bold">{activity.action[0]}</span>
                          </div>
                          <div>
                            <div className="font-medium">{activity.action}</div>
                            <div className="text-sm text-gray-500">{`${activity.user} - ${activity.time}`}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="shadow-sm">
                  <CardContent className="p-6">
                    <h2 className="text-xl font-bold mb-4">Satisfaction</h2>
                    {/* Chart mockup */}
                    <div className="h-60 bg-gray-100 rounded-md flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-gray-500 mb-2">Graphique de satisfaction</div>
                        <div className="flex items-end justify-center h-32 space-x-4 px-6">
                          {[75, 82, 90, 85, 95].map((height, i) => (
                            <div key={i} className="w-6 bg-blue-600" style={{ height: `${height}%` }}></div>
                          ))}
                        </div>
                        <div className="text-gray-500 mt-2 text-sm">Dernières 5 formations</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            {/* Formations Mockup */}
            <TabsContent value="formations" className="space-y-6">
              <div className="flex justify-between mb-6">
                <div className="space-x-2">
                  <Button variant="outline" size="sm">Toutes</Button>
                  <Button variant="outline" size="sm">À venir</Button>
                  <Button variant="outline" size="sm">Passées</Button>
                </div>
                <Button size="sm">+ Nouvelle formation</Button>
              </div>
              
              {/* Formations list */}
              <div className="space-y-4">
                {[
                  {
                    title: "Leadership et Management d'équipe",
                    status: "À venir",
                    date: "15-17 Juin 2025",
                    participants: 12
                  },
                  {
                    title: "Communication efficace",
                    status: "À venir",
                    date: "22-23 Juin 2025",
                    participants: 8
                  },
                  {
                    title: "Gestion de projet agile",
                    status: "Passée",
                    date: "10-12 Mai 2025",
                    participants: 15
                  },
                  {
                    title: "Excel avancé",
                    status: "Passée",
                    date: "5-6 Mai 2025",
                    participants: 10
                  }
                ].map((formation, i) => (
                  <Card key={i} className="shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-bold">{formation.title}</h3>
                          <div className="text-sm text-gray-500 mt-1">{formation.date}</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            formation.status === "À venir"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}>
                            {formation.status}
                          </span>
                          <span className="text-sm text-gray-500">{formation.participants} participants</span>
                          <Button variant="ghost" size="sm">Détails</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {/* Formation creation mockup */}
              <Card className="shadow-sm mt-8">
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4">Aperçu de création de formation</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
                          <div className="h-10 rounded-md bg-gray-100 w-full"></div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Dates</label>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="h-10 rounded-md bg-gray-100"></div>
                            <div className="h-10 rounded-md bg-gray-100"></div>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                          <div className="h-20 rounded-md bg-gray-100"></div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Objectifs pédagogiques</label>
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <div className="h-8 rounded-md bg-gray-100 flex-1"></div>
                            <button className="ml-2 w-8 h-8 rounded bg-gray-200 flex items-center justify-center">+</button>
                          </div>
                          <div className="flex items-center">
                            <div className="h-8 rounded-md bg-gray-100 flex-1"></div>
                            <button className="ml-2 w-8 h-8 rounded bg-gray-200 flex items-center justify-center">+</button>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tarif et durée</label>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="h-10 rounded-md bg-gray-100"></div>
                          <div className="h-10 rounded-md bg-gray-100"></div>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Button className="mr-2" variant="outline">Annuler</Button>
                        <Button>Enregistrer</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Participants Mockup */}
            <TabsContent value="participants" className="space-y-6">
              <div className="flex justify-between mb-6">
                <div className="space-x-2">
                  <Button variant="outline" size="sm">Tous</Button>
                  <Button variant="outline" size="sm">Inscrits</Button>
                  <Button variant="outline" size="sm">En attente</Button>
                </div>
                <Button size="sm">+ Ajouter un participant</Button>
              </div>
              
              {/* Participants table mockup */}
              <Card className="shadow-sm">
                <CardContent className="p-0">
                  <div className="border-b border-gray-200 p-4 font-medium">
                    <div className="grid grid-cols-6">
                      <div>Nom</div>
                      <div>Email</div>
                      <div>Formation</div>
                      <div>Entreprise</div>
                      <div>Statut</div>
                      <div>Actions</div>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {[
                      {
                        name: "Marie Dupont",
                        email: "m.dupont@entreprise.fr",
                        formation: "Leadership",
                        company: "Entreprise A",
                        status: "Inscrit"
                      },
                      {
                        name: "Jean Martin",
                        email: "j.martin@entreprise.fr",
                        formation: "Leadership",
                        company: "Entreprise A",
                        status: "En attente"
                      },
                      {
                        name: "Sophie Bernard",
                        email: "s.bernard@entreprise.fr",
                        formation: "Communication",
                        company: "Entreprise B",
                        status: "Inscrit"
                      }
                    ].map((participant, i) => (
                      <div key={i} className="p-4">
                        <div className="grid grid-cols-6">
                          <div className="font-medium">{participant.name}</div>
                          <div className="text-gray-600">{participant.email}</div>
                          <div>{participant.formation}</div>
                          <div>{participant.company}</div>
                          <div>
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              participant.status === "Inscrit" 
                                ? "bg-green-100 text-green-800" 
                                : "bg-yellow-100 text-yellow-800"
                            }`}>
                              {participant.status}
                            </span>
                          </div>
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="sm">Email</Button>
                            <Button variant="ghost" size="sm">Éditer</Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
              {/* Participant detail mockup */}
              <Card className="shadow-sm mt-8">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">Détails du participant</h2>
                    <Button variant="outline" size="sm">Fermer</Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                          <div className="h-10 rounded-md bg-gray-100 w-full"></div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                          <div className="h-10 rounded-md bg-gray-100"></div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                          <div className="h-10 rounded-md bg-gray-100"></div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Entreprise</label>
                          <div className="h-10 rounded-md bg-gray-100"></div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-3">Documents</h3>
                      <div className="space-y-3">
                        <div className="p-3 bg-gray-50 rounded-md flex items-center justify-between">
                          <div className="flex items-center">
                            <div className="w-6 h-8 bg-blue-100 mr-3"></div>
                            <span>Convention de formation</span>
                          </div>
                          <span className="text-green-600 text-sm">✓ Signé</span>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-md flex items-center justify-between">
                          <div className="flex items-center">
                            <div className="w-6 h-8 bg-blue-100 mr-3"></div>
                            <span>Questionnaire pré-formation</span>
                          </div>
                          <span className="text-yellow-600 text-sm">En attente</span>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-md flex items-center justify-between">
                          <div className="flex items-center">
                            <div className="w-6 h-8 bg-blue-100 mr-3"></div>
                            <span>Attestation de présence</span>
                          </div>
                          <span className="text-gray-600 text-sm">Non généré</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Documents Mockup */}
            <TabsContent value="documents" className="space-y-6">
              <div className="flex justify-between mb-6">
                <div className="space-x-2">
                  <Button variant="outline" size="sm">Tous</Button>
                  <Button variant="outline" size="sm">Conventions</Button>
                  <Button variant="outline" size="sm">Émargements</Button>
                </div>
                <div className="space-x-2">
                  <Button size="sm">Ajouter</Button>
                  <Button variant="outline" size="sm">Envoyer en masse</Button>
                </div>
              </div>
              
              {/* Document templates */}
              <Card className="shadow-sm">
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4">Modèles de documents</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                      "Convention de formation",
                      "Émargement",
                      "Attestation de présence",
                      "Questionnaire satisfaction",
                      "Certificat de formation",
                      "Facture"
                    ].map((doc, i) => (
                      <Card key={i} className="shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-center mb-2">
                            <div className="w-8 h-10 bg-blue-100 mr-3"></div>
                            <div className="font-medium">{doc}</div>
                          </div>
                          <div className="flex justify-end mt-4">
                            <Button variant="ghost" size="sm">Éditer</Button>
                            <Button variant="ghost" size="sm">Aperçu</Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
              {/* Document generation interface */}
              <Card className="shadow-sm">
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4">Générer des documents</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Type de document</label>
                          <div className="h-10 rounded-md bg-gray-100 w-full"></div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Formation</label>
                          <div className="h-10 rounded-md bg-gray-100"></div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Participants</label>
                          <div className="h-20 rounded-md bg-gray-100"></div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="p-4 bg-gray-50 rounded-md">
                        <h3 className="font-semibold mb-3">Options</h3>
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center">
                            <input type="checkbox" className="mr-2" />
                            <span>Envoyer par email</span>
                          </div>
                          <div className="flex items-center">
                            <input type="checkbox" className="mr-2" />
                            <span>Inclure signature électronique</span>
                          </div>
                          <div className="flex items-center">
                            <input type="checkbox" className="mr-2" />
                            <span>Archiver automatiquement</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-6 flex justify-end">
                        <Button>Générer</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Document preview */}
              <Card className="shadow-sm">
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4">Aperçu du document</h2>
                  <div className="aspect-w-8 aspect-h-11 bg-gray-100 rounded-md mb-4">
                    <AspectRatio ratio={8/11}>
                      <div className="p-6">
                        <div className="flex justify-between mb-10">
                          <div className="w-20 h-10 bg-gray-200"></div>
                          <div className="text-right">
                            <div className="h-4 w-24 bg-gray-200 mb-1"></div>
                            <div className="h-4 w-32 bg-gray-200"></div>
                          </div>
                        </div>
                        <div className="mb-6">
                          <div className="h-6 w-48 bg-gray-200 mb-4"></div>
                          <div className="h-4 w-full bg-gray-200 mb-2"></div>
                          <div className="h-4 w-3/4 bg-gray-200"></div>
                        </div>
                        <div className="mb-6">
                          <div className="h-4 w-full bg-gray-200 mb-2"></div>
                          <div className="h-4 w-5/6 bg-gray-200 mb-2"></div>
                          <div className="h-4 w-full bg-gray-200 mb-2"></div>
                        </div>
                        <div className="mb-10">
                          <div className="h-4 w-full bg-gray-200 mb-2"></div>
                          <div className="h-4 w-2/3 bg-gray-200"></div>
                        </div>
                        <div className="flex justify-between mt-20">
                          <div>
                            <div className="h-20 w-32 bg-gray-200 mb-2"></div>
                            <div className="h-4 w-32 bg-gray-200"></div>
                          </div>
                          <div>
                            <div className="h-20 w-32 bg-gray-200 mb-2"></div>
                            <div className="h-4 w-32 bg-gray-200"></div>
                          </div>
                        </div>
                      </div>
                    </AspectRatio>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" className="mr-2">Télécharger</Button>
                    <Button>Envoyer</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Mockup;
