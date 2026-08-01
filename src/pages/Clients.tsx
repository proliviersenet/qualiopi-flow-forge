import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Client {
  id: string;
  raison_sociale: string;
  siret: string;
  contact_nom: string;
  contact_email: string;
  adresse: string;
  created_at: string;
}

const Clients = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };
  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [siretLoading, setSiretLoading] = useState(false);
  const [formData, setFormData] = useState({ siret: "", raison_sociale: "", adresse: "", contact_nom: "", contact_email: "" });
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [organismeId, setOrganismeId] = useState<string | null>(null);
  const [organismeNom, setOrganismeNom] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    // Point non bloquant (audit test grandeur réelle 01/08) : redirige un
    // compte client vers son espace au lieu de laisser voir l'UI formateur.
    if (authSession.user.user_metadata?.role === "client") { navigate("/espace-client"); return; }

    const init = async () => {
      try {
        setUser({ name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "", email: authSession.user.email || "", profileImage: "" });
        const { data: profile, error: profileError } = await supabase.from("profiles").select("organisme_id").eq("id", authSession.user.id).single();
        if (profileError) console.error("Erreur profil:", profileError);
        if (profile?.organisme_id) {
          setOrganismeId(profile.organisme_id);
          const { data } = await supabase.from("clients").select("*").eq("organisme_id", profile.organisme_id).order("raison_sociale");
          setClients(data || []);
          const { data: org } = await supabase.from("organismes").select("raison_sociale").eq("id", profile.organisme_id).single();
          if (org) setOrganismeNom((org as Record<string, string>).raison_sociale || "");
        }
      } catch (err) {
        console.error("Erreur init Clients:", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [navigate, authSession, authLoading]);

  const envoyerInvitation = async () => {
    if (!inviteEmail) {
      toast({ title: "Email requis", variant: "destructive" }); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      toast({ title: "Email invalide", variant: "destructive" }); return;
    }
    if (!organismeId) {
      toast({
        title: "Profil incomplet",
        description: "Votre compte n'est pas encore rattaché à un organisme. Complétez votre profil d'abord.",
        variant: "destructive",
      }); return;
    }
    setInviting(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke("envoyer-invitation", {
      body: {
        email: inviteEmail,
        organisme_id: organismeId,
        organisme_nom: organismeNom,
        formateur_nom: session?.user?.user_metadata?.nom_complet || user?.name || "Votre formateur",
      },
    });
    setInviting(false);
    if (error || data?.error) {
      toast({ title: "Erreur", description: error?.message || data?.error, variant: "destructive" }); return;
    }
    toast({ title: "Invitation envoyée ✅", description: `Un email a été envoyé à ${inviteEmail}` });
    setInviteEmail("");
    setShowInviteForm(false);
  };

  const fetchSiret = async () => {
    const siret = formData.siret.replace(/\s/g, "");
    if (siret.length !== 14) { toast({ title: "SIRET invalide", variant: "destructive" }); return; }
    setSiretLoading(true);
    try {
      const resp = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siret}&page=1&per_page=1`);
      const json = await resp.json();
      if (!json.results?.length) throw new Error("Non trouvé");
      const r = json.results[0];
      setFormData(prev => ({ ...prev, siret, raison_sociale: r.nom_raison_sociale || r.nom_complet, adresse: r.siege?.adresse || "" }));
      toast({ title: "Client trouvé", description: r.nom_raison_sociale || r.nom_complet });
    } catch { toast({ title: "SIRET non trouvé", variant: "destructive" }); }
    finally { setSiretLoading(false); }
  };

  const ajouterClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organismeId) return;
    const { data, error } = await supabase.from("clients").insert({
      organisme_id: organismeId,
      siret: formData.siret,
      siren: formData.siret.slice(0, 9),
      raison_sociale: formData.raison_sociale,
      adresse: formData.adresse,
      contact_nom: formData.contact_nom,
      contact_email: formData.contact_email,
    }).select().single();
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setClients(prev => [data, ...prev]);
    setShowForm(false);
    setFormData({ siret: "", raison_sociale: "", adresse: "", contact_nom: "", contact_email: "" });
    toast({ title: "Client ajouté", description: formData.raison_sociale });
  };

  const filtres = clients.filter(c =>
    c.raison_sociale?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_nom?.toLowerCase().includes(search.toLowerCase()) ||
    c.siret?.includes(search)
  );

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <h1 className="text-3xl font-bold text-gray-900">Mes clients</h1>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setShowInviteForm(!showInviteForm); setShowForm(false); }}>
                ✉️ Inviter un client
              </Button>
              <Button className="btn-cta font-bold" onClick={() => { setShowForm(!showForm); setShowInviteForm(false); }}>
                + Ajouter un client
              </Button>
            </div>
          </div>

          {showInviteForm && (
            <Card className="mb-6 p-5 border-orange-200 bg-orange-50">
              <h3 className="font-semibold mb-1" style={{ color: "#25245e" }}>✉️ Inviter un client par email</h3>
              <p className="text-sm text-gray-500 mb-4">Votre client recevra un lien pour créer son espace QalioFlex en autonomie à partir de son SIREN.</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@client.fr"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="flex-1"
                  onKeyDown={e => e.key === "Enter" && envoyerInvitation()}
                />
                <Button
                  onClick={envoyerInvitation}
                  disabled={inviting}
                  style={{ background: "#f2901e", color: "#fff" }}
                  className="font-bold"
                >
                  {inviting ? "Envoi..." : "Envoyer l'invitation"}
                </Button>
                <Button variant="outline" onClick={() => setShowInviteForm(false)}>Annuler</Button>
              </div>
              <p className="text-xs text-gray-400 mt-2">📬 Si votre client ne reçoit pas l'email, demandez-lui de vérifier ses spams ou courriers indésirables.</p>
            </Card>
          )}

          {showForm && (
            <Card className="mb-6 p-5">
              <h3 className="font-medium mb-4" style={{ color: "#25245e" }}>Nouveau client</h3>
              <form onSubmit={ajouterClient} className="space-y-3">
                <div className="flex gap-2">
                  <Input placeholder="SIRET (14 chiffres)" value={formData.siret} onChange={e => setFormData(p => ({ ...p, siret: e.target.value }))} className="flex-1" maxLength={14} />
                  <Button type="button" variant="outline" onClick={fetchSiret} disabled={siretLoading}>{siretLoading ? "..." : "Rechercher"}</Button>
                </div>
                {formData.raison_sociale && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                    <strong>{formData.raison_sociale}</strong><br />{formData.adresse}
                  </div>
                )}
                <Input placeholder="Nom du contact" value={formData.contact_nom} onChange={e => setFormData(p => ({ ...p, contact_nom: e.target.value }))} />
                <Input placeholder="Email du contact" type="email" value={formData.contact_email} onChange={e => setFormData(p => ({ ...p, contact_email: e.target.value }))} />
                <div className="flex gap-2">
                  <Button type="submit" className="btn-cta">Enregistrer</Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
                </div>
              </form>
            </Card>
          )}

          <div className="mb-4">
            <Input placeholder="Rechercher un client..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Chargement...</div>
          ) : clients.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-4xl mb-4">🏢</p>
              <p className="text-lg font-medium text-gray-700 mb-2">Aucun client pour l'instant</p>
              <p className="text-gray-500 mb-6">Ajoutez vos premiers clients pour les associer à vos sessions de formation.</p>
              <Button className="btn-cta font-bold" onClick={() => setShowForm(true)}>Ajouter mon premier client</Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtres.map(client => (
                <Card key={client.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: "#25245e" }}>
                        {(client.raison_sociale || "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{client.raison_sociale}</p>
                        {client.siret && <p className="text-xs text-gray-400">SIRET : {client.siret}</p>}
                      </div>
                    </div>
                    {client.adresse && <p className="text-xs text-gray-500 mb-2">📍 {client.adresse}</p>}
                    {client.contact_nom && <p className="text-xs text-gray-500 mb-1">👤 {client.contact_nom}</p>}
                    {client.contact_email && <p className="text-xs text-gray-500 mb-3">✉️ {client.contact_email}</p>}
                    <Link to={`/clients/${client.id}`}>
                      <Button size="sm" className="w-full font-bold" style={{ background: "#25245e", color: "#fff" }}>
                        Voir la fiche →
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Clients;
