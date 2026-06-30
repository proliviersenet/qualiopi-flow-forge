import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";

interface Formation {
  id: string;
  titre: string;
  objectifs: string;
  duree: string;
  tarif: string;
  modalites: string;
  statut: string;
  created_at: string;
}

const Formations = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };
  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [organismeId, setOrganismeId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }
      setUser({ name: session.user.user_metadata?.nom_complet || session.user.email || "", email: session.user.email || "", profileImage: "" });

      const { data: profile } = await supabase.from("profiles").select("organisme_id").eq("id", session.user.id).single();
      if (profile?.organisme_id) {
        setOrganismeId(profile.organisme_id);
        const { data } = await supabase.from("formations").select("*").eq("organisme_id", profile.organisme_id).order("created_at", { ascending: false });
        setFormations(data || []);
      }
      setLoading(false);
    };
    init();
  }, [navigate]);

  const filtrees = formations.filter(f =>
    f.titre?.toLowerCase().includes(search.toLowerCase()) ||
    f.objectifs?.toLowerCase().includes(search.toLowerCase())
  );

  const parStatut = (statut: string) => filtrees.filter(f => f.statut === statut);

  const badgeColor = (statut: string) => {
    if (statut === "publie") return "bg-green-100 text-green-700";
    if (statut === "draft") return "bg-gray-100 text-gray-600";
    return "bg-red-100 text-red-600";
  };

  const supprimerFormation = async (id: string) => {
    const { error } = await supabase.from("formations").delete().eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setFormations(prev => prev.filter(f => f.id !== id));
    toast({ title: "Formation supprimée" });
  };

  const FormationCard = ({ formation }: { formation: Formation }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-medium text-gray-900 flex-1">{formation.titre}</h3>
          <Badge className={badgeColor(formation.statut)}>
            {formation.statut === "publie" ? "Publié" : formation.statut === "draft" ? "Brouillon" : "Archivé"}
          </Badge>
        </div>
        {formation.objectifs && (
          <p className="text-sm text-gray-500 mb-3 line-clamp-2">{formation.objectifs}</p>
        )}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-4">
          {formation.duree && <span>⏱ {formation.duree}</span>}
          {formation.tarif && <span>💶 {formation.tarif}</span>}
          {formation.modalites && <span>📍 {formation.modalites}</span>}
        </div>
        <div className="flex gap-2">
          <Link to={`/formations/${formation.id}`} className="flex-1">
            <Button variant="outline" size="sm" className="w-full">Voir</Button>
          </Link>
          <Link to={`/formations/${formation.id}/edit`} className="flex-1">
            <Button size="sm" className="w-full" style={{ background: "#25245e", color: "#fff" }}>Modifier</Button>
          </Link>
          <Button variant="outline" size="sm" className="text-red-600 border-red-200" onClick={() => supprimerFormation(formation.id)}>
            Supprimer
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <h1 className="text-3xl font-bold text-gray-900">Mes formations</h1>
            <Link to="/formations/creation">
              <Button className="btn-cta font-bold">
                + Créer une formation
              </Button>
            </Link>
          </div>

          <div className="mb-6">
            <Input
              placeholder="Rechercher une formation..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Chargement...</div>
          ) : formations.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-4xl mb-4">📚</p>
              <p className="text-lg font-medium text-gray-700 mb-2">Aucune formation pour l'instant</p>
              <p className="text-gray-500 mb-6">Créez votre première formation pour commencer à gérer vos sessions.</p>
              <Link to="/formations/creation">
                <Button className="btn-cta font-bold">Créer ma première formation</Button>
              </Link>
            </Card>
          ) : (
            <Tabs defaultValue="toutes">
              <TabsList className="mb-6">
                <TabsTrigger value="toutes">Toutes ({filtrees.length})</TabsTrigger>
                <TabsTrigger value="publie">Publiées ({parStatut("publie").length})</TabsTrigger>
                <TabsTrigger value="draft">Brouillons ({parStatut("draft").length})</TabsTrigger>
                <TabsTrigger value="archive">Archivées ({parStatut("archive").length})</TabsTrigger>
              </TabsList>
              <TabsContent value="toutes">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filtrees.map(f => <FormationCard key={f.id} formation={f} />)}
                </div>
              </TabsContent>
              <TabsContent value="publie">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {parStatut("publie").map(f => <FormationCard key={f.id} formation={f} />)}
                </div>
              </TabsContent>
              <TabsContent value="draft">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {parStatut("draft").map(f => <FormationCard key={f.id} formation={f} />)}
                </div>
              </TabsContent>
              <TabsContent value="archive">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {parStatut("archive").map(f => <FormationCard key={f.id} formation={f} />)}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Formations;
