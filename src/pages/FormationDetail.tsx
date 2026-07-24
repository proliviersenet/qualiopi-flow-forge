import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
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

// Les 3 questionnaires d'évaluation stagiaire (chantier 2) — même principe que
// "Compétences à évaluer" (génération Claude + édition + sauvegarde), mais
// factorisé sur 3 types plutôt que dupliqué 3 fois.
const EVAL_TYPES: { key: "chaud" | "formateur" | "froid"; label: string; icon: string; desc: string }[] = [
  { key: "chaud", label: "Évaluation à chaud", icon: "🔥", desc: "Envoyée au stagiaire juste après la fin de la formation." },
  { key: "formateur", label: "Évaluation du formateur", icon: "🧑‍🏫", desc: "Porte spécifiquement sur l'animateur de la formation." },
  { key: "froid", label: "Évaluation à froid (J+90)", icon: "📈", desc: "Envoyée environ 90 jours après la formation, mesure l'impact sur le poste." },
];

const FormationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const supportRef = useRef<HTMLInputElement>(null);
  const programmeRef = useRef<HTMLInputElement>(null);
  const trameAutoTriggeredRef = useRef(false);

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [formation, setFormation] = useState<Formation | null>(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [generatingTrame, setGeneratingTrame] = useState(false);
  const [competences, setCompetences] = useState<string[]>([]);
  const [objectifsEval, setObjectifsEval] = useState<string[]>([]);
  const [generatingCompetences, setGeneratingCompetences] = useState(false);
  const [savingCompetences, setSavingCompetences] = useState(false);
  const [generatingDevisGenerique, setGeneratingDevisGenerique] = useState(false);
  const [competencesSaved, setCompetencesSaved] = useState(false);
  const [evalQuestions, setEvalQuestions] = useState<Record<string, string[]>>({ chaud: [], formateur: [], froid: [] });
  const [evalGenerating, setEvalGenerating] = useState<Record<string, boolean>>({ chaud: false, formateur: false, froid: false });
  const [evalSaving, setEvalSaving] = useState<Record<string, boolean>>({ chaud: false, formateur: false, froid: false });
  const [evalSaved, setEvalSaved] = useState<Record<string, boolean>>({ chaud: false, formateur: false, froid: false });

  const uploadDocument = async (file: File, type: "support" | "programme") => {
    if (!id) return;

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
    const path = `formations/${id}/${type}/${type}-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("documents-qualiopi")
      .upload(path, file, { contentType: "application/pdf", cacheControl: "3600" });

    if (upErr) {
      toast({ title: "Erreur upload", description: upErr.message, variant: "destructive" });
      setUploading(null); return;
    }

    const { data: urlData } = supabase.storage.from("documents-qualiopi").getPublicUrl(path);
    const url = urlData?.publicUrl || "";

    // IMPORTANT : pas de .upsert(onConflict:"formation_id,type") — depuis l'ajout de
    // session_id à documents_formation, l'index unique sur (formation_id, type) est
    // PARTIEL (WHERE session_id IS NULL) et PostgREST ne sait pas l'utiliser comme
    // cible ON CONFLICT (erreur 42P10). Ça faisait échouer silencieusement la
    // sauvegarde en base (le fichier montait bien sur le Storage, mais la ligne
    // documents_formation n'était jamais créée/mise à jour). SELECT puis
    // INSERT/UPDATE explicite à la place, avec gestion d'erreur cette fois.
    const { data: existingDoc } = await supabase
      .from("documents_formation")
      .select("id")
      .eq("formation_id", id)
      .eq("type", type)
      .maybeSingle();

    const docPayload = {
      formation_id: id,
      type,
      nom_fichier: file.name,
      url,
      genere_par: "manuel",
      updated_at: new Date().toISOString(),
    };

    const { error: docErr } = existingDoc
      ? await supabase.from("documents_formation").update(docPayload).eq("id", existingDoc.id)
      : await supabase.from("documents_formation").insert(docPayload);

    if (docErr) {
      toast({ title: "Erreur sauvegarde", description: docErr.message, variant: "destructive" });
      setUploading(null);
      return;
    }

    setDocuments(prev => ({ ...prev, [type]: url }));
    setUploading(null);
    toast({ title: `✅ ${type === "support" ? "Support" : "Programme"} uploadé` });
  };

  const lancerGenerationTrame = async () => {
    if (!id) return;
    setGeneratingTrame(true);
    const { data, error } = await supabase.functions.invoke("generer-trame", {
      body: { formation_id: id },
    });
    setGeneratingTrame(false);

    if (error || data?.error) {
      let message = data?.error || error?.message;
      const ctx = (error as { context?: Response })?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          if (body?.error) message = body.error;
        } catch {
          // corps non-JSON, on garde le message par défaut
        }
      }
      toast({ title: "Erreur génération trame", description: message, variant: "destructive" });
      return;
    }

    setDocuments(prev => ({ ...prev, trame_pedagogique: data.contenu_html }));
    toast({ title: "✅ Trame pédagogique générée", description: "Cliquez sur 'Voir la trame' pour la consulter et l'imprimer." });
  };

  useEffect(() => {
    if (
      documents.support &&
      documents.programme &&
      !documents.trame_pedagogique &&
      !generatingTrame &&
      !trameAutoTriggeredRef.current
    ) {
      trameAutoTriggeredRef.current = true;
      toast({ title: "🤖 Génération de la trame pédagogique en cours...", description: "Claude analyse vos documents et rédige la trame. Cela peut prendre 1 à 3 minutes." });
      lancerGenerationTrame();
    }
  }, [documents.support, documents.programme, documents.trame_pedagogique, generatingTrame]);

  const genererCompetences = async () => {
    if (!id) return;
    setGeneratingCompetences(true);
    const { data, error } = await supabase.functions.invoke("generer-competences", {
      body: { formation_id: id },
    });
    setGeneratingCompetences(false);

    if (error || data?.error) {
      let message = data?.error || error?.message;
      const ctx = (error as { context?: Response })?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          if (body?.error) message = body.error;
        } catch {
          // corps non-JSON
        }
      }
      toast({ title: "Erreur génération compétences", description: message, variant: "destructive" });
      return;
    }

    setCompetences(data.competences || []);
    setObjectifsEval(data.objectifs || []);
    setCompetencesSaved(false);
    toast({ title: "✅ Liste générée", description: "Relisez et ajustez si besoin, puis enregistrez." });
  };

  const sauverCompetences = async () => {
    if (!id) return;
    setSavingCompetences(true);
    const { error } = await supabase.from("formation_competences").upsert({
      formation_id: id,
      competences,
      objectifs: objectifsEval,
      genere_par: "manuel",
      updated_at: new Date().toISOString(),
    }, { onConflict: "formation_id" });
    setSavingCompetences(false);
    if (error) {
      toast({ title: "Erreur enregistrement", description: error.message, variant: "destructive" });
      return;
    }
    setCompetencesSaved(true);
    toast({ title: "✅ Liste enregistrée" });
  };

  const modifierItem = (liste: "competences" | "objectifs", index: number, valeur: string) => {
    if (liste === "competences") setCompetences(prev => prev.map((c, i) => i === index ? valeur : c));
    else setObjectifsEval(prev => prev.map((o, i) => i === index ? valeur : o));
    setCompetencesSaved(false);
  };

  const supprimerItem = (liste: "competences" | "objectifs", index: number) => {
    if (liste === "competences") setCompetences(prev => prev.filter((_, i) => i !== index));
    else setObjectifsEval(prev => prev.filter((_, i) => i !== index));
    setCompetencesSaved(false);
  };

  const ajouterItem = (liste: "competences" | "objectifs") => {
    if (liste === "competences") setCompetences(prev => [...prev, ""]);
    else setObjectifsEval(prev => [...prev, ""]);
    setCompetencesSaved(false);
  };

  const voirTrame = () => {
    if (!documents.trame_pedagogique) return;
    const win = window.open("", "_blank");
    if (win) { win.document.write(documents.trame_pedagogique); win.document.close(); }
  };

  const lancerGenerationDevisGenerique = async () => {
    if (!id) return;
    setGeneratingDevisGenerique(true);
    const { data, error } = await supabase.functions.invoke("generer-devis-generique", {
      body: { formation_id: id },
    });
    setGeneratingDevisGenerique(false);

    if (error || data?.error) {
      let message = data?.error || error?.message;
      const ctx = (error as { context?: Response })?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          if (body?.error) message = body.error;
        } catch {
          // corps non-JSON, on garde le message par défaut
        }
      }
      toast({ title: "Erreur génération devis générique", description: message, variant: "destructive" });
      return;
    }

    setDocuments(prev => ({ ...prev, devis_generique: data.contenu_html }));
    toast({ title: "✅ Devis générique généré", description: "Cliquez sur 'Voir le devis' pour le consulter, l'imprimer ou le personnaliser avant envoi." });
  };

  const voirDevisGenerique = () => {
    if (!documents.devis_generique) return;
    const win = window.open("", "_blank");
    if (win) { win.document.write(documents.devis_generique); win.document.close(); }
  };

  const genererEvaluation = async (type: string) => {
    if (!id) return;
    setEvalGenerating(prev => ({ ...prev, [type]: true }));
    const { data, error } = await supabase.functions.invoke("generer-questions-evaluation", {
      body: { formation_id: id, type },
    });
    setEvalGenerating(prev => ({ ...prev, [type]: false }));

    if (error || data?.error) {
      let message = data?.error || error?.message;
      const ctx = (error as { context?: Response })?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          if (body?.error) message = body.error;
        } catch {
          // corps non-JSON
        }
      }
      toast({ title: "Erreur génération questions", description: message, variant: "destructive" });
      return;
    }

    setEvalQuestions(prev => ({ ...prev, [type]: data.questions || [] }));
    setEvalSaved(prev => ({ ...prev, [type]: false }));
    toast({ title: "✅ Questions générées", description: "Relisez et ajustez si besoin, puis enregistrez." });
  };

  const sauverEvaluation = async (type: string) => {
    if (!id) return;
    setEvalSaving(prev => ({ ...prev, [type]: true }));
    const { error } = await supabase.from("evaluation_questions").upsert({
      formation_id: id,
      type,
      questions: evalQuestions[type] || [],
      genere_par: "manuel",
      updated_at: new Date().toISOString(),
    }, { onConflict: "formation_id,type" });
    setEvalSaving(prev => ({ ...prev, [type]: false }));
    if (error) {
      toast({ title: "Erreur enregistrement", description: error.message, variant: "destructive" });
      return;
    }
    setEvalSaved(prev => ({ ...prev, [type]: true }));
    toast({ title: "✅ Questions enregistrées" });
  };

  const modifierEvalItem = (type: string, index: number, valeur: string) => {
    setEvalQuestions(prev => ({ ...prev, [type]: (prev[type] || []).map((q, i) => i === index ? valeur : q) }));
    setEvalSaved(prev => ({ ...prev, [type]: false }));
  };

  const supprimerEvalItem = (type: string, index: number) => {
    setEvalQuestions(prev => ({ ...prev, [type]: (prev[type] || []).filter((_, i) => i !== index) }));
    setEvalSaved(prev => ({ ...prev, [type]: false }));
  };

  const ajouterEvalItem = (type: string) => {
    setEvalQuestions(prev => ({ ...prev, [type]: [...(prev[type] || []), ""] }));
    setEvalSaved(prev => ({ ...prev, [type]: false }));
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

      const { data: docs } = await supabase
        .from("documents_formation")
        .select("type, url, contenu_html, nom_fichier")
        .eq("formation_id", id);
      if (docs) {
        const docsMap: Record<string, string> = {};
        docs.forEach((d: Record<string, string>) => { docsMap[d.type] = d.url || d.contenu_html || ""; });
        setDocuments(docsMap);
      }

      const { data: comp } = await supabase
        .from("formation_competences")
        .select("competences, objectifs")
        .eq("formation_id", id)
        .maybeSingle();
      if (comp) {
        setCompetences((comp.competences as string[]) || []);
        setObjectifsEval((comp.objectifs as string[]) || []);
        setCompetencesSaved(true);
      }

      const { data: evalRows } = await supabase
        .from("evaluation_questions")
        .select("type, questions")
        .eq("formation_id", id);
      if (evalRows && evalRows.length > 0) {
        const qMap: Record<string, string[]> = {};
        const savedMap: Record<string, boolean> = {};
        (evalRows as { type: string; questions: string[] }[]).forEach((r) => {
          qMap[r.type] = r.questions || [];
          savedMap[r.type] = true;
        });
        setEvalQuestions(prev => ({ ...prev, ...qMap }));
        setEvalSaved(prev => ({ ...prev, ...savedMap }));
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

            <Card>
              <CardContent className="pt-5">
                <h3 className="font-semibold text-gray-700 mb-4">📁 Documents de la formation</h3>

                <div className="space-y-4">
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

                  <div className={`flex items-center justify-between p-3 rounded-lg ${documents.trame_pedagogique ? "bg-blue-50 border border-blue-200" : "bg-gray-50"}`}>
                    <div>
                      <p className="text-sm font-medium text-gray-700">🤖 Trame pédagogique</p>
                      <p className="text-xs text-gray-400">
                        {generatingTrame
                          ? "Claude analyse vos documents et rédige la trame — ça peut prendre 1 à 3 minutes, ne quittez pas la page."
                          : documents.trame_pedagogique
                          ? "Générée par QalioFlex — confidentielle, usage formateur uniquement"
                          : "Générée automatiquement quand support + programme sont uploadés"}
                      </p>
                    </div>
                    <div className="flex gap-2 items-center">
                      {generatingTrame && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                      {!generatingTrame && documents.trame_pedagogique && <Badge className="bg-blue-100 text-blue-700">✓ Générée</Badge>}
                      {documents.support && documents.programme && (
                        <Button size="sm" variant="outline" disabled={generatingTrame}
                          onClick={lancerGenerationTrame}>
                          {generatingTrame ? "Génération en cours..." : documents.trame_pedagogique ? "Regénérer" : "Générer"}
                        </Button>
                      )}
                      {documents.trame_pedagogique && (
                        <Button size="sm" style={{ background: "#25245e", color: "#fff" }} onClick={voirTrame} disabled={generatingTrame}>
                          Voir la trame
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className={`flex items-center justify-between p-3 rounded-lg ${documents.devis_generique ? "bg-blue-50 border border-blue-200" : "bg-gray-50"}`}>
                    <div>
                      <p className="text-sm font-medium text-gray-700">🧾 Devis générique</p>
                      <p className="text-xs text-gray-400">
                        {generatingDevisGenerique
                          ? "Génération en cours..."
                          : documents.devis_generique
                          ? "Généré par QalioFlex — à personnaliser (client, dates) avant envoi"
                          : "Devis de prospection, utilisable avant même d'avoir un client ou une session"}
                      </p>
                    </div>
                    <div className="flex gap-2 items-center">
                      {generatingDevisGenerique && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                      {!generatingDevisGenerique && documents.devis_generique && <Badge className="bg-blue-100 text-blue-700">✓ Généré</Badge>}
                      <Button size="sm" variant="outline" disabled={generatingDevisGenerique}
                        onClick={lancerGenerationDevisGenerique}>
                        {generatingDevisGenerique ? "Génération..." : documents.devis_generique ? "Regénérer" : "Générer"}
                      </Button>
                      {documents.devis_generique && (
                        <Button size="sm" style={{ background: "#25245e", color: "#fff" }} onClick={voirDevisGenerique} disabled={generatingDevisGenerique}>
                          Voir le devis
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-700">🎯 Compétences à évaluer</h3>
                    <p className="text-xs text-gray-400">Utilisées dans le questionnaire de positionnement envoyé aux stagiaires (avant et après la formation).</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    {competencesSaved && competences.length > 0 && <Badge className="bg-green-100 text-green-700">✓ Enregistré</Badge>}
                    <Button size="sm" variant="outline" disabled={generatingCompetences} onClick={genererCompetences}>
                      {generatingCompetences ? "Génération..." : competences.length > 0 ? "Regénérer par Claude" : "Générer par Claude"}
                    </Button>
                  </div>
                </div>

                {competences.length === 0 && objectifsEval.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucune liste générée pour le moment.</p>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">Compétences</p>
                      <div className="space-y-2">
                        {competences.map((c, i) => (
                          <div key={i} className="flex gap-2 items-center">
                            <Input value={c} onChange={e => modifierItem("competences", i, e.target.value)} className="text-sm h-8" />
                            <Button size="sm" variant="outline" className="h-8 px-2 text-red-500 border-red-200 hover:bg-red-50" onClick={() => supprimerItem("competences", i)}>✕</Button>
                          </div>
                        ))}
                      </div>
                      <Button size="sm" variant="outline" className="mt-2 text-xs h-7" onClick={() => ajouterItem("competences")}>+ Ajouter une compétence</Button>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">Objectifs de la formation</p>
                      <div className="space-y-2">
                        {objectifsEval.map((o, i) => (
                          <div key={i} className="flex gap-2 items-center">
                            <Input value={o} onChange={e => modifierItem("objectifs", i, e.target.value)} className="text-sm h-8" />
                            <Button size="sm" variant="outline" className="h-8 px-2 text-red-500 border-red-200 hover:bg-red-50" onClick={() => supprimerItem("objectifs", i)}>✕</Button>
                          </div>
                        ))}
                      </div>
                      <Button size="sm" variant="outline" className="mt-2 text-xs h-7" onClick={() => ajouterItem("objectifs")}>+ Ajouter un objectif</Button>
                    </div>

                    <Button size="sm" disabled={savingCompetences || competencesSaved} style={{ background: competencesSaved ? "#9ca3af" : "#f2901e", color: "#fff" }} className="font-bold" onClick={sauverCompetences}>
                      {savingCompetences ? "Enregistrement..." : competencesSaved ? "✓ Déjà enregistré" : "Enregistrer"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <h3 className="font-semibold text-gray-700 mb-1">📊 Évaluations</h3>
                <p className="text-xs text-gray-400 mb-4">Questionnaires envoyés aux stagiaires : à chaud (fin de formation), du formateur, et à froid (J+90).</p>
                <div className="space-y-6">
                  {EVAL_TYPES.map((et, idx) => (
                    <div key={et.key} className={idx > 0 ? "border-t border-gray-100 pt-5" : ""}>
                      <div className="flex items-center justify-between mb-3 gap-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-700">{et.icon} {et.label}</p>
                          <p className="text-xs text-gray-400">{et.desc}</p>
                        </div>
                        <div className="flex gap-2 items-center shrink-0">
                          {evalSaved[et.key] && (evalQuestions[et.key]?.length || 0) > 0 && <Badge className="bg-green-100 text-green-700">✓ Enregistré</Badge>}
                          <Button size="sm" variant="outline" disabled={evalGenerating[et.key]} onClick={() => genererEvaluation(et.key)}>
                            {evalGenerating[et.key] ? "Génération..." : (evalQuestions[et.key]?.length || 0) > 0 ? "Regénérer par Claude" : "Générer par Claude"}
                          </Button>
                        </div>
                      </div>

                      {(evalQuestions[et.key]?.length || 0) === 0 ? (
                        <p className="text-sm text-gray-400">Aucune question générée pour le moment.</p>
                      ) : (
                        <div>
                          <div className="space-y-2">
                            {evalQuestions[et.key].map((q, i) => (
                              <div key={i} className="flex gap-2 items-center">
                                <Input value={q} onChange={e => modifierEvalItem(et.key, i, e.target.value)} className="text-sm h-8" />
                                <Button size="sm" variant="outline" className="h-8 px-2 text-red-500 border-red-200 hover:bg-red-50" onClick={() => supprimerEvalItem(et.key, i)}>✕</Button>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2 items-center mt-2">
                            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => ajouterEvalItem(et.key)}>+ Ajouter une question</Button>
                            <Button size="sm" disabled={evalSaving[et.key] || evalSaved[et.key]} style={{ background: evalSaved[et.key] ? "#9ca3af" : "#f2901e", color: "#fff" }} className="font-bold h-7 text-xs" onClick={() => sauverEvaluation(et.key)}>
                              {evalSaving[et.key] ? "Enregistrement..." : evalSaved[et.key] ? "✓ Déjà enregistré" : "Enregistrer"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
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
