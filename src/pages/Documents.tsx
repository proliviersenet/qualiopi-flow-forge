import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";

interface Document {
  id: string;
  type: string;
  statut: string;
  origine: string;
  chemin: string;
  created_at: string;
  session_id: string;
  sessions?: { date_debut: string; formations?: { titre: string } };
}

interface Signature {
  id: string;
  statut: string;
  document_id: string;
  provider: string;
}

const TYPE_LABELS: Record<string, string> = {
  programme: "Programme",
  convention: "Convention",
  emargement: "Émargement",
  attestation: "Attestation",
  evaluation_chaud: "Éval. à chaud",
  evaluation_froid: "Éval. à froid",
  livret_accueil: "Livret d'accueil",
  support_pedagogique: "Support pédagogique",
};

const Documents = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }
      setUser({ name: session.user.user_metadata?.nom_complet || session.user.email || "", email: session.user.email || "", profileImage: "" });

      const { data: profile } = await supabase.from("profiles").select("organisme_id").eq("id", session.user.id).single();
      if (profile?.organisme_id) {
        const { data: docs } = await supabase
          .from("documents")
          .select("*, sessions(date_debut, formations(titre))")
          .order("created_at", { ascending: false });
        setDocuments(docs || []);

        const { data: sigs } = await supabase.from("signatures").select("*");
        setSignatures(sigs || []);
      }
      setLoading(false);
    };
    init();
  }, [navigate]);

  const getSignature = (docId: string) => signatures.find(s => s.document_id === docId);

  const statutBadge = (statut: string) => {
    if (statut === "pret") return "bg-green-100 text-green-700";
    if (statut === "en_cours") return "bg-blue-100 text-blue-700";
    return "bg-red-100 text-red-600";
  };

  const signatureBadge = (statut: string) => {
    if (statut === "signe") return "bg-green-100 text-green-700";
    if (statut === "en_attente") return "bg-amber-100 text-amber-700";
    if (statut === "refuse") return "bg-red-100 text-red-600";
    return "bg-gray-100 text-gray-500";
  };

  const filtres = documents.filter(d =>
    TYPE_LABELS[d.type]?.toLowerCase().includes(search.toLowerCase()) ||
    (d.sessions?.formations?.titre || "").toLowerCase().includes(search.toLowerCase())
  );

  const parType = (type: string) => filtres.filter(d => d.type === type);
  const aSignature = ["convention", "emargement", "attestation"];

  const DocCard = ({ doc }: { doc: Document }) => {
    const sig = getSignature(doc.id);
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="font-medium text-gray-900">{TYPE_LABELS[doc.type] || doc.type}</p>
              <p className="text-xs text-gray-400 mt-1">
                {doc.sessions?.formations?.titre || "Formation"} · {doc.sessions?.date_debut || ""}
              </p>
            </div>
            <div className="flex flex-col gap-1 items-end">
              <Badge className={statutBadge(doc.statut)}>
                {doc.statut === "pret" ? "Prêt" : doc.statut === "en_cours" ? "En cours" : "Erreur"}
              </Badge>
              {doc.origine === "import" && <Badge className="bg-purple-100 text-purple-700">Importé</Badge>}
            </div>
          </div>
          {sig && (
            <div className="mb-3">
              <Badge className={signatureBadge(sig.statut)}>
                ✍️ {sig.statut === "signe" ? "Signé" : sig.statut === "en_attente" ? "En attente de signature" : sig.statut === "refuse" ? "Refusé" : "—"}
              </Badge>
            </div>
          )}
          <div className="flex gap-2">
            {doc.chemin && (
              <Button variant="outline" size="sm" onClick={() => toast({ title: "Téléchargement en cours..." })}>
                Télécharger
              </Button>
            )}
            {aSignature.includes(doc.type) && !sig && doc.statut === "pret" && (
              <Button size="sm" className="btn-cta" onClick={() => toast({ title: "Envoi pour signature via DocuSign..." })}>
                Envoyer pour signature
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => toast({ title: "Import de document" })}>
                Importer un document
              </Button>
              <Button className="btn-cta font-bold" onClick={() => toast({ title: "Génération en cours..." })}>
                Générer des documents
              </Button>
            </div>
          </div>

          <div className="mb-4">
            <Input placeholder="Rechercher un document..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Chargement...</div>
          ) : documents.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-4xl mb-4">📄</p>
              <p className="text-lg font-medium text-gray-700 mb-2">Aucun document pour l'instant</p>
              <p className="text-gray-500 mb-6">Les documents sont générés automatiquement lors de la création de sessions de formation.</p>
            </Card>
          ) : (
            <Tabs defaultValue="tous">
              <TabsList className="mb-6 flex-wrap">
                <TabsTrigger value="tous">Tous ({filtres.length})</TabsTrigger>
                <TabsTrigger value="convention">Conventions</TabsTrigger>
                <TabsTrigger value="emargement">Émargements</TabsTrigger>
                <TabsTrigger value="attestation">Attestations</TabsTrigger>
                <TabsTrigger value="evaluation_chaud">Évaluations</TabsTrigger>
              </TabsList>
              <TabsContent value="tous">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtres.map(d => <DocCard key={d.id} doc={d} />)}
                </div>
              </TabsContent>
              {["convention", "emargement", "attestation", "evaluation_chaud"].map(type => (
                <TabsContent key={type} value={type}>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {parType(type).length > 0
                      ? parType(type).map(d => <DocCard key={d.id} doc={d} />)
                      : <p className="text-gray-500 col-span-3">Aucun document de ce type.</p>
                    }
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Documents;
