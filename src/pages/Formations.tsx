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
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const { session: authSession, loading: authLoading } = useAuth();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };
  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [organismeId, setOrganismeId] = useState<string | null>(null);
  const [dateAuditSurveillance, setDateAuditSurveillance] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Formation | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    // Point non bloquant (audit test grandeur réelle 01/08) : redirige un
    // compte client vers son espace au lieu de laisser voir l'UI formateur.
    if (authSession.user.user_metadata?.role === "client") { navigate("/espace-client"); return; }

    const init = async () => {
      setUser({ name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "", email: authSession.user.email || "", profileImage: "" });

      const { data: profile } = await supabase.from("profiles").select("organisme_id").eq("id", authSession.user.id).single();
      if (profile?.organisme_id) {
        setOrganismeId(profile.organisme_id);
        const { data } = await supabase.from("formations").select("*").eq("organisme_id", profile.organisme_id).order("created_at", { ascending: false });
        setFormations(data || []);

        // Point non bloquant #60 : archivage automatique 18 mois après le
        // dernier audit de surveillance (cf. Profil > Mon organisme).
        const { data: org } = await supabase
          .from("organismes")
          .select("date_dernier_audit_surveillance")
          .eq("id", profile.organisme_id)
          .single();
        setDateAuditSurveillance((org as { date_dernier_audit_surveillance: string | null } | null)?.date_dernier_audit_surveillance ?? null);
      }
      setLoading(false);
    };
    init();
  }, [navigate, authSession, authLoading]);

  // Prochaine bascule d'archivage automatique = date du dernier audit + 18 mois.
  const limiteArchivage = dateAuditSurveillance
    ? new Date(new Date(dateAuditSurveillance).setMonth(new Date(dateAuditSurveillance).getMonth() + 18))
    : null;
  const archivageDejaDeclenche = limiteArchivage ? new Date() >= limiteArchivage : false;

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
    setConfirmDelete(null);
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
          <Button variant="outline" size="sm" className="text-red-600 border-red-200" onClick={() => setConfirmDelete(formation)}>
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

          {!loading && limiteArchivage && (
            <div
              className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
                archivageDejaDeclenche
                  ? "bg-orange-50 border-orange-200 text-orange-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
              }`}
            >
              {archivageDejaDeclenche
                ? `📦 Archivage automatique actif : les formations publiées non mises à jour depuis ton dernier audit de surveillance (${new Date(dateAuditSurveillance as string).toLocaleDateString("fr-FR")}) sont archivées automatiquement.`
                : `ℹ️ Prochaine bascule d'archivage automatique le ${limiteArchivage.toLocaleDateString("fr-FR")} (18 mois après ton dernier audit de surveillance) : les formations non mises à jour depuis seront archivées.`}
            </div>
          )}

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

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette formation ?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  Cette action supprimera définitivement la formation <strong>{confirmDelete.titre}</strong>.
                  Cette action est irréversible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDelete && supprimerFormation(confirmDelete.id)}
            >
              Oui, supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Formations;
