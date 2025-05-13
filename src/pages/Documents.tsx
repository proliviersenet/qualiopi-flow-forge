
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Document } from "@/types";

const mockUser = {
  name: "Jean Dupont",
  email: "jean@formationpro.fr",
  profileImage: "",
};

// Documents mock data
const mockDocuments: Document[] = [
  {
    id: "1",
    title: "Support de cours Excel Avancé",
    type: "support",
    url: "/documents/excel-avance.pdf",
    createdAt: "2023-05-15T10:30:00.000Z",
  },
  {
    id: "2",
    title: "Évaluation Management d'équipe",
    type: "evaluation",
    url: "/documents/eval-management.pdf",
    createdAt: "2023-06-22T14:45:00.000Z",
  },
  {
    id: "3",
    title: "Feuille d'émargement Communication Professionnelle",
    type: "emargement",
    url: "/documents/emargement-comm.pdf",
    createdAt: "2023-07-10T09:15:00.000Z",
  },
  {
    id: "4",
    title: "Attestation de formation Gestion de projet",
    type: "attestation",
    url: "/documents/attestation-projet.pdf",
    createdAt: "2023-08-05T16:20:00.000Z",
  },
  {
    id: "5",
    title: "Cours Marketing Digital",
    type: "cours",
    url: "/documents/cours-marketing.pdf",
    createdAt: "2023-09-18T11:10:00.000Z",
  },
  {
    id: "6",
    title: "Questionnaire de satisfaction",
    type: "autre",
    url: "/documents/questionnaire.pdf",
    createdAt: "2023-10-30T13:25:00.000Z",
  },
];

// Define document type colors
const getDocumentTypeLabel = (type: string) => {
  switch (type) {
    case "cours":
      return { label: "Cours", color: "bg-blue-100 text-blue-800" };
    case "support":
      return { label: "Support", color: "bg-green-100 text-green-800" };
    case "evaluation":
      return { label: "Évaluation", color: "bg-red-100 text-red-800" };
    case "emargement":
      return { label: "Émargement", color: "bg-purple-100 text-purple-800" };
    case "attestation":
      return { label: "Attestation", color: "bg-yellow-100 text-yellow-800" };
    default:
      return { label: "Autre", color: "bg-gray-100 text-gray-800" };
  }
};

const Documents = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [tab, setTab] = useState("all");
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);

  // Filter documents based on search term and active tab
  const filteredDocuments = mockDocuments.filter((doc) => {
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (tab === "all") return matchesSearch;
    return matchesSearch && doc.type === tab;
  });

  // Toggle document selection
  const toggleSelectDocument = (docId: string) => {
    if (selectedDocuments.includes(docId)) {
      setSelectedDocuments(selectedDocuments.filter(id => id !== docId));
    } else {
      setSelectedDocuments([...selectedDocuments, docId]);
    }
  };

  // Select or deselect all documents
  const selectAllDocuments = () => {
    if (selectedDocuments.length === filteredDocuments.length) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(filteredDocuments.map(doc => doc.id));
    }
  };

  // Handle document deletion
  const handleDeleteDocument = (id: string) => {
    toast({
      title: "Document supprimé",
      description: "Le document a été supprimé avec succès",
    });
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={mockUser} />

      <main className="flex-grow bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
            <h1 className="text-3xl font-bold mb-4 md:mb-0">Mes documents</h1>
            <div className="flex gap-2">
              <Button variant="outline">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
                  />
                </svg>
                Importer
              </Button>
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
                Nouveau document
              </Button>
            </div>
          </div>

          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-grow">
                  <Input
                    type="text"
                    placeholder="Rechercher un document..."
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
                <div className="flex gap-2 md:justify-end">
                  <Button variant="outline" size="sm" disabled={selectedDocuments.length === 0}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                      />
                    </svg>
                    Télécharger
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs 
            defaultValue="all" 
            value={tab} 
            onValueChange={setTab} 
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="all">Tous</TabsTrigger>
              <TabsTrigger value="cours">Cours</TabsTrigger>
              <TabsTrigger value="support">Supports</TabsTrigger>
              <TabsTrigger value="evaluation">Évaluations</TabsTrigger>
              <TabsTrigger value="emargement">Émargements</TabsTrigger>
              <TabsTrigger value="attestation">Attestations</TabsTrigger>
              <TabsTrigger value="autre">Autres</TabsTrigger>
            </TabsList>
            
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={selectedDocuments.length === filteredDocuments.length && filteredDocuments.length > 0}
                              onChange={selectAllDocuments}
                            />
                          </div>
                        </TableHead>
                        <TableHead>Titre</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Date de création</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocuments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6">
                            Aucun document trouvé
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredDocuments.map((doc) => {
                          const typeInfo = getDocumentTypeLabel(doc.type);
                          const createdAt = new Date(doc.createdAt).toLocaleDateString("fr-FR");
                          
                          return (
                            <TableRow key={doc.id}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  checked={selectedDocuments.includes(doc.id)}
                                  onChange={() => toggleSelectDocument(doc.id)}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3">
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
                                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                  </svg>
                                  <div className="font-medium">
                                    <Link 
                                      to={`/documents/${doc.id}`}
                                      className="text-blue-600 hover:text-blue-800"
                                    >
                                      {doc.title}
                                    </Link>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={typeInfo.color}>
                                  {typeInfo.label}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {createdAt}
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
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
                                      <a href={doc.url} target="_blank" rel="noreferrer">
                                        Visualiser
                                      </a>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      Télécharger
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild>
                                      <Link to={`/documents/${doc.id}/edit`}>
                                        Modifier
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-red-600 focus:text-red-600"
                                      onClick={() => handleDeleteDocument(doc.id)}
                                    >
                                      Supprimer
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Documents;
