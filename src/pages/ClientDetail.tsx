import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StagiairesList from "@/components/StagiairesList";
import { supabase } from "@/integrations/supabase/client";

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
  formation?: { titre: string; duree: string };
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

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [organismeId, setOrganismeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      .select("*, formation:formation_id(titre, duree)")
      .eq("client_id", clientId)
      .order("date_debut", { ascending: false });
    setSessions((data as Session[]) || []);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { navigate("/login"); return; }

        setUser({
          name: session.user.user_metadata?.nom_complet || session.user.email || "",
          email: session.user.email || "",
          profileImage: "",
        });

        const { data: profile } = await supabase
          .from("profiles")
          .select("organisme_id")
          .eq("id", session.user.id)
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
  }, [id, navigate, toast]);

  const handleAffecterFormation = async () => {
    if (!selectedFormation) {
      toast({ title: "Sélectionnez une formation", variant: "destructive" }); return;
    }
    if (!dateDebut) {
      toast({ title: "La date de début est obligatoire", variant: "destructive" }); return;
    }

    setSaving(true);
    const { error } = await supabase.from("sessions").insert({
      formation_id: selectedFormation,
      client_id: id,
      date_debut: dateDebut || null,
      date_fin: dateFin || null,
      lieu: lieu || null,
      lien_visio: lienVisio || null,
      statut: "planifiee",
    });

    setSaving(false);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" }); return;
    }

    toast({ title: "✅ Formation affectée", description: "La session a été créée. Le client peut maintenant importer ses stagiaires." });
    setDialogOpen(false);
    setSelectedFormation(""); setDateDebut(""); setDateFin(""); setLieu(""); setLienVisio("");
    await fetchSessions(id!);
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
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
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
                        <div className="mt-4">
                          <StagiairesList sessionId={session.id} canRelance={true} envoye_par="formateur" canal="les_deux" />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-500 hover:bg-red-50 ml-4"
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
