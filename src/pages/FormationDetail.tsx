import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";

interface Formation {
  id: string;
  titre: string;
  objectifs: string;
  programme: string;
  modalites: string;
  prerequis: string;
  duree: string;
  tarif: string;
  document_mode: string;
  statut: string;
  created_at: string;
  updated_at: string;
}

const badgeColor = (statut: string) => {
  if (statut === "publie") return "bg-green-100 text-green-700";
  if (statut === "draft") return "bg-gray-100 text-gray-600";
  return "bg-red-100 text-red-600";
};

const badgeLabel = (statut: string) => {
  if (statut === "publie") return "Publié";
  if (statut === "draft") return "Brouillon";
  return "Archivé";
};

const FormationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [formation, setFormation] = useState<Formation | null>(null);
  const [loading, setLoading] = useState(true);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }

      setUser({
        name: session.user.user_metadata?.nom_complet || session.user.email || "",
        email: session.user.email || "",
        profileImage: "",
      });

      const { data, error } = await supabase
        .from("formations")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        toast({ title: "Formation introuvable", variant: "destructive" });
        navigate("/formations");
        return;
      }

      setFormation(data as Formation);
      setLoading(false);
    };
    init();
  }, [id, navigate, toast]);

  const toggleStatut = async () => {
    if (!formation) return;
    const newStatut = formation.statut === "publie" ? "draft" : "publie";
    const { error } = await supabase
      .from("formations")
      .update({ statut: newStatut })
      .eq("id", formation.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    setFormation((prev) => prev ? { ...prev, statut: newStatut } : prev);
    toast({ title: newStatut === "publie" ? "Formation publiée" : "Formation mise en brouillon" });
  };

  if (loading) {
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

  if (!formation) return null;

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />

      <main className="flex-grow bg-gray-50 py-8">
        <div className="container mx-auto px-4 max-w-3xl">

          <div className="flex items-center mb-6">
            <Link to="/formations" className="text-exsenco-blue hover:text-blue-800 mr-2">
              &larr; Retour aux formations
            </Link>
          </div>

          <div className="flex items-start justify-between mb-6 gap-4">
            <h1 className="text-3xl font-bold text-gray-900 flex-1">{formation.titre}</h1>
            <Badge className={badgeColor(formation.statut)}>{badgeLabel(formation.statut)}</Badge>
          </div>

          <div className="flex gap-3 mb-8">
            <Link to={`/formations/${formation.id}/edit`}>
              <Button style={{ background: "#25245e", color: "#fff" }} className="font-bold">
                Modifier
              </Button>
            </Link>
            <Button variant="outline" onClick={toggleStatut}>
              {formation.statut === "publie" ? "Passer en brouillon" : "Publier"}
            </Button>
          </div>

          <div className="space-y-4">
            {/* Infos clés */}
            <Card>
              <CardContent className="pt-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {formation.duree && (
                    <div>
                      <p className="text-gray-400 text-xs mb-1">⏱ Durée</p>
                      <p className="font-medium">{formation.duree}</p>
                    </div>
                  )}
                  {formation.tarif && (
                    <div>
                      <p className="text-gray-400 text-xs mb-1">💶 Tarif</p>
                      <p className="font-medium">{formation.tarif}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-400 text-xs mb-1">📄 Documents</p>
                    <p className="font-medium">{formation.document_mode === "auto" ? "Automatique" : "Import manuel"}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-1">📅 Créée le</p>
                    <p className="font-medium">{new Date(formation.created_at).toLocaleDateString("fr-FR")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {formation.objectifs && (
              <Card>
                <CardContent className="pt-5">
                  <h3 className="font-semibold text-gray-700 mb-2">🎯 Objectifs pédagogiques</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{formation.objectifs}</p>
                </CardContent>
              </Card>
            )}

            {formation.programme && (
              <Card>
                <CardContent className="pt-5">
                  <h3 className="font-semibold text-gray-700 mb-2">📋 Programme</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{formation.programme}</p>
                </CardContent>
              </Card>
            )}

            {formation.modalites && (
              <Card>
                <CardContent className="pt-5">
                  <h3 className="font-semibold text-gray-700 mb-2">📍 Modalités</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{formation.modalites}</p>
                </CardContent>
              </Card>
            )}

            {formation.prerequis && (
              <Card>
                <CardContent className="pt-5">
                  <h3 className="font-semibold text-gray-700 mb-2">✅ Prérequis</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{formation.prerequis}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FormationDetail;
