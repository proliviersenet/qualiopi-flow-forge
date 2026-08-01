import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const FormationEdit = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    titre: "",
    programme: "",
    objectifs: "",
    duree: "",
    tarif: "",
    modalites: "",
    prerequis: "",
    document_mode: "auto",
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    // Point non bloquant (audit test grandeur réelle 01/08) : redirige un
    // compte client vers son espace au lieu de laisser voir l'UI formateur.
    if (authSession.user.user_metadata?.role === "client") { navigate("/espace-client"); return; }

    const init = async () => {
      setUser({
        name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "",
        email: authSession.user.email || "",
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

      const f = data as Record<string, string>;
      setFormData({
        titre: f.titre || "",
        programme: f.programme || "",
        objectifs: f.objectifs || "",
        duree: f.duree || "",
        tarif: f.tarif || "",
        modalites: f.modalites || "",
        prerequis: f.prerequis || "",
        document_mode: f.document_mode || "auto",
      });

      setLoading(false);
    };
    init();
  }, [id, navigate, toast, authSession, authLoading]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSelectChange = (name: string) => (value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (statut: "draft" | "publie") => {
    if (!formData.titre) {
      toast({ title: "Champ requis", description: "Le titre est obligatoire.", variant: "destructive" });
      return;
    }
    setSaving(true);

    const { error } = await supabase
      .from("formations")
      .update({
        titre: formData.titre,
        objectifs: formData.objectifs || null,
        programme: formData.programme || null,
        modalites: formData.modalites || null,
        prerequis: formData.prerequis || null,
        duree: formData.duree || null,
        tarif: formData.tarif || null,
        document_mode: formData.document_mode,
        statut,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    setSaving(false);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Formation mise à jour",
      description: statut === "publie" ? "Formation publiée." : "Enregistrée en brouillon.",
    });
    navigate(`/formations/${id}`);
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

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />

      <main className="flex-grow bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center mb-6">
            <Link to={`/formations/${id}`} className="text-exsenco-blue hover:text-blue-800 mr-2">
              &larr; Retour à la formation
            </Link>
          </div>

          <h1 className="text-3xl font-bold mb-6">Modifier la formation</h1>

          <Card className="max-w-3xl mx-auto">
            <CardContent className="pt-6 space-y-6">

              <div className="space-y-2">
                <Label htmlFor="titre">Titre <span className="text-red-500">*</span></Label>
                <Input
                  id="titre"
                  name="titre"
                  value={formData.titre}
                  onChange={handleChange}
                  placeholder="Titre de la formation"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="programme">Programme</Label>
                <Textarea
                  id="programme"
                  name="programme"
                  value={formData.programme}
                  onChange={handleChange}
                  placeholder="Déroulé et contenu de la formation..."
                  rows={5}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="objectifs">Objectifs pédagogiques</Label>
                <Textarea
                  id="objectifs"
                  name="objectifs"
                  value={formData.objectifs}
                  onChange={handleChange}
                  placeholder="Objectifs pédagogiques..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="duree">Durée</Label>
                  <Input
                    id="duree"
                    name="duree"
                    value={formData.duree}
                    onChange={handleChange}
                    placeholder="ex: 3 jours (21h)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tarif">Tarif</Label>
                  <Input
                    id="tarif"
                    name="tarif"
                    value={formData.tarif}
                    onChange={handleChange}
                    placeholder="ex: 1500 € net de taxes"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="modalites">Modalités</Label>
                <Textarea
                  id="modalites"
                  name="modalites"
                  value={formData.modalites}
                  onChange={handleChange}
                  placeholder="Présentiel / distanciel, public visé, accessibilité..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="prerequis">Prérequis</Label>
                <Textarea
                  id="prerequis"
                  name="prerequis"
                  value={formData.prerequis}
                  onChange={handleChange}
                  placeholder="Connaissances préalables nécessaires..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Mode de gestion documentaire</Label>
                <Select value={formData.document_mode} onValueChange={handleSelectChange("document_mode")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatique (génération + signature électronique)</SelectItem>
                    <SelectItem value="import">Import manuel (documents papier ou externes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => handleSave("draft")}
                >
                  {saving ? "Enregistrement..." : "Enregistrer en brouillon"}
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSave("publie")}
                  style={{ background: "#f2901e", color: "#fff" }}
                  className="font-bold"
                >
                  {saving ? "Publication..." : "Publier"}
                </Button>
              </div>

            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FormationEdit;
