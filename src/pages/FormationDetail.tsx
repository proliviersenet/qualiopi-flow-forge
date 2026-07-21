import { useEffect, useState, useRef } from "react";
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
  const supportRef = useRef<HTMLInputElement>(null);
  const programmeRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [formation, setFormation] = useState<Formation | null>(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [generatingTrame, setGeneratingTrame] = useState(false);

  const uploadDocument = async (file: File, type: "support" | "programme") => {
    if (!id) return;

    // PDF uniquement : format lu nativement par Claude (analyse du contenu pour la trame),
    // et ça évite les soucis de compatibilité Word/PPT.
    const extLower = file.name.split(".").pop()?.toLowerCase() || "";
    if (extLower !== "pdf") {
      toast({
        title: "Format non accepté",
        description: `${type === "support" ? "Le support" : "Le programme"} doit être au format PDF. Convertissez votre document avant de l'uploader.`,
        variant: "destructive",
      });
      return;
    }

    setUploading(type);
    // Nom de fichier assaini : Supabase Storage rejette les clés avec espaces/accents ("Invalid key").
    // Chemin déterministe en .pdf ; le nom d'origine reste affiché via nom_fichier en base.
    const path = `formations/${id}/${type}/${type}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("documents-qualiopi")
      .upload(path, file, { upsert: true, contentType: "application/pdf" });

    if (upErr) {
      toast({ title: "Erreur upload", description: upErr.message, variant: "destructive" });
      setUploading(null); return;
    }

    const { data: urlData } = supabase.storage.from("documents-qualiopi").getPublicUrl(path);
    const url = urlData?.publicUrl || "";

    await supabase.from("documents_formation").upsert({
      formation_id: id,
      type,
      nom_fichier: file.name,
      url,
      genere_par: "manuel",
      updated_at: new Date().toISOString(),
    }, { onConflict: "formation_id,type" });

    setDocuments(prev => ({ ...prev, [type]: url }));
    setUploading(null);
    toast({ title: `✅ ${type === "support" ? "Support" : "Programme"} uploadé` });

    // Déclencher génération trame si support ET programme sont présents
    const newDocs = { ...documents, [type]: url };
    if (newDocs.support && newDocs.programme) {
      toast({ title: "🤖 Génération de la trame pédagogique en cours...", description: "Claude analyse votre formation et génère la trame. Cela prend 10-30 secondes." });
      lancerGenerationTrame();
    }
  };

  const lancerGenerationTrame = async () => {
    if (!id) return;
    setGeneratingTrame(true);
    const { data, error } = await supabase.functions.invoke("generer-trame", {
      body: { formation_id: id },
    });
    setGeneratingTrame(false);

    if (error || data?.error) {
      toast({ title: "Erreur génération trame", description: data?.error || error?.message, variant: "destructive" });
      return;
    }

    setDocuments(prev => ({ ...prev, trame_pedagogique: data.contenu_html }));
    toast({ title: "✅ Trame pédagogique générée", description: "Cliquez sur 'Voir la trame' pour la consulter et l'imprimer." });
  };

  const voirTrame = () => {
    if (!documents.trame_pedagogique) return;
    const win = window.open("", "_blank");
    if (win) { win.document.write(documents.trame_pedagogique); win.document.close(); }
  };

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

      // Charger les documents existants
      const { data: docs } = await supabase
        .from("documents_formation")
        .select("type, url, contenu_html, nom_fichier")
        .eq("formation_id", id);
      if (docs) {
        const docsMap: Record<string, string> = {};
        docs.forEach((d: Record<string, string>) => { docsMap[d.type] = d.url || d.contenu_html || ""; });
        setDocuments(docsMap);
      }

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

            {/* Section Documents */}
            <Card>
              <CardContent className="pt-5">
                <h3 className="font-semibold text-gray-700 mb-4">📁 Documents de la formation</h3>

                <div className="space-y-4">
                  {/* Support pédagogique */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-700">📚 Support pédagogique</p>
                      <p className="text-xs text-gray-400">PDF uniquement — analysé par Claude pour générer la trame. Convertissez votre support avant l'upload. Obligatoire</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      {documents.support && <Badge className="bg-green-100 text-green-700">✓ Uploadé</Badge>}
                      <input ref={supportRef} type="file" accept=".pdf" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocument(f, "support"); }} />
                      <Button size="sm" variant="outline" disabled={uploading === "support"}
                        onClick={() => supportRef.current?.click()}>
                        {uploading === "support" ? "Upload..." : documents.support ? "Remplacer" : "Uploader"}
                      </Button>
                      {documents.support && <a href={documents.support} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline">Voir</Button></a>}
                    </div>
                  </div>

                  {/* Programme détaillé */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-700">📋 Programme détaillé</p>
                      <p className="text-xs text-gray-400">PDF uniquement — analysé par Claude pour générer la trame. Convertissez votre programme avant l'upload. Obligatoire</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      {documents.programme && <Badge className="bg-green-100 text-green-700">✓ Uploadé</Badge>}
                      <input ref={programmeRef} type="file" accept=".pdf" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocument(f, "programme"); }} />
                      <Button size="sm" variant="outline" disabled={uploading === "programme"}
                        onClick={() => programmeRef.current?.click()}>
                        {uploading === "programme" ? "Upload..." : documents.programme ? "Remplacer" : "Uploader"}
                      </Button>
                      {documents.programme && <a href={documents.programme} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline">Voir</Button></a>}
                    </div>
                  </div>

                  {/* Trame pédagogique générée */}
                  <div className={`flex items-center justify-between p-3 rounded-lg ${documents.trame_pedagogique ? "bg-blue-50 border border-blue-200" : "bg-gray-50"}`}>
                    <div>
                      <p className="text-sm font-medium text-gray-700">🤖 Trame pédagogique</p>
                      <p className="text-xs text-gray-400">
                        {documents.trame_pedagogique
                          ? "Générée par QalioFlex — confidentielle, usage formateur uniquement"
                          : "Générée automatiquement quand support + programme sont uploadés"}
                      </p>
                    </div>
                    <div className="flex gap-2 items-center">
                      {documents.trame_pedagogique && <Badge className="bg-blue-100 text-blue-700">✓ Générée</Badge>}
                      {documents.support && documents.programme && (
                        <Button size="sm" variant="outline" disabled={generatingTrame}
                          onClick={lancerGenerationTrame}>
                          {generatingTrame ? "Génération..." : documents.trame_pedagogique ? "Regénérer" : "Générer"}
                        </Button>
                      )}
                      {documents.trame_pedagogique && (
                        <Button size="sm" style={{ background: "#25245e", color: "#fff" }} onClick={voirTrame}>
                          Voir la trame
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FormationDetail;
