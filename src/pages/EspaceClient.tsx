import { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import StagiairesList from "@/components/StagiairesList";
import * as XLSX from "xlsx";

interface Session {
  id: string;
  formation_id: string;
  client_id: string;
  date_debut: string | null;
  date_fin: string | null;
  lieu: string | null;
  lien_visio: string | null;
  statut: string;
  created_at: string;
  formation?: { titre: string; objectifs: string; programme: string; duree: string };
}

interface Stagiaire {
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
}

const statutLabel = (s: string) => {
  const map: Record<string, { label: string; color: string }> = {
    planifiee: { label: "Planifiée", color: "bg-blue-100 text-blue-700" },
    en_cours: { label: "En cours", color: "bg-orange-100 text-orange-700" },
    terminee: { label: "Terminée", color: "bg-green-100 text-green-700" },
    annulee: { label: "Annulée", color: "bg-red-100 text-red-700" },
  };
  return map[s] || { label: s, color: "bg-gray-100 text-gray-600" };
};

const EspaceClient = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [documentsByFormation, setDocumentsByFormation] = useState<Record<string, Record<string, string>>>({});
  const [documentsBySession, setDocumentsBySession] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);
  const [uploadingSession, setUploadingSession] = useState<string | null>(null);
  const [uploadedSessions, setUploadedSessions] = useState<Set<string>>(new Set());

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { navigate("/login"); return; }

        const u = session.user;
        const role = u.user_metadata?.role;

        // Sécurité : si ce n'est pas un client, rediriger
        if (role && role !== "client") { navigate("/dashboard"); return; }

        setUser({ name: u.user_metadata?.nom_complet || u.email || "", email: u.email || "" });

        // Trouver le client lié à cet email
        const { data: clientData } = await supabase
          .from("clients")
          .select("id")
          .eq("contact_email", u.email)
          .single();

        if (!clientData?.id) {
          setLoading(false);
          return;
        }

        setClientId(clientData.id);

        // Récupérer les sessions de ce client avec les infos de formation
        const { data: sessionsData } = await supabase
          .from("sessions")
          .select("*, formation:formation_id(titre, objectifs, programme, duree)")
          .eq("client_id", clientData.id)
          .order("date_debut", { ascending: false });

        setSessions((sessionsData as Session[]) || []);

        // Vérifier quelles sessions ont déjà des stagiaires
        if (sessionsData && sessionsData.length > 0) {
          const sessionIds = sessionsData.map((s: Session) => s.id);
          const { data: stagData } = await supabase
            .from("stagiaires")
            .select("session_id")
            .in("session_id", sessionIds);

          if (stagData) {
            const ids = new Set(stagData.map((s: { session_id: string }) => s.session_id));
            setUploadedSessions(ids);
          }

          // Récupérer les documents disponibles pour les formations de ces sessions
          // (support, programme... la trame pédagogique reste exclue, confidentielle formateur).
          // Les documents de FORMATION (support, programme, devis...) sont regroupés par
          // formation_id ; les documents de SESSION (livret d'accueil — propre aux dates/lieu
          // d'une session précise) sont regroupés par session_id, pour ne jamais mélanger le
          // livret d'une session avec celui d'une autre session de la même formation.
          const formationIds = [...new Set(sessionsData.map((s: Session) => s.formation_id))];
          const { data: docsData } = await supabase
            .from("documents_formation")
            .select("formation_id, session_id, type, url, contenu_html")
            .or(`formation_id.in.(${formationIds.join(",")}),session_id.in.(${sessionIds.join(",")})`)
            .neq("type", "trame_pedagogique");

          if (docsData) {
            const byFormation: Record<string, Record<string, string>> = {};
            const bySession: Record<string, Record<string, string>> = {};
            (docsData as { formation_id: string; session_id: string | null; type: string; url: string | null; contenu_html: string | null }[]).forEach((d) => {
              const value = d.url || d.contenu_html;
              if (!value) return;
              if (d.session_id) {
                if (!bySession[d.session_id]) bySession[d.session_id] = {};
                bySession[d.session_id][d.type] = value;
              } else {
                if (!byFormation[d.formation_id]) byFormation[d.formation_id] = {};
                byFormation[d.formation_id][d.type] = value;
              }
            });
            setDocumentsByFormation(byFormation);
            setDocumentsBySession(bySession);
          }
        }
      } catch (err) {
        console.error("Erreur EspaceClient:", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [navigate]);

  // Téléchargement du template Excel
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["prenom", "nom", "mobile", "mail"],
      ["Marie", "Dupont", "0612345678", "marie.dupont@entreprise.fr"],
      ["Jean", "Martin", "0698765432", "jean.martin@entreprise.fr"],
    ]);

    // Forcer la colonne mobile (C) en format texte pour conserver le 0
    const mobileCol = ["C2", "C3"];
    mobileCol.forEach(cell => {
      if (ws[cell]) {
        ws[cell].t = "s"; // type string
        ws[cell].z = "@"; // format texte Excel
      }
    });

    // Largeurs de colonnes
    ws["!cols"] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 30 }];

    // Définir le format texte pour toute la colonne C
    if (!ws["!rows"]) ws["!rows"] = [];

    XLSX.utils.book_append_sheet(wb, ws, "Stagiaires");
    XLSX.writeFile(wb, "template_stagiaires_qualioflex.xlsx");
  };

  const handleFileUpload = async (sessionId: string, file: File) => {
    if (!file) return;
    setUploadingSession(sessionId);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false }) as Record<string, string>[];

      if (rows.length === 0) {
        toast({ title: "Fichier vide", description: "Aucune ligne trouvée.", variant: "destructive" });
        return;
      }

      // Vérification stricte du format : prenom, nom, mobile, mail
      const firstRow = rows[0];
      const keys = Object.keys(firstRow).map(k => k.toLowerCase().trim());
      const required = ["prenom", "nom", "mobile", "mail"];
      const missing = required.filter(col => !keys.some(k => k === col || k === col.replace("e", "é")));

      if (missing.length > 0) {
        toast({
          title: "Format incorrect",
          description: `Colonnes manquantes : ${missing.join(", ")}. Téléchargez le template QalioFlex pour utiliser le bon format.`,
          variant: "destructive",
        });
        return;
      }

      // Parsing avec colonnes strictes
      const stagiaires: Stagiaire[] = [];
      const errors: string[] = [];

      rows.forEach((row, i) => {
        const getCol = (name: string) => {
          const key = Object.keys(row).find(k => k.toLowerCase().trim() === name);
          return key ? String(row[key]).trim() : "";
        };

        const prenom = getCol("prenom");
        const nom = getCol("nom");
        const telephoneRaw = getCol("mobile");
        const email = getCol("mail");

        // Normaliser le numéro : forcer string et ajouter 0 si manquant
        let telephone = String(telephoneRaw).replace(/\s/g, "");
        if (telephone.length === 9 && !telephone.startsWith("0")) {
          telephone = "0" + telephone;
        }

        if (!prenom && !nom && !email) return; // ligne vide

        if (!prenom || !nom) {
          errors.push(`Ligne ${i + 2} : prénom ou nom manquant`);
          return;
        }

        stagiaires.push({ nom, prenom, email, telephone });
      });

      if (errors.length > 0) {
        toast({
          title: `${errors.length} ligne(s) ignorée(s)`,
          description: errors.slice(0, 3).join(" | "),
          variant: "destructive",
        });
      }

      if (stagiaires.length === 0) {
        toast({
          title: "Aucun stagiaire valide",
          description: "Vérifiez que le fichier contient des données et utilise le bon format.",
          variant: "destructive",
        });
        return;
      }

      // Supprimer les anciens stagiaires et insérer les nouveaux
      await supabase.from("stagiaires").delete().eq("session_id", sessionId);

      const { error: insertError } = await supabase.from("stagiaires").insert(
        stagiaires.map(s => ({
          session_id: sessionId,
          client_id: clientId,
          nom: s.nom,
          prenom: s.prenom,
          email_pro: s.email,
          telephone: s.telephone,
        }))
      );

      if (insertError) throw insertError;

      setUploadedSessions(prev => new Set([...prev, sessionId]));
      toast({
        title: `✅ ${stagiaires.length} stagiaire(s) importé(s)`,
        description: "Le flow documentaire Qualiopi va être déclenché automatiquement.",
      });

    } catch (err) {
      const msg = err instanceof Error
        ? err.message
        : (err as Record<string, string>)?.message || JSON.stringify(err);
      toast({ title: "Erreur import", description: msg, variant: "destructive" });
    } finally {
      setUploadingSession(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Chargement de votre espace...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header client simplifié */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/espace-client")}>
          <span className="text-xl font-bold" style={{ color: "#25245e" }}>QalioFlex</span>
          <span className="text-xs text-gray-400">Espace client</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={handleLogout}>Se déconnecter</Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ color: "#25245e" }}>
            Bonjour{user?.name && user.name !== user.email ? ` ${user.name}` : ""} 👋
          </h1>
          <p className="text-gray-500 mt-1">Retrouvez vos sessions de formation et gérez vos participants.</p>
        </div>

        {sessions.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-4xl mb-4">📚</p>
              <p className="text-gray-500">Aucune session de formation pour le moment.</p>
              <p className="text-sm text-gray-400 mt-2">Votre formateur va prochainement affecter vos formations.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => {
              const statut = statutLabel(session.statut);
              const isUpcoming = session.date_debut && new Date(session.date_debut) > new Date();
              const hasStag = uploadedSessions.has(session.id);

              return (
                <Card key={session.id} className="overflow-hidden">
                  <div className="h-1" style={{ background: isUpcoming ? "#f2901e" : "#25245e" }} />
                  <CardContent className="pt-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <h2 className="text-xl font-bold text-gray-900">
                          {(session.formation as Record<string, string>)?.titre || "Formation"}
                        </h2>
                        {(session.formation as Record<string, string>)?.duree && (
                          <p className="text-sm text-gray-500 mt-0.5">⏱ {(session.formation as Record<string, string>).duree}</p>
                        )}
                      </div>
                      <Badge className={statut.color}>{statut.label}</Badge>
                    </div>

                    {/* Infos session */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 text-sm">
                      {session.date_debut && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-400 mb-1">📅 Début</p>
                          <p className="font-medium">{new Date(session.date_debut).toLocaleDateString("fr-FR")}</p>
                        </div>
                      )}
                      {session.date_fin && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-400 mb-1">📅 Fin</p>
                          <p className="font-medium">{new Date(session.date_fin).toLocaleDateString("fr-FR")}</p>
                        </div>
                      )}
                      {session.lieu && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-400 mb-1">📍 Lieu</p>
                          <p className="font-medium">{session.lieu}</p>
                        </div>
                      )}
                      {session.lien_visio && (
                        <div className="bg-gray-50 rounded-lg p-3 md:col-span-2">
                          <p className="text-xs text-gray-400 mb-1">🖥 Lien visio</p>
                          <a href={session.lien_visio} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm truncate block">
                            {session.lien_visio}
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Documents Qualiopi */}
                    <div className="border-t pt-4 mb-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">📄 Documents Qualiopi</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {[
                          // Le support reste verrouillé côté client tant que les évaluations à chaud
                          // ne sont pas toutes complétées et les attestations pas toutes générées
                          // (fonctionnalités à venir) — locked: true empêche tout lien cliquable ici,
                          // même si le fichier existe déjà côté stockage.
                          { key: "support", label: "Support pédagogique", locked: true, scope: "formation" as const },
                          { key: "programme", label: "Programme", scope: "formation" as const },
                          { key: "devis", label: "Devis", scope: "formation" as const },
                          // Le livret d'accueil est propre à CETTE session (dates/lieu précis),
                          // donc rattaché à session_id et non formation_id — voir documentsBySession.
                          { key: "livret", label: "Livret d'accueil", scope: "session" as const },
                          { key: "emargements", label: "Émargements", scope: "formation" as const },
                          { key: "attestation", label: "Attestation de fin", scope: "formation" as const },
                        ].map(({ key, label, locked, scope }) => {
                          const value = locked
                            ? undefined
                            : scope === "session"
                            ? documentsBySession[session.id]?.[key]
                            : documentsByFormation[session.formation_id]?.[key];
                          // Le livret est stocké en HTML brut (contenu_html), pas en URL de
                          // stockage — on l'ouvre dans un nouvel onglet plutôt qu'un lien direct.
                          const isInlineHtml = key === "livret";
                          if (value && isInlineHtml) {
                            return (
                              <button
                                key={key}
                                onClick={() => {
                                  const win = window.open("", "_blank");
                                  if (win) { win.document.write(value); win.document.close(); }
                                }}
                                className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 rounded px-3 py-2 hover:underline text-left"
                              >
                                <span>📎</span>
                                <span>{label}</span>
                                <span className="ml-auto">↗</span>
                              </button>
                            );
                          }
                          const url = value;
                          return url ? (
                            
                              key={key}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 rounded px-3 py-2 hover:underline"
                            >
                              <span>📎</span>
                              <span>{label}</span>
                              <span className="ml-auto">↗</span>
                            </a>
                          ) : (
                            <div
                              key={key}
                              className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded px-3 py-2"
                              title={locked ? "Disponible une fois vos évaluations à chaud complétées et votre attestation générée" : undefined}
                            >
                              <span>📎</span>
                              <span>{label}</span>
                              <span className="ml-auto text-gray-300">{locked ? "🔒" : "—"}</span>
                            </div>
                          );
                        })}
                      </div>
                      {!hasStag && (
                        <p className="text-xs text-orange-500 mt-2">⚠️ Certains documents seront disponibles après l'import des stagiaires.</p>
                      )}
                    </div>

                    {/* Stagiaires importés */}
                    {hasStag && (
                      <div className="border-t pt-4 mb-4">
                        <StagiairesList
                            sessionId={session.id}
                            canRelance={true}
                            envoye_par="client"
                            canal="les_deux"
                            formationTitre={(session.formation as Record<string, string>)?.titre || ""}
                          />
                      </div>
                    )}

                    {/* Upload stagiaires */}
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-700">👥 Stagiaires</p>
                          <p className="text-xs text-gray-400">
                            Format imposé : <strong>prénom / nom / mobile / mail</strong>
                          </p>
                        </div>
                        {hasStag && (
                          <Badge className="bg-green-100 text-green-700">✓ Importés</Badge>
                        )}
                      </div>

                      <div className="flex gap-2 mt-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={downloadTemplate}
                          className="text-xs"
                        >
                          📥 Télécharger le template Excel
                        </Button>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          className="hidden"
                          id={`upload-${session.id}`}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(session.id, file);
                          }}
                        />
                        <label htmlFor={`upload-${session.id}`}>
                          <Button
                            asChild
                            variant={hasStag ? "outline" : "default"}
                            disabled={uploadingSession === session.id}
                            size="sm"
                            style={!hasStag ? { background: "#f2901e", color: "#fff" } : {}}
                            className={!hasStag ? "font-bold cursor-pointer" : "cursor-pointer"}
                          >
                            <span>
                              {uploadingSession === session.id
                                ? "Import en cours..."
                                : hasStag
                                ? "📤 Mettre à jour les stagiaires"
                                : "📤 Importer les stagiaires"}
                            </span>
                          </Button>
                        </label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default EspaceClient;

