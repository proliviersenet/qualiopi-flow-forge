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
    toast({ title: "✅ Liste enregistrée" });
  };

  const modifierItem = (liste: "competences" | "objectifs", index: number, valeur: string) => {
    if (liste === "competences") setCompetences(prev => prev.map((c, i) => i === index ? valeur : c));
    else setObjectifsEval(prev => prev.map((o, i) => i === index ? valeur : o));
  };

  const supprimerItem = (liste: "competences" | "objectifs", index: number) => {
    if (liste === "competences") setCompetences(prev => prev.filter((_, i) => i !== index));
    else setObjectifsEval(prev => prev.filter((_, i) => i !== index));
  };

  const ajouterItem = (liste: "competences" | "objectifs") => {
    if (liste === "competences") setCompetences(prev => [...prev, ""]);
    else setObjectifsEval(prev => [...prev, ""]);
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
