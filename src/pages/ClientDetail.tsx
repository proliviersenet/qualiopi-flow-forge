import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HelpPopup from "@/components/HelpPopup";
import StagiairesList from "@/components/StagiairesList";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Client {
  id: string;
  raison_sociale: string;
  siret: string;
  siren: string;
  adresse: string;
  contact_nom: string;
  contact_email: string;
}

interface Formation {
  id: string;
  titre: string;
  duree: string;
  statut: string;
}

interface Session {
  id: string;
  formation_id: string;
  date_debut: string | null;
  date_fin: string | null;
  lieu: string | null;
  lien_visio: string | null;
  statut: string;
  formation?: { titre: string; duree: string; document_mode?: string };
}

const statutColor = (s: string) => {
  const m: Record<string, string> = {
    planifiee: "bg-blue-100 text-blue-700",
    en_cours: "bg-orange-100 text-orange-700",
    terminee: "bg-green-100 text-green-700",
    annulee: "bg-red-100 text-red-700",
  };
  return m[s] || "bg-gray-100 text-gray-600";
};

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [organismeId, setOrganismeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Documents "session" générés automatiquement (livret, émargement, devis) — tous
  // sur le même modèle : HTML stocké dans documents_formation, consultable/imprimable
  // en un clic. docsSession[sessionId][type] = contenu_html.
  const [docsSession, setDocsSession] = useState<Record<string, Record<string, string>>>({});
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null); // clé = `${sessionId}:${type}`
  // Point non bloquant #62 : quand la formation est en mode "import" (choix fait
  // par le formateur à la création — cf. FormationCreation.tsx, document_mode),
  // le devis et la convention ne sont pas générés par QalioFlex mais importés
  // tels quels (documents déjà existants côté formateur). docsSessionFichiers
  // stocke l'URL du fichier importé, en parallèle de docsSession (HTML généré).
  const [docsSessionFichiers, setDocsSessionFichiers] = useState<Record<string, Record<string, string>>>({});
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null); // clé = `${sessionId}:${type}`
  // Chantier 5 : la convention ne peut être générée qu'une fois que le client a
  // transmis la liste des stagiaires (elle se préremplit avec leurs noms) — même
  // logique que côté EspaceClient.tsx pour débloquer l'import de stagiaires.
  // conventionSignatures reflète le statut DocuSign (signatures.statut) du
  // document de type "convention" de chaque session, une fois envoyé pour signature.
  const [uploadedSessions, setUploadedSessions] = useState<Set<string>>(new Set());
  const [conventionSignatures, setConventionSignatures] = useState<Record<string, string>>({});
  const [sendingSignature, setSendingSignature] = useState<string | null>(null);

  const DOCS_SESSION_CONFIG = [
    { type: "livret", label: "📘 Livret d'accueil", fn: "generer-livret" },
    { type: "emargement", label: "✍️ Feuille d'émargement", fn: "generer-emargement" },
    { type: "devis", label: "🧾 Devis", fn: "generer-devis" },
  ] as const;

  // Dialog affecter formation
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFormation, setSelectedFormation] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [lieu, setLieu] = useState("");
  const [lienVisio, setLienVisio] = useState("");

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const fetchSessions = async (clientId: string) => {
    const { data } = await supabase
      .from("sessions")
      .select("*, formation:formation_id(titre, duree, document_mode)")
      .eq("client_id", clientId)
      .order("date_debut", { ascending: false });
    const sessionsData = (data as Session[]) || [];
    setSessions(sessionsData);

    // Charger les documents "session" déjà générés (livret, émargement, devis, convention)
    if (sessionsData.length > 0) {
      const sessionIds = sessionsData.map(s => s.id);
      const { data: docsData } = await supabase
        .from("documents_formation")
        .select("id, session_id, type, contenu_html, fichier_url")
        .in("session_id", sessionIds)
        .in("type", [...DOCS_SESSION_CONFIG.map(c => c.type), "convention"]);
      if (docsData) {
        const map: Record<string, Record<string, string>> = {};
        const mapFichiers: Record<string, Record<string, string>> = {};
        const rows = docsData as { id: string; session_id: string; type: string; contenu_html: string | null; fichier_url: string | null }[];
        rows.forEach(d => {
          if (d.contenu_html) {
            if (!map[d.session_id]) map[d.session_id] = {};
            map[d.session_id][d.type] = d.contenu_html;
          }
          if (d.fichier_url) {
            if (!mapFichiers[d.session_id]) mapFichiers[d.session_id] = {};
            mapFichiers[d.session_id][d.type] = d.fichier_url;
          }
        });
        setDocsSession(map);
        setDocsSessionFichiers(mapFichiers);

        // Chantier 5 : statut de signature DocuSign de la/des convention(s) déjà générée(s).
        const conventionDocs = rows.filter(d => d.type === "convention");
        if (conventionDocs.length > 0) {
          const { data: sigs } = await supabase
            .from("signatures")
            .select("document_id, statut")
            .in("document_id", conventionDocs.map(d => d.id));
          if (sigs) {
            const sigMap: Record<string, string> = {};
            (sigs as { document_id: string; statut: string }[]).forEach(s => {
              const doc = conventionDocs.find(d => d.id === s.document_id);
              if (doc) sigMap[doc.session_id] = s.statut;
            });
            setConventionSignatures(sigMap);
          }
        }
      }

      // Sessions pour lesquelles le client a déjà transmis au moins un stagiaire —
      // condition qui débloque la génération de la convention.
      const { data: stagData } = await supabase
        .from("stagiaires")
        .select("session_id")
        .in("session_id", sessionIds);
      if (stagData) {
        setUploadedSessions(new Set((stagData as { session_id: string }[]).map(s => s.session_id)));
      }
    }
  };

  const genererDocumentSession = async (sessionId: string, type: string, fn: string) => {
    const cle = `${sessionId}:${type}`;
    setGeneratingDoc(cle);
    const { data, error } = await supabase.functions.invoke(fn, {
      body: { session_id: sessionId },
    });
    setGeneratingDoc(null);

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
      toast({ title: "Erreur génération", description: message, variant: "destructive" });
      return;
    }

    setDocsSession(prev => ({ ...prev, [sessionId]: { ...(prev[sessionId] || {}), [type]: data.contenu_html } }));
    toast({ title: "✅ Document généré" });
  };

  const voirDocumentSession = (sessionId: string, type: string) => {
    const fichierUrl = docsSessionFichiers[sessionId]?.[type];
    if (fichierUrl) { window.open(fichierUrl, "_blank"); return; }
    const html = docsSession[sessionId]?.[type];
    if (!html) return;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  // Point non bloquant #62 : import manuel d'un devis/convention déjà existant
  // côté formateur (formation en document_mode "import"), à la place de la
  // génération automatique. Même bucket que le logo (Profile.tsx), un dossier
  // dédié par session pour ne pas mélanger avec les logos d'organisme.
  const uploaderDocumentSession = async (sessionId: string, formationId: string, type: string, file: File) => {
    const cle = `${sessionId}:${type}`;
    setUploadingDoc(cle);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `documents-importes/${organismeId}/${sessionId}/${type}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("documents-qualiopi")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw new Error(upErr.message);

      const { data: urlData } = supabase.storage.from("documents-qualiopi").getPublicUrl(path);
      const fichierUrl = urlData?.publicUrl || "";

      const { data: existing } = await supabase
        .from("documents_formation")
        .select("id")
        .eq("session_id", sessionId)
        .eq("type", type)
        .maybeSingle();

      const payload = {
        formation_id: formationId,
        session_id: sessionId,
        type,
        nom_fichier: file.name,
        genere_par: "import",
        fichier_url: fichierUrl,
        contenu_html: null,
        updated_at: new Date().toISOString(),
      };

      const { error: saveErr } = existing
        ? await supabase.from("documents_formation").update(payload).eq("id", existing.id)
        : await supabase.from("documents_formation").insert(payload);
      if (saveErr) throw new Error(saveErr.message);

      setDocsSessionFichiers(prev => ({ ...prev, [sessionId]: { ...(prev[sessionId] || {}), [type]: fichierUrl } }));
      toast({ title: "✅ Document importé", description: "Visible par le client, comme un document généré." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast({ title: "Erreur import", description: msg, variant: "destructive" });
    } finally {
      setUploadingDoc(null);
    }
  };

  // Chantier 5 : charge html2pdf.js à la volée depuis un CDN (aucune génération de
  // PDF n'existait dans l'app) — évite d'ajouter une dépendance npm juste pour ce
  // point d'entrée ponctuel.
  const chargerHtml2pdf = () =>
    new Promise<void>((resolve, reject) => {
      if ((window as unknown as { html2pdf?: unknown }).html2pdf) { resolve(); return; }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Impossible de charger l'outil de génération PDF."));
      document.head.appendChild(script);
    });

  // Chantier 5 : convertit la convention (HTML) en PDF côté client, puis l'envoie
  // à DocuSign pour signature par le formateur ET le client (docusign-integration,
  // jusqu'ici jamais déclenché depuis l'interface). On régénère la convention juste
  // avant l'envoi pour garantir un PDF à jour et récupérer les emails de contact.
  const envoyerConventionSignature = async (sessionId: string, formationTitre: string) => {
    setSendingSignature(sessionId);
    try {
      const { data: gen, error: genErr } = await supabase.functions.invoke("generer-convention", {
        body: { session_id: sessionId },
      });
      if (genErr || gen?.error) throw new Error(gen?.error || genErr?.message || "Erreur génération convention");

      setDocsSession(prev => ({ ...prev, [sessionId]: { ...(prev[sessionId] || {}), convention: gen.contenu_html } }));

      await chargerHtml2pdf();

      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "800px";
      container.innerHTML = gen.contenu_html;
      document.body.appendChild(container);

      type Html2PdfWorker = { outputPdf: (type: string) => Promise<Blob> };
      type Html2Pdf = () => { set: (opts: Record<string, unknown>) => { from: (el: HTMLElement) => Html2PdfWorker } };
      const html2pdf = (window as unknown as { html2pdf: Html2Pdf }).html2pdf;

      let pdfBlob: Blob;
      try {
        pdfBlob = await html2pdf().set({
          margin: 10,
          filename: "convention.pdf",
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        }).from(container).outputPdf("blob");
      } finally {
        document.body.removeChild(container);
      }

      const pdfBase64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1] || "");
        reader.onerror = () => reject(new Error("Erreur de lecture du PDF généré."));
        reader.readAsDataURL(pdfBlob);
      });

      const { data: sigData, error: sigErr } = await supabase.functions.invoke("docusign-integration", {
        body: {
          document_id: gen.document_id,
          pdf_base64: pdfBase64,
          nom_document: `Convention de formation - ${formationTitre}`,
          signataires: [
            { email: gen.formateur.email, nom: gen.formateur.nom, ordre: 1, ancre: "/signature_formateur/" },
            { email: gen.client.email, nom: gen.client.nom, ordre: 2, ancre: "/signature_client/" },
          ],
        },
      });
      if (sigErr || sigData?.error) throw new Error(sigData?.error || sigErr?.message || "Erreur envoi DocuSign");

      setConventionSignatures(prev => ({ ...prev, [sessionId]: "en_attente" }));
      toast({ title: "✅ Convention envoyée pour signature", description: "Le formateur et le client vont recevoir un email DocuSign." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast({ title: "Erreur envoi signature", description: msg, variant: "destructive" });
    } finally {
      setSendingSignature(null);
    }
  };

  const conventionStatutLabel = (statut: string | undefined) => {
    if (!statut) return null;
    const m: Record<string, string> = {
      en_attente: "📤 Envoyée — en attente de signature",
      signe: "✅ Signée par les deux parties",
      refuse: "❌ Signature refusée",
      expire: "⌛ Signature expirée",
    };
    return m[statut] || statut;
  };

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }

    const init = async () => {
      try {
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

        if (!profile?.organisme_id) { navigate("/clients"); return; }
        setOrganismeId(profile.organisme_id);

        // Charger le client
        const { data: clientData, error } = await supabase
          .from("clients")
          .select("*")
          .eq("id", id)
          .eq("organisme_id", profile.organisme_id)
          .single();

        if (error || !clientData) {
          toast({ title: "Client introuvable", variant: "destructive" });
          navigate("/clients");
          return;
        }
        setClient(clientData as Client);

        // Charger les formations publiées du formateur
        const { data: formationsData } = await supabase
          .from("formations")
          .select("id, titre, duree, statut")
          .eq("organisme_id", profile.organisme_id)
          .eq("statut", "publie")
          .order("titre");
        setFormations((formationsData as Formation[]) || []);

        // Charger les sessions existantes
        await fetchSessions(id!);

      } catch (err) {
        console.error("Erreur ClientDetail:", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, navigate, toast, authSession, authLoading]);

  const handleAffecterFormation = async () => {
    if (!selectedFormation) {
      toast({ title: "Sélectionnez une formation", variant: "destructive" }); return;
    }
    if (!dateDebut) {
      toast({ title: "La date de début est obligatoire", variant: "destructive" }); return;
    }

    setSaving(true);
    const { data: newSession, error } = await supabase
      .from("sessions")
      .insert({
        formation_id: selectedFormation,
        client_id: id,
        date_debut: dateDebut || null,
        date_fin: dateFin || null,
        lieu: lieu || null,
        lien_visio: lienVisio || null,
        statut: "planifiee",
      })
      .select("id")
      .single();

    setSaving(false);

    if (error || !newSession) {
      toast({ title: "Erreur", description: error?.message, variant: "destructive" }); return;
    }

    toast({ title: "✅ Formation affectée", description: "La session a été créée. Le client peut maintenant importer ses stagiaires." });
    setDialogOpen(false);
    setSelectedFormation(""); setDateDebut(""); setDateFin(""); setLieu(""); setLienVisio("");
    await fetchSessions(id!);

    // Correctif bug audit du 31/07 : prévenir le client par email qu'une session
    // vient de lui être affectée — jusqu'ici il devait tomber par hasard sur
    // /espace-client pour le découvrir. On ne bloque pas l'écran (la session est
    // déjà créée avec succès), mais on avertit le formateur si l'envoi échoue
    // (ex : email de contact manquant) car sinon le client ne serait jamais notifié.
    const { data: notifData, error: notifError } = await supabase.functions.invoke("notifier-affectation-session", {
      body: { session_id: newSession.id },
    });
    if (notifError || notifData?.error) {
      console.error("Erreur notification email affectation session:", notifError || notifData?.error);
      toast({
        title: "⚠️ Session créée, mais email non envoyé",
        description: "Le client n'a pas été notifié automatiquement. Vérifiez son adresse email de contact.",
        variant: "destructive",
      });
    }
  };

  const supprimerSession = async (sessionId: string) => {
    if (!confirm("Supprimer cette session ? Cette action est irréversible.")) return;
    const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Session supprimée" });
    await fetchSessions(id!);
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

  if (!client) return null;

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <HelpPopup
        hintKey="client_detail_intro"
        title="Gère ce client au même endroit"
        items={[
          "Retrouve ici les infos du client, ses sessions de formation et la liste de ses stagiaires.",
          "Importe la liste des stagiaires (Excel) pour déclencher automatiquement l'envoi du livret d'accueil et du questionnaire de positionnement.",
          "Suis en un coup d'œil l'avancement des documents (émargements, questionnaires, évaluations) pour chaque stagiaire.",
        ]}
      />

      <main className="flex-grow bg-gray-50 py-8">
        <div className="container mx-auto px-4 max-w-4xl">

          <div className="flex items-center mb-6">
            <Link to="/clients" className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour aux clients</Link>
          </div>

          {/* Fiche client */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0" style={{ background: "#25245e" }}>
                  {(client.raison_sociale || "?")[0].toUpperCase()}
                </div>
                <div>
                  <CardTitle className="text-2xl" style={{ color: "#25245e" }}>{client.raison_sociale}</CardTitle>
                  {client.siret && <p className="text-sm text-gray-400">SIRET : {client.siret}</p>}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {client.adresse && <div><p className="text-xs text-gray-400 mb-1">📍 Adresse</p><p>{client.adresse}</p></div>}
                {client.contact_nom && <div><p className="text-xs text-gray-400 mb-1">👤 Contact</p><p>{client.contact_nom}</p></div>}
                {client.contact_email && <div><p className="text-xs text-gray-400 mb-1">✉️ Email</p><a href={`mailto:${client.contact_email}`} className="text-exsenco-blue hover:underline">{client.contact_email}</a></div>}
              </div>
            </CardContent>
          </Card>

          {/* Sessions de formation */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold" style={{ color: "#25245e" }}>Sessions de formation</h2>
            <Button
              onClick={() => setDialogOpen(true)}
              style={{ background: "#f2901e", color: "#fff" }}
              className="font-bold"
              disabled={formations.length === 0}
            >
              + Affecter une formation
            </Button>
          </div>

          {formations.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-sm text-amber-700">
              ⚠️ Vous n'avez aucune formation publiée. <Link to="/formations/creation" className="underline">Créez et publiez une formation</Link> pour pouvoir l'affecter à ce client.
            </div>
          )}

          {sessions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-400">
                <p className="text-3xl mb-3">📅</p>
                <p>Aucune session affectée pour ce client.</p>
                <p className="text-sm mt-1">Cliquez sur "Affecter une formation" pour créer une session.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sessions.map(session => (
                <Card key={session.id}>
                  <CardContent className="pt-4">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 w-full">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900">
                            {(session.formation as Record<string, string>)?.titre || "Formation"}
                          </h3>
                          <Badge className={statutColor(session.statut)}>
                            {session.statut === "planifiee" ? "Planifiée" : session.statut === "en_cours" ? "En cours" : session.statut === "terminee" ? "Terminée" : "Annulée"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                          {session.date_debut && <span>📅 Début : {new Date(session.date_debut).toLocaleDateString("fr-FR")}</span>}
                          {session.date_fin && <span>📅 Fin : {new Date(session.date_fin).toLocaleDateString("fr-FR")}</span>}
                          {session.lieu && <span>📍 {session.lieu}</span>}
                          {session.lien_visio && <a href={session.lien_visio} target="_blank" rel="noopener noreferrer" className="text-exsenco-blue hover:underline">🖥 Lien visio</a>}
                        </div>
                        <div className="mt-4 mb-3 space-y-2">
                          {DOCS_SESSION_CONFIG.map(({ type, label, fn }) => {
                            const cle = `${session.id}:${type}`;
                            const enCours = generatingDoc === cle;
                            const enImport = uploadingDoc === cle;
                            const html = docsSession[session.id]?.[type];
                            const fichierUrl = docsSessionFichiers[session.id]?.[type];
                            const dispo = !!html || !!fichierUrl;
                            // Point non bloquant #62 : pour le devis, si le formateur a choisi
                            // "import" à la création de la formation (document_mode), il a déjà
                            // ce document — on lui propose de l'importer plutôt que de le
                            // générer automatiquement. Livret/émargement restent toujours
                            // générés par QalioFlex (pas de sens à les avoir "déjà" avant coup).
                            const modeImport = type === "devis" && session.formation?.document_mode === "import";
                            return (
                              <div key={type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                  <p className="text-sm font-medium text-gray-700">{label}</p>
                                  <p className="text-xs text-gray-400">
                                    {enCours
                                      ? "Génération en cours..."
                                      : enImport
                                      ? "Import en cours..."
                                      : modeImport
                                      ? (fichierUrl ? "Importé — visible par le client" : "Formation en mode \"import\" : dépose ton document existant")
                                      : html
                                      ? "Généré par QalioFlex — visible par le client"
                                      : "À générer avant le début de la session"}
                                  </p>
                                </div>
                                <div className="flex gap-2 items-center">
                                  {(enCours || enImport) && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                                  {modeImport ? (
                                    <>
                                      <input
                                        type="file"
                                        accept=".pdf,.doc,.docx"
                                        id={`upload-${cle}`}
                                        className="hidden"
                                        disabled={enImport}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) uploaderDocumentSession(session.id, session.formation_id, type, file);
                                          e.target.value = "";
                                        }}
                                      />
                                      <label htmlFor={`upload-${cle}`}>
                                        <Button size="sm" variant="outline" disabled={enImport} asChild>
                                          <span>{fichierUrl ? "Remplacer" : "📎 Importer"}</span>
                                        </Button>
                                      </label>
                                    </>
                                  ) : (
                                    <Button size="sm" variant="outline" disabled={enCours}
                                      onClick={() => genererDocumentSession(session.id, type, fn)}>
                                      {enCours ? "Génération..." : html ? "Regénérer" : "Générer"}
                                    </Button>
                                  )}
                                  {dispo && (
                                    <Button size="sm" style={{ background: "#25245e", color: "#fff" }} onClick={() => voirDocumentSession(session.id, type)}>
                                      Voir
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Chantier 5 : convention de formation — ne se génère qu'une fois les
                              stagiaires transmis par le client, préremplie avec leurs infos +
                              dates + client, puis envoyée au formateur ET au client pour
                              signature DocuSign. Archivée dans la session (documents_formation),
                              jamais visible par les stagiaires. */}
                          {(() => {
                            const hasStag = uploadedSessions.has(session.id);
                            const cle = `${session.id}:convention`;
                            const enCours = generatingDoc === cle;
                            const enImport = uploadingDoc === cle;
                            const html = docsSession[session.id]?.convention;
                            const fichierUrl = docsSessionFichiers[session.id]?.convention;
                            const statut = conventionSignatures[session.id];
                            const titreFormation = (session.formation as Record<string, string>)?.titre || "";
                            // Point non bloquant #62 : si la formation est en document_mode
                            // "import", le formateur a déjà sa convention (signée ou non hors
                            // QalioFlex) — on lui propose de l'importer directement plutôt que
                            // de la faire générer puis signer via DocuSign, ce qui n'a pas de
                            // sens s'il gère déjà cette étape lui-même.
                            const modeImport = session.formation?.document_mode === "import";
                            return (
                              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                  <p className="text-sm font-medium text-gray-700">📝 Convention de formation</p>
                                  <p className="text-xs text-gray-400">
                                    {!hasStag
                                      ? "🔒 Disponible une fois les stagiaires transmis par le client"
                                      : enCours
                                      ? "Génération en cours..."
                                      : enImport
                                      ? "Import en cours..."
                                      : sendingSignature === session.id
                                      ? "Envoi pour signature en cours..."
                                      : statut
                                      ? conventionStatutLabel(statut)
                                      : modeImport
                                      ? (fichierUrl ? "Importée — visible par le client" : "Formation en mode \"import\" : dépose ta convention existante")
                                      : html
                                      ? "Générée — accessible au client, pas encore envoyée pour signature"
                                      : "À générer une fois les stagiaires transmis"}
                                  </p>
                                </div>
                                <div className="flex gap-2 items-center">
                                  {(enCours || enImport || sendingSignature === session.id) && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                                  {modeImport ? (
                                    <>
                                      <input
                                        type="file"
                                        accept=".pdf,.doc,.docx"
                                        id={`upload-${cle}`}
                                        className="hidden"
                                        disabled={!hasStag || enImport}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) uploaderDocumentSession(session.id, session.formation_id, "convention", file);
                                          e.target.value = "";
                                        }}
                                      />
                                      <label htmlFor={!hasStag ? undefined : `upload-${cle}`}>
                                        <Button size="sm" variant="outline" disabled={!hasStag || enImport} asChild={hasStag}>
                                          {hasStag ? <span>{fichierUrl ? "Remplacer" : "📎 Importer"}</span> : <span>🔒 En attente</span>}
                                        </Button>
                                      </label>
                                    </>
                                  ) : (
                                    <Button
                                      size="sm" variant="outline"
                                      disabled={!hasStag || enCours}
                                      title={!hasStag ? "Le client doit d'abord transmettre la liste des stagiaires" : undefined}
                                      onClick={() => genererDocumentSession(session.id, "convention", "generer-convention")}
                                    >
                                      {!hasStag ? "🔒 En attente" : enCours ? "Génération..." : html ? "Régénérer" : "Générer"}
                                    </Button>
                                  )}
                                  {(html || fichierUrl) && (
                                    <Button size="sm" style={{ background: "#25245e", color: "#fff" }} onClick={() => voirDocumentSession(session.id, "convention")}>
                                      Voir
                                    </Button>
                                  )}
                                  {!modeImport && html && !statut && (
                                    <Button
                                      size="sm" style={{ background: "#f2901e", color: "#fff" }}
                                      disabled={sendingSignature === session.id}
                                      onClick={() => envoyerConventionSignature(session.id, titreFormation)}
                                    >
                                      {sendingSignature === session.id ? "Envoi..." : "📤 Envoyer signature"}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="mt-4">
                          <StagiairesList
                            sessionId={session.id}
                            canRelance={true}
                            envoye_par="formateur"
                            canal="les_deux"
                            formationTitre={(session.formation as Record<string, string>)?.titre || ""}
                            showSynthese={true}
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-500 hover:bg-red-50 sm:ml-4 flex-shrink-0"
                        onClick={() => supprimerSession(session.id)}
                      >
                        Supprimer
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* Dialog affecter formation */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ color: "#25245e" }}>Affecter une formation à {client.raison_sociale}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Formation <span className="text-red-500">*</span></Label>
              <Select value={selectedFormation} onValueChange={setSelectedFormation}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une formation..." />
                </SelectTrigger>
                <SelectContent>
                  {formations.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.titre}{f.duree ? ` — ${f.duree}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date de début <span className="text-red-500">*</span></Label>
                <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Date de fin</Label>
                <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Lieu</Label>
              <Input value={lieu} onChange={e => setLieu(e.target.value)} placeholder="ex: Tours, distanciel..." />
            </div>

            <div className="space-y-2">
              <Label>Lien visio (optionnel)</Label>
              <Input value={lienVisio} onChange={e => setLienVisio(e.target.value)} placeholder="https://meet.google.com/..." />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button
              onClick={handleAffecterFormation}
              disabled={saving}
              style={{ background: "#f2901e", color: "#fff" }}
              className="font-bold"
            >
              {saving ? "Création..." : "Affecter la formation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientDetail;
