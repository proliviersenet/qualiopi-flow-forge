
import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles, FileText, X } from "lucide-react";
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
import HelpPopup from "@/components/HelpPopup";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Même bucket privé que FormationDetail.tsx pour le support pédagogique —
// voir migration 20260731090500_bucket_prive_support_pedagogique.sql.
const SUPPORT_BUCKET = "documents-qualiopi-support";

// Libellés humains des champs extraits, utilisés pour le bandeau "à vérifier"
// après une analyse automatique de document.
const LIBELLES_CHAMPS: Record<string, string> = {
  titre: "Titre",
  objectifs: "Objectifs pédagogiques",
  programme: "Programme",
  duree: "Durée",
  modalites: "Public visé / modalités",
  prerequis: "Prérequis",
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // On ne garde que la partie base64, sans le préfixe data:...;base64,
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const FormationCreation = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [organismeId, setOrganismeId] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const [formData, setFormData] = useState({
    titre: "",
    programme: "",
    objectifs: "",
    duree: "",
    tarif: "",
    montant_ht: "",
    modalites: "",
    prerequis: "",
    document_mode: "auto",
  });

  // Prototype "création par upload de document" (piste remontée par Baptiste
  // Leber, CR beta test du 22/09) : le formateur dépose le programme (et
  // optionnellement le support) en PDF, on pré-remplit le formulaire
  // ci-dessus à partir de l'analyse du document — mais rien n'est jamais
  // enregistré sans passage et validation du formateur sur ce même
  // formulaire. Le tarif n'est JAMAIS pré-rempli automatiquement (règle
  // actée avec Olivier) : au mieux on affiche un indice à titre informatif.
  const programmeFileRef = useRef<HTMLInputElement>(null);
  const supportFileRef = useRef<HTMLInputElement>(null);
  const [programmeFile, setProgrammeFile] = useState<File | null>(null);
  const [supportFile, setSupportFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyseFaite, setAnalyseFaite] = useState(false);
  const [champsNonTrouves, setChampsNonTrouves] = useState<string[]>([]);
  const [tarifDetecte, setTarifDetecte] = useState<number | null>(null);

  // Auth + récupération de l'organisme rattaché au profil, comme sur Formations.tsx
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

      const { data: profile } = await supabase
        .from("profiles")
        .select("organisme_id")
        .eq("id", authSession.user.id)
        .single();

      if (profile?.organisme_id) {
        setOrganismeId(profile.organisme_id);
      } else {
        // Avant : toast + page vide, cul-de-sac pour un compte dont
        // l'inscription (SIRET) n'a jamais été finalisée (ex. arrivé via
        // Google puis parti naviguer ailleurs sans compléter — cf. retour
        // beta test Jean-Pascal Mollet, 12/09). On renvoie systématiquement
        // vers /register, qui détecte la session déjà active et n'affiche
        // que l'étape SIRET manquante.
        toast({
          title: "Complétez d'abord votre inscription",
          description: "Votre espace formateur n'est pas encore finalisé — renseignez votre SIRET pour continuer.",
        });
        navigate("/register");
        return;
      }
      setCheckingSession(false);
    };
    init();
  }, [navigate, toast, authSession, authLoading]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string) => (value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAnalyserDocuments = async () => {
    if (!programmeFile && !supportFile) return;

    const extLower = (f: File) => f.name.split(".").pop()?.toLowerCase() || "";
    for (const f of [programmeFile, supportFile]) {
      if (f && extLower(f) !== "pdf") {
        toast({
          title: "Format non accepté",
          description: "Les documents doivent être au format PDF pour être analysés.",
          variant: "destructive",
        });
        return;
      }
    }

    setAnalyzing(true);
    try {
      const documents: { type: "programme" | "support"; base64: string }[] = [];
      if (programmeFile) documents.push({ type: "programme", base64: await fileToBase64(programmeFile) });
      if (supportFile) documents.push({ type: "support", base64: await fileToBase64(supportFile) });

      const { data, error } = await supabase.functions.invoke("analyser-documents-formation", {
        body: { documents },
      });

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
        toast({ title: "Erreur d'analyse", description: message, variant: "destructive" });
        return;
      }

      const champs = data.champs as { titre: string; objectifs: string; programme: string; duree: string; public_vise: string; prerequis: string };

      setFormData((prev) => ({
        ...prev,
        titre: champs.titre || prev.titre,
        objectifs: champs.objectifs || prev.objectifs,
        programme: champs.programme || prev.programme,
        duree: champs.duree || prev.duree,
        prerequis: champs.prerequis || prev.prerequis,
        modalites: champs.public_vise
          ? (prev.modalites ? `${prev.modalites}\n\nPublic visé : ${champs.public_vise}` : `Public visé : ${champs.public_vise}`)
          : prev.modalites,
      }));

      // "modalites" est dérivé de public_vise, pas d'un champ direct du même nom
      // renvoyé par la fonction : on l'exclut de la liste "non trouvés" à part.
      const nonTrouves = (data.champs_non_trouves as string[]).filter((c) => c !== "public_vise");
      if (!champs.public_vise) nonTrouves.push("modalites");
      setChampsNonTrouves(nonTrouves);
      setTarifDetecte(typeof data.tarif_detecte === "number" ? data.tarif_detecte : null);
      setAnalyseFaite(true);

      toast({
        title: "✅ Document(s) analysé(s)",
        description: "Le formulaire a été pré-rempli — relisez chaque champ avant de valider.",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const nextStep = () => {
    if (currentStep === 1) {
      if (!formData.titre) {
        toast({
          title: "Champ requis",
          description: "Le titre de la formation est obligatoire.",
          variant: "destructive",
        });
        return;
      }
    }
    setCurrentStep((s) => s + 1);
  };

  const prevStep = () => setCurrentStep((s) => s - 1);

  const handleSubmit = async (e: React.SyntheticEvent, statut: "draft" | "publie") => {
    e.preventDefault();

    if (!formData.titre) {
      toast({
        title: "Erreur",
        description: "Le titre de la formation est obligatoire.",
        variant: "destructive",
      });
      return;
    }

    if (!organismeId) {
      toast({
        title: "Erreur",
        description: "Aucun organisme rattaché à votre compte.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const { data: nouvelleFormation, error } = await supabase.from("formations").insert({
      organisme_id: organismeId,
      titre: formData.titre,
      objectifs: formData.objectifs || null,
      programme: formData.programme || null,
      modalites: formData.modalites || null,
      prerequis: formData.prerequis || null,
      duree: formData.duree || null,
      tarif: formData.tarif || null,
      montant_ht: formData.montant_ht ? parseFloat(formData.montant_ht) : null,
      document_mode: formData.document_mode,
      statut,
    }).select("id").single();

    if (error || !nouvelleFormation) {
      setIsLoading(false);
      toast({
        title: "Erreur",
        description: error?.message,
        variant: "destructive",
      });
      return;
    }

    // Si un ou des PDF ont servi à pré-remplir le formulaire (prototype
    // Baptiste), on les rattache maintenant à la formation qui vient d'être
    // créée — même convention de chemin/bucket que l'upload manuel dans
    // FormationDetail.tsx (formations/{id}/{type}/{type}-{timestamp}.pdf),
    // pour que "Voir le support/programme" fonctionne à l'identique ensuite.
    const documentsAUploader: { file: File; type: "support" | "programme" }[] = [];
    if (programmeFile) documentsAUploader.push({ file: programmeFile, type: "programme" });
    if (supportFile) documentsAUploader.push({ file: supportFile, type: "support" });

    for (const { file, type } of documentsAUploader) {
      const path = `formations/${nouvelleFormation.id}/${type}/${type}-${Date.now()}.pdf`;
      const bucket = type === "support" ? SUPPORT_BUCKET : "documents-qualiopi";
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: "application/pdf", cacheControl: "3600" });

      if (upErr) {
        // Non bloquant : la formation est déjà créée, le formateur pourra
        // ré-uploader le document manuellement depuis sa fiche.
        toast({ title: "Formation créée, mais l'archivage d'un document a échoué", description: upErr.message, variant: "destructive" });
        continue;
      }

      const url = type === "support" ? path : (supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl || "");
      await supabase.from("documents_formation").insert({
        formation_id: nouvelleFormation.id,
        type,
        nom_fichier: file.name,
        url,
        genere_par: "manuel",
        updated_at: new Date().toISOString(),
      });
    }

    setIsLoading(false);

    toast({
      title: "Formation créée",
      description: statut === "publie" ? "Votre formation a été publiée avec succès !" : "Votre formation a été enregistrée en brouillon.",
    });

    navigate("/formations");
  };

  if (checkingSession) {
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
      <HelpPopup
        hintKey="formation_creation_intro"
        title="Crée ta formation étape par étape"
        items={[
          "Renseigne les informations générales, puis les détails pédagogiques (objectifs, prérequis, modalités) sur les étapes suivantes.",
          "Tu peux enregistrer en brouillon à tout moment pour reprendre plus tard, ou publier directement une fois complète.",
          "Une fois publiée, tu pourras y rattacher des sessions et affecter des stagiaires.",
        ]}
      />

      <main className="flex-grow bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center mb-6">
            <Link to="/formations" className="text-exsenco-blue hover:text-blue-800 mr-2">
              &larr; Retour aux formations
            </Link>
          </div>

          <h1 className="text-3xl font-bold mb-6">Créer une nouvelle formation</h1>

          <div className="mb-8">
            <div className="flex justify-between items-center max-w-3xl mx-auto mb-4">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`flex flex-col items-center ${step < currentStep ? "text-exsenco-blue" : step === currentStep ? "text-blue-800" : "text-gray-400"}`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 
                      ${step < currentStep
                        ? "bg-exsenco-blue text-white"
                        : step === currentStep
                        ? "bg-exsenco-orange-light text-blue-800 border-2 border-exsenco-blue"
                        : "bg-gray-100 text-gray-400"}`}
                  >
                    {step < currentStep ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      step
                    )}
                  </div>
                  <span className="text-sm">
                    {step === 1 ? "Informations" : step === 2 ? "Détails" : "Confirmation"}
                  </span>
                </div>
              ))}
            </div>

            <div className="h-2 bg-gray-200 rounded-full max-w-3xl mx-auto">
              <div
                className="h-full bg-exsenco-blue rounded-full transition-all"
                style={{ width: `${(currentStep - 1) * 50}%` }}
              ></div>
            </div>
          </div>

          <Card className="max-w-3xl mx-auto">
            <CardContent className="pt-6">
              <form onSubmit={(e) => handleSubmit(e, "publie")}>
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold mb-4">Informations générales</h2>

                    <div className="rounded-md border border-dashed border-exsenco-blue/40 bg-blue-50/40 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-exsenco-blue font-medium">
                        <Sparkles className="h-4 w-4" />
                        Créer à partir d'un document (optionnel)
                      </div>
                      <p className="text-sm text-gray-600">
                        Déposez votre programme (et votre support si vous l'avez déjà) au format PDF : les champs ci-dessous seront pré-remplis automatiquement. Rien n'est enregistré sans que vous ayez relu et validé.
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <input
                            ref={programmeFileRef}
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => setProgrammeFile(e.target.files?.[0] || null)}
                          />
                          <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => programmeFileRef.current?.click()}>
                            <FileText className="h-4 w-4 mr-2" />
                            {programmeFile ? programmeFile.name : "Programme (PDF)"}
                          </Button>
                          {programmeFile && (
                            <button type="button" className="text-xs text-gray-400 hover:text-red-500 mt-1" onClick={() => setProgrammeFile(null)}>
                              <X className="h-3 w-3 inline" /> retirer
                            </button>
                          )}
                        </div>
                        <div>
                          <input
                            ref={supportFileRef}
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => setSupportFile(e.target.files?.[0] || null)}
                          />
                          <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => supportFileRef.current?.click()}>
                            <FileText className="h-4 w-4 mr-2" />
                            {supportFile ? supportFile.name : "Support (PDF, optionnel)"}
                          </Button>
                          {supportFile && (
                            <button type="button" className="text-xs text-gray-400 hover:text-red-500 mt-1" onClick={() => setSupportFile(null)}>
                              <X className="h-3 w-3 inline" /> retirer
                            </button>
                          )}
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        disabled={(!programmeFile && !supportFile) || analyzing}
                        onClick={handleAnalyserDocuments}
                      >
                        {analyzing ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyse en cours...</>
                        ) : (
                          <><Sparkles className="h-4 w-4 mr-2" /> Analyser le(s) document(s)</>
                        )}
                      </Button>

                      {analyseFaite && (
                        <div className="text-sm bg-white border border-amber-300 rounded-md p-3 mt-2">
                          <p className="font-medium text-amber-700">Relisez les champs pré-remplis avant de continuer.</p>
                          {champsNonTrouves.length > 0 && (
                            <p className="text-gray-600 mt-1">
                              Non trouvés dans le document, à compléter vous-même : {champsNonTrouves.map((c) => LIBELLES_CHAMPS[c] || c).join(", ")}.
                            </p>
                          )}
                          <p className="text-gray-600 mt-1">
                            Le tarif n'est jamais rempli automatiquement — vous le saisirez vous-même à l'étape suivante{tarifDetecte !== null ? ` (un montant de ${tarifDetecte} € a été repéré dans le document, à vérifier)` : ""}.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="titre">Titre de la formation <span className="text-red-500">*</span></Label>
                      <Input
                        id="titre"
                        name="titre"
                        value={formData.titre}
                        onChange={handleChange}
                        placeholder="ex: Formation Excel Avancé"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="programme">Programme</Label>
                      <Textarea
                        id="programme"
                        name="programme"
                        value={formData.programme}
                        onChange={handleChange}
                        placeholder="Décrivez le déroulé et le contenu de votre formation..."
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
                        placeholder="Listez les objectifs pédagogiques..."
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold mb-4">Détails de la formation</h2>

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
                        {tarifDetecte !== null && (
                          <p className="text-xs text-amber-600">
                            💡 {tarifDetecte} € repéré dans le document analysé — à vérifier, jamais rempli automatiquement.
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="montant_ht">Montant HT (optionnel, pour le suivi CA)</Label>
                        <Input
                          id="montant_ht"
                          name="montant_ht"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.montant_ht}
                          onChange={handleChange}
                          placeholder="ex: 1500"
                        />
                        <p className="text-xs text-gray-400">Montant chiffré distinct du champ "Tarif" ci-dessus — sert uniquement au calcul du chiffre d'affaires, jamais affiché au client.</p>
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
                      <Label htmlFor="document_mode">Mode de gestion documentaire</Label>
                      <Select value={formData.document_mode} onValueChange={handleSelectChange("document_mode")}>
                        <SelectTrigger id="document_mode">
                          <SelectValue placeholder="Choisir un mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Automatique (génération + signature électronique)</SelectItem>
                          <SelectItem value="import">Import manuel (documents papier ou externes)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold mb-4">Confirmation</h2>

                    <div className="bg-gray-50 p-4 rounded-md space-y-4">
                      <div>
                        <h3 className="font-medium text-gray-700">Titre</h3>
                        <p>{formData.titre}</p>
                      </div>

                      {formData.programme && (
                        <div>
                          <h3 className="font-medium text-gray-700">Programme</h3>
                          <p className="text-sm">{formData.programme}</p>
                        </div>
                      )}

                      {formData.objectifs && (
                        <div>
                          <h3 className="font-medium text-gray-700">Objectifs</h3>
                          <p className="text-sm">{formData.objectifs}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        {formData.duree && (
                          <div>
                            <h3 className="font-medium text-gray-700">Durée</h3>
                            <p>{formData.duree}</p>
                          </div>
                        )}
                        {formData.tarif && (
                          <div>
                            <h3 className="font-medium text-gray-700">Tarif</h3>
                            <p>{formData.tarif}</p>
                          </div>
                        )}
                      </div>

                      {formData.modalites && (
                        <div>
                          <h3 className="font-medium text-gray-700">Modalités</h3>
                          <p className="text-sm">{formData.modalites}</p>
                        </div>
                      )}

                      {formData.prerequis && (
                        <div>
                          <h3 className="font-medium text-gray-700">Prérequis</h3>
                          <p className="text-sm">{formData.prerequis}</p>
                        </div>
                      )}

                      <div>
                        <h3 className="font-medium text-gray-700">Mode de gestion documentaire</h3>
                        <p className="text-sm">{formData.document_mode === "auto" ? "Automatique (génération + signature électronique)" : "Import manuel (documents papier ou externes)"}</p>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <p className="text-sm text-gray-600">
                        Vous pouvez enregistrer cette formation en brouillon pour la finaliser plus tard, ou la publier directement.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-between mt-8">
                  {currentStep > 1 && (
                    <Button type="button" variant="outline" onClick={prevStep}>
                      Retour
                    </Button>
                  )}

                  {currentStep < 3 ? (
                    <Button type="button" onClick={nextStep} className="ml-auto">
                      Continuer
                    </Button>
                  ) : (
                    <div className="ml-auto flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isLoading}
                        onClick={(e) => handleSubmit(e, "draft")}
                      >
                        {isLoading ? "Enregistrement..." : "Enregistrer en brouillon"}
                      </Button>
                      <Button type="submit" disabled={isLoading} className="btn-cta font-bold">
                        {isLoading ? "Publication..." : "Publier la formation"}
                      </Button>
                    </div>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FormationCreation;
