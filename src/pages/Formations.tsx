
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Formation } from "@/types";

const mockUser = {
  name: "Jean Dupont",
  email: "jean@formationpro.fr",
  profileImage: "",
};

const mockFormations: Formation[] = [
  {
    id: "1",
    title: "Excel Avancé pour professionnels",
    description:
      "Maîtrisez les fonctionnalités avancées d'Excel pour optimiser votre productivité",
    duration: "2 jours (14h)",
    price: 1200,
    formatorId: "1",
    createdAt: "2023-01-15T09:00:00.000Z",
    status: "published",
    clients: ["5", "6", "7"],
  },
  {
    id: "2",
    title: "Management d'équipe efficace",
    description:
      "Développez vos compétences en management pour mener votre équipe au succès",
    duration: "3 jours (21h)",
    price: 1800,
    formatorId: "1",
    createdAt: "2023-02-05T10:30:00.000Z",
    status: "published",
    clients: ["8", "9"],
  },
  {
    id: "3",
    title: "Communication professionnelle",
    description:
      "Améliorez votre communication écrite et orale en contexte professionnel",
    duration: "1 jour (7h)",
    price: 800,
    formatorId: "1",
    createdAt: "2023-03-18T14:00:00.000Z",
    status: "draft",
    clients: [],
  },
  {
    id: "4",
    title: "Gestion de projet Agile",
    description:
      "Initiez-vous à la méthodologie Agile pour une gestion de projet efficace",
    duration: "2 jours (14h)",
    price: 1500,
    formatorId: "1",
    createdAt: "2023-04-22T08:45:00.000Z",
    status: "archived",
    clients: ["10", "11", "12"],
  },
];

const Formations = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [tab, setTab] = useState("all");

  const filteredFormations = mockFormations.filter((formation) => {
    const matchesSearch = formation.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    
    if (tab === "all") return matchesSearch;
    if (tab === "published") return matchesSearch && formation.status === "published";
    if (tab === "draft") return matchesSearch && formation.status === "draft";
    if (tab === "archived") return matchesSearch && formation.status === "archived";
    
    return matchesSearch;
  });

  const handleDelete = (id: string) => {
    toast({
      title: "Formation supprimée",
      description: "La formation a été supprimée avec succès",
    });
  };

  const handleDuplicate = (id: string) => {
    toast({
      title: "Formation dupliquée",
      description: "Une copie de la formation a été créée",
    });
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={mockUser} />

      <main className="flex-grow bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
            <h1 className="text-3xl font-bold mb-4 md:mb-0">Mes formations</h1>
            <Link to="/formations/creation">
              <Button>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
                Nouvelle formation
              </Button>
            </Link>
          </div>

          <div className="mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-grow">
                <Input
                  type="text"
                  placeholder="Rechercher une formation..."
                  className="pr-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <svg
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
          </div>

          <Tabs 
            defaultValue="all" 
            value={tab} 
            onValueChange={setTab} 
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="all">Toutes</TabsTrigger>
              <TabsTrigger value="published">Publiées</TabsTrigger>
              <TabsTrigger value="draft">Brouillons</TabsTrigger>
              <TabsTrigger value="archived">Archivées</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all">
              {filteredFormations.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Aucune formation trouvée</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredFormations.map((formation) => (
                    <FormationCard 
                      key={formation.id} 
                      formation={formation} 
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="published">
              {filteredFormations.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Aucune formation publiée trouvée</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredFormations.map((formation) => (
                    <FormationCard 
                      key={formation.id} 
                      formation={formation} 
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="draft">
              {filteredFormations.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Aucun brouillon trouvé</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredFormations.map((formation) => (
                    <FormationCard 
                      key={formation.id} 
                      formation={formation} 
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="archived">
              {filteredFormations.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Aucune formation archivée trouvée</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredFormations.map((formation) => (
                    <FormationCard 
                      key={formation.id} 
                      formation={formation} 
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
};

interface FormationCardProps {
  formation: Formation;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

const FormationCard = ({ formation, onDelete, onDuplicate }: FormationCardProps) => {
  const createdAt = new Date(formation.createdAt).toLocaleDateString("fr-FR");
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Publiée</Badge>;
      case "draft":
        return <Badge variant="outline" className="bg-gray-100 text-gray-800 hover:bg-gray-200">Brouillon</Badge>;
      case "archived":
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">Archivée</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-0 flex flex-col h-full">
        <div className="p-6 flex-grow">
          <div className="flex justify-between items-start mb-3">
            <Link to={`/formations/${formation.id}`}>
              <h3 className="text-lg font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                {formation.title}
              </h3>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Options</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link to={`/formations/${formation.id}`}>
                    Voir les détails
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={`/formations/${formation.id}/edit`}>
                    Modifier
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(formation.id)}>
                  Dupliquer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => onDelete(formation.id)}
                >
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">
            {formation.description}
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {getStatusBadge(formation.status)}
            <span className="text-xs text-gray-500">Créée le {createdAt}</span>
          </div>
          <div className="flex flex-wrap items-center text-sm text-gray-600">
            <div className="flex items-center mr-4 mb-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {formation.duration}
            </div>
            {formation.price && (
              <div className="flex items-center mb-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {formation.price} €
              </div>
            )}
          </div>
        </div>
        <div className="border-t p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              <span className="ml-1 text-sm text-gray-600">
                {formation.clients?.length ?? 0} apprenants
              </span>
            </div>
            <Button variant="link" asChild size="sm">
              <Link to={`/formations/${formation.id}`}>
                Gérer
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Formations;
