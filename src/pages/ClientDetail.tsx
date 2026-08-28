import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HelpPopup from "@/components/HelpPopup";
import StagiairesList from "@/components/StagiairesList";
import SoustraiterSessionDialog from "@/components/SoustraiterSessionDialog";
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

interface SousTraitance {
  id: string;
  statut: "invite" | "actif";
  email_invite: string | null;
  organisme_sous_traitant_id: string | null;
  nom_affiche: string;
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
  // Correctif du 20/08 (Olivier) : l'alerte "documents en attente de signature"
  // du Dashboard n'atterrissait que sur la fiche client, pas sur la session
  // concernée — il fallait ensuite la retrouver à l'oeil dans la liste. Le lien
  // pointe maintenant vers ?session=<id>, utilisé ici pour scroller jusqu'à la
  // bonne carte et la surligner.
  const [searchParams] = useSearchParams();
  const highlightSessionId = searchParams.get("session");
  const [sessionHighlighted, setSessionHighlighted] = useState(false);

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
  // Chantier "sous-traitance" (28/08) : sessions_sous_traitance en cours (invitée ou
  // active) par session, pour afficher le badge "Sous-traité à ..." et proposer de
  // retirer le sous-traitant. soustraiterSessionId ouvre la modal d'assignation.
  const [soustraitances, setSoustraitances] = useState<Record<string, SousTraitance>>({});
  const [soustraiterSessionId, setSoustraiterSessionId] = useState<string | null>(null);
  const [confirmRetraitSession, setConfirmRetraitSession] = useState<Session | null>(null);
  const [retraitEnCours, setRetraitEnCours] = useState(false);

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

      await fetchSoustraitances(sessionIds);
    }
  };

  // Chantier "sous-traitance" (28/08) : sessions déjà sous-traitées (invitation en
  // attente ou sous-traitant actif) parmi les sessions du client — pour le badge et
  // le bouton "Retirer". nom_affiche vient de l'organisme sous-traitant une fois actif,
  // ou de l'email invité tant que l'invitation n'a pas été acceptée.
  const fetchSoustraitances = async (sessionIds: string[]) => {
    const { data } = await supabase
      .from("sessions_sous_traitance")
      .select("id, session_id, statut, email_invite, organisme_sous_traitant_id")
      .in("session_id", sessionIds)
      .in("statut", ["invite", "actif"]);
    const rows = (data as { id: string; session_id: string; statut: "invite" | "actif"; email_invite: string | null; organisme_sous_traitant_id: string | null }[]) || [];
    if (rows.length === 0) { setSoustraitances({}); return; }

    const orgIds = rows.map(r => r.organisme_sous_traitant_id).filter(Boolean) as string[];
    const nomParOrg: Record<string, string> = {};
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase.from("organismes").select("id, raison_sociale").in("id", orgIds);
      (orgs as { id: string; raison_sociale: string }[] || []).forEach(o => { nomParOrg[o.id] = o.raison_sociale; });
    }

    const map: Record<string, SousTraitance> = {};
    rows.forEach(r => {
      map[r.session_id] = {
        id: r.id,
        statut: r.statut,
        email_invite: r.email_invite,
        organisme_sous_traitant_id: r.organisme_sous_traitant_id,
        nom_affiche: r.organisme_sous_traitant_id ? (nomParOrg[r.organisme_sous_traitant_id] || "Formateur") : (r.email_invite || "—"),
      };
    });
    setSoustraitances(map);
  };

  const retirerSoustraitant = async (sessionId: string) => {
    const row = soustraitances[sessionId];
    if (!row) return;
    setRetraitEnCours(true);
    const { error } = await supabase.from("sessions_sous_traitance").update({ statut: "retire" }).eq("id", row.id);
    setRetraitEnCours(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Sous-traitant retiré" });
    setConfirmRetraitSession(null);
    setSoustraitances(prev => { const next = { ...prev }; delete next[sessionId]; return next; });
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

  // Bug "page blanche" (16/08/2026) : html2pdf.js (v0.10.1 comme v0.14.0, testé) a
  // un bug interne qui produit un canvas de hauteur 0 quand on lui passe un
  // conteneur positionné hors écran (position:fixed; left:-9999px — la technique
  // standard pour rastériser du HTML sans l'afficher à l'écran). Résultat : le PDF
  // envoyé à DocuSign était "valide" (pas d'erreur, 1 page) mais totalement blanc.
  // Vérifié par test direct : html2canvas seul (chargé isolément, hors du bundle
  // html2pdf.js) produit un canvas correct dans les mêmes conditions. On charge donc
  // html2canvas + jsPDF séparément et on orchestre nous-mêmes le rendu + la
  // pagination, sans passer par html2pdf.js.
  const chargerLibsPdf = () =>
    new Promise<void>((resolve, reject) => {
      const w = window as unknown as { html2canvas?: unknown; jspdf?: unknown };
      const chargerScript = (src: string) =>
        new Promise<void>((res, rej) => {
          const script = document.createElement("script");
          script.src = src;
          script.onload = () => res();
          script.onerror = () => rej(new Error("Impossible de charger l'outil de génération PDF."));
          document.head.appendChild(script);
        });
      const promesses: Promise<void>[] = [];
      if (!w.html2canvas) {
        promesses.push(chargerScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"));
      }
      if (!w.jspdf) {
        promesses.push(chargerScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"));
      }
      Promise.all(promesses).then(() => resolve()).catch(reject);
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

      await chargerLibsPdf();

      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "800px";
      container.innerHTML = gen.contenu_html;
      document.body.appendChild(container);

      // Bug DocuSign (page blanche côté signataire) : html2canvas transforme tout
      // le document en image, donc le PDF final ne contient aucun texte réel — les
      // ancres /signature_formateur/ et /signature_client/ existent bien dans le
      // HTML source mais disparaissent une fois rastérisées, et DocuSign ne peut
      // jamais les localiser. On mesure ici la position exacte des zones de
      // signature dans le DOM (avant rastérisation) pour pouvoir y superposer du
      // texte réel, invisible, juste après génération du PDF — le rendu visuel ne
      // change pas, mais DocuSign peut enfin retrouver les ancres.
      const signaturesEl = container.querySelector<HTMLElement>(".signatures");
      const zoneFormateurEl = container.querySelector<HTMLElement>("#signature-zone-formateur");
      const zoneClientEl = container.querySelector<HTMLElement>("#signature-zone-client");

      const PX_TO_MM = 190 / 800;
      const MARGIN_MM = 10;
      let signaturesTopPx: number | null = null;
      let sigCoords: { formateur: { x: number; y: number }; client: { x: number; y: number } } | null = null;
      if (signaturesEl && zoneFormateurEl && zoneClientEl) {
        // La div .signatures doit systématiquement démarrer en haut d'une nouvelle
        // page PDF : on force ce saut de page nous-mêmes (voir découpage du canvas
        // plus bas) puisque html2canvas ignore la CSS page-break-before. Sa position
        // dans le DOM correspond alors exactement au coin haut-gauche de la zone
        // utile de la dernière page. Conversion px -> mm : le conteneur fait 800px
        // de large pour une largeur utile de page A4 de 190mm (210mm - 2x10mm de marge).
        const containerRect = container.getBoundingClientRect();
        const baseRect = signaturesEl.getBoundingClientRect();
        signaturesTopPx = baseRect.top - containerRect.top;
        const toCoords = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          return {
            x: MARGIN_MM + (r.left - baseRect.left) * PX_TO_MM,
            y: MARGIN_MM + (r.top - baseRect.top + r.height / 2) * PX_TO_MM,
          };
        };
        sigCoords = { formateur: toCoords(zoneFormateurEl), client: toCoords(zoneClientEl) };
      }

      type JsPdfInstance = {
        internal: { getNumberOfPages: () => number };
        setPage: (page: number) => void;
        addPage: () => void;
        addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => void;
        text: (text: string, x: number, y: number, opts?: Record<string, unknown>) => void;
        output: (type: string) => Blob;
      };

      let pdfBlob: Blob;
      try {
        const html2canvas = (window as unknown as { html2canvas: (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement> }).html2canvas;
        const { jsPDF } = (window as unknown as { jspdf: { jsPDF: new (opts: Record<string, unknown>) => JsPdfInstance } }).jspdf;

        const scale = 2;
        const canvas = await html2canvas(container, { scale, useCORS: true });

        const contentWidthMM = 190;
        const pageHeightMM = 277; // 297 (A4) - 2x10mm de marge
        const pxToMmCanvas = contentWidthMM / canvas.width;
        const pageHeightCanvasPx = (pageHeightMM / pxToMmCanvas);

        // Construit la liste des points de coupure du canvas (en px canvas) :
        // découpage automatique toutes les "pageHeightCanvasPx", avec un saut de
        // page forcé exactement au début de la zone de signatures.
        const signaturesTopCanvasPx = signaturesTopPx !== null ? signaturesTopPx * scale : null;
        const breaks = [0];
        let y = 0;
        const limite = signaturesTopCanvasPx !== null ? signaturesTopCanvasPx : canvas.height;
        while (y + pageHeightCanvasPx < limite) { y += pageHeightCanvasPx; breaks.push(Math.round(y)); }
        if (signaturesTopCanvasPx !== null && signaturesTopCanvasPx > breaks[breaks.length - 1]) {
          breaks.push(Math.round(signaturesTopCanvasPx));
          y = signaturesTopCanvasPx;
          while (y + pageHeightCanvasPx < canvas.height) { y += pageHeightCanvasPx; breaks.push(Math.round(y)); }
        }
        breaks.push(canvas.height);
        const pageBreaks = breaks.filter((b, i) => i === 0 || b > breaks[i - 1]);

        const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
        for (let i = 0; i < pageBreaks.length - 1; i++) {
          const sy = pageBreaks[i];
          const sh = pageBreaks[i + 1] - pageBreaks[i];
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sh;
          const ctx = sliceCanvas.getContext("2d");
          ctx?.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
          const imgData = sliceCanvas.toDataURL("image/jpeg", 0.92);
          if (i > 0) pdf.addPage();
          pdf.addImage(imgData, "JPEG", MARGIN_MM, MARGIN_MM, contentWidthMM, sh * pxToMmCanvas);
        }

        if (sigCoords) {
          const totalPages = pdf.internal.getNumberOfPages();
          pdf.setPage(totalPages);
          pdf.text("/signature_formateur/", sigCoords.formateur.x, sigCoords.formateur.y, { renderingMode: "invisible" });
          pdf.text("/signature_client/", sigCoords.client.x, sigCoords.client.y, { renderingMode: "invisible" });
        }

        pdfBlob = pdf.output("blob");
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
    // Point non bloquant (audit test grandeur réelle 01/08) : redirige un
    // compte client vers son espace au lieu de laisser voir l'UI formateur.
    if (authSession.user.user_metadata?.role === "client") { navigate("/espace-client"); return; }

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

  // Correctif du 20/08 (Olivier) : la suppression d'une session se faisait en un
  // clic (confirmation native `confirm()`, trop facile à valider par réflexe/appui
  // par erreur). Remplacée par une boîte de dialogue explicite (AlertDialog) qui
  // exige un second clic délibéré sur "Supprimer" — `confirmDeleteSession` porte
  // la session en attente de confirmation, la suppression réelle ne se déclenche
  // que depuis le bouton de la boîte de dialogue ci-dessous (cf. rendu).
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<Session | null>(null);

  const supprimerSession = async (sessionId: string) => {
    const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Session supprimée" });
    setConfirmDeleteSession(null);
    await fetchSessions(id!);
  };

  useEffect(() => {
    if (!highlightSessionId || sessions.length === 0) return;
    if (!sessions.some(s => s.id === highlightSessionId)) return;
    const card = document.getElementById(`session-${highlightSessionId}`);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    setSessionHighlighted(true);
  }, [highlightSessionId, sessions]);

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
                <Card
                  key={session.id}
                  id={`session-${session.id}`}
                  className={sessionHighlighted && highlightSessionId === session.id ? "ring-2 ring-amber-400 ring-offset-2" : undefined}
                >
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
                          {soustraitances[session.id]?.statut === "actif" && (
                            <Badge className="bg-purple-100 text-purple-700">🤝 Sous-traité à {soustraitances[session.id].nom_affiche}</Badge>
                          )}
                          {soustraitances[session.id]?.statut === "invite" && (
                            <Badge className="bg-amber-100 text-amber-700">✉️ Invitation sous-traitance envoyée à {soustraitances[session.id].nom_affiche}</Badge>
                          )}
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
                      <div className="flex sm:flex-col gap-2 sm:ml-4 flex-shrink-0">
                        {soustraitances[session.id] ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-purple-200 text-purple-600 hover:bg-purple-50"
                            onClick={() => setConfirmRetraitSession(session)}
                          >
                            Retirer le sous-traitant
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-purple-200 text-purple-600 hover:bg-purple-50"
                            onClick={() => setSoustraiterSessionId(session.id)}
                          >
                            🤝 Sous-traiter
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-500 hover:bg-red-50"
                          onClick={() => setConfirmDeleteSession(session)}
                        >
                          Supprimer
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* Confirmation suppression session */}
      <AlertDialog open={!!confirmDeleteSession} onOpenChange={(open) => !open && setConfirmDeleteSession(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette session ?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteSession && (
                <>
                  Cette action supprimera définitivement la session{" "}
                  <strong>{confirmDeleteSession.formation?.titre || "Formation"}</strong>
                  {confirmDeleteSession.date_debut
                    ? ` du ${new Date(confirmDeleteSession.date_debut).toLocaleDateString("fr-FR")}`
                    : ""}
                  , ainsi que tous les documents et stagiaires associés. Cette action est irréversible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDeleteSession && supprimerSession(confirmDeleteSession.id)}
            >
              Oui, supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation retrait sous-traitant */}
      <AlertDialog open={!!confirmRetraitSession} onOpenChange={(open) => !open && setConfirmRetraitSession(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer le sous-traitant de cette session ?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRetraitSession && (
                <>
                  {soustraitances[confirmRetraitSession.id]?.nom_affiche} perdra l'accès à la session{" "}
                  <strong>{confirmRetraitSession.formation?.titre || "Formation"}</strong>. Vous pourrez ré-assigner un sous-traitant ensuite.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={retraitEnCours}
              onClick={() => confirmRetraitSession && retirerSoustraitant(confirmRetraitSession.id)}
            >
              {retraitEnCours ? "..." : "Oui, retirer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal sous-traiter une session */}
      {soustraiterSessionId && (
        <SoustraiterSessionDialog
          sessionId={soustraiterSessionId}
          formationTitre={sessions.find(s => s.id === soustraiterSessionId)?.formation?.titre || "cette formation"}
          onClose={() => setSoustraiterSessionId(null)}
          onAssigned={() => fetchSoustraitances(sessions.map(s => s.id))}
        />
      )}

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
