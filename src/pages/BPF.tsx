import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";

interface Thematique {
  nom: string;
  nb_heures: number;
  nb_stagiaires: number;
}

interface BPFRecord {
  id: string;
  annee: number;
  nb_stagiaires: number | null;
  nb_heures_formation: number | null;
  ca_formation: number | null;
  taux_satisfaction: number | null;
  nb_sessions: number | null;
  nb_formations: number | null;
  repartition_thematiques: Thematique[] | null;
  genere_le: string | null;
  valide: boolean;
  valide_le: string | null;
  created_at: string;
}

const emptyForm = {
  annee: new Date().getFullYear(),
  nb_stagiaires: "",
  nb_heures_formation: "",
  ca_formation: "",
  taux_satisfaction: "",
  nb_sessions: "",
  nb_formations: "",
};

const BPF = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [organismeId, setOrganismeId] = useState<string | null>(null);
  const [bpfList, setBpfList] = useState<BPFRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog états
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [thematiques, setThematiques] = useState<Thematique[]>([]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const fetchBPF = async (orgId: string) => {
    const { data } = await supabase
      .from("bpf")
      .select("*")
      .eq("organisme_id", orgId)
      .order("annee", { ascending: false });
    setBpfList((data as BPFRecord[]) || []);
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

      const { data: profile } = await supabase
        .from("profiles")
        .select("organisme_id")
        .eq("id", session.user.id)
        .single();

      if (profile?.organisme_id) {
        setOrganismeId(profile.organisme_id);
        await fetchBPF(profile.organisme_id);
      }
      setLoading(false);
    };
    init();
  }, [navigate]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setThematiques([]);
    setDialogOpen(true);
  };

  const openEdit = (bpf: BPFRecord) => {
    setEditingId(bpf.id);
    setForm({
      annee: bpf.annee,
      nb_stagiaires: bpf.nb_stagiaires?.toString() || "",
      nb_heures_formation: bpf.nb_heures_formation?.toString() || "",
      ca_formation: bpf.ca_formation?.toString() || "",
      taux_satisfaction: bpf.taux_satisfaction?.toString() || "",
      nb_sessions: bpf.nb_sessions?.toString() || "",
      nb_formations: bpf.nb_formations?.toString() || "",
    });
    setThematiques(bpf.repartition_thematiques || []);
    setDialogOpen(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const addThematique = () => {
    setThematiques((prev) => [...prev, { nom: "", nb_heures: 0, nb_stagiaires: 0 }]);
  };

  const updateThematique = (index: number, field: keyof Thematique, value: string) => {
    setThematiques((prev) =>
      prev.map((t, i) =>
        i === index
          ? { ...t, [field]: field === "nom" ? value : Number(value) }
          : t
      )
    );
  };

  const removeThematique = (index: number) => {
    setThematiques((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!organismeId) return;
    setSaving(true);

    const payload = {
      organisme_id: organismeId,
      annee: Number(form.annee),
      nb_stagiaires: form.nb_stagiaires ? Number(form.nb_stagiaires) : null,
      nb_heures_formation: form.nb_heures_formation ? Number(form.nb_heures_formation) : null,
      ca_formation: form.ca_formation ? Number(form.ca_formation) : null,
      taux_satisfaction: form.taux_satisfaction ? Number(form.taux_satisfaction) : null,
      nb_sessions: form.nb_sessions ? Number(form.nb_sessions) : null,
      nb_formations: form.nb_formations ? Number(form.nb_formations) : null,
      repartition_thematiques: thematiques.length > 0 ? thematiques : null,
      valide: false,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("bpf").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("bpf").insert(payload));
    }

    setSaving(false);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: editingId ? "BPF mis à jour" : "BPF créé", description: `Bilan ${form.annee} enregistré.` });
    setDialogOpen(false);
    await fetchBPF(organismeId);
  };

  const handleValider = async (bpf: BPFRecord) => {
    const { error } = await supabase
      .from("bpf")
      .update({ valide: true, valide_le: new Date().toISOString(), genere_le: new Date().toISOString() })
      .eq("id", bpf.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "BPF validé", description: `Le bilan ${bpf.annee} a été validé.` });
    if (organismeId) await fetchBPF(organismeId);
  };

  const handleSupprimer = async (bpf: BPFRecord) => {
    if (!confirm(`Supprimer le BPF ${bpf.annee} ? Cette action est irréversible.`)) return;
    const { error } = await supabase.from("bpf").delete().eq("id", bpf.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "BPF supprimé" });
    if (organismeId) await fetchBPF(organismeId);
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
        <div className="container mx-auto px-4 max-w-4xl">

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold">Bilan Pédagogique et Financier</h1>
              <p className="text-gray-500 text-sm mt-1">Déclaration annuelle obligatoire — DREETS</p>
            </div>
            <Button
              onClick={openCreate}
              style={{ background: "#f2901e", color: "#fff" }}
              className="font-bold"
            >
              + Nouveau BPF
            </Button>
          </div>

          {bpfList.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-gray-400 text-lg mb-2">Aucun BPF enregistré</p>
                <p className="text-gray-400 text-sm mb-6">Créez votre premier Bilan Pédagogique et Financier pour l'année en cours.</p>
                <Button onClick={openCreate} style={{ background: "#f2901e", color: "#fff" }} className="font-bold">
                  Créer le BPF {new Date().getFullYear()}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {bpfList.map((bpf) => (
                <Card key={bpf.id} className={bpf.valide ? "border-green-200" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl" style={{ color: "#25245e" }}>
                        BPF {bpf.annee}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {bpf.valide ? (
                          <Badge className="bg-green-100 text-green-700">
                            ✓ Validé {bpf.valide_le ? `le ${new Date(bpf.valide_le).toLocaleDateString("fr-FR")}` : ""}
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700">En cours</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Indicateurs clés */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold" style={{ color: "#25245e" }}>{bpf.nb_stagiaires ?? "—"}</p>
                        <p className="text-xs text-gray-500 mt-1">Stagiaires</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold" style={{ color: "#25245e" }}>{bpf.nb_heures_formation ?? "—"}</p>
                        <p className="text-xs text-gray-500 mt-1">Heures de formation</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold" style={{ color: "#25245e" }}>
                          {bpf.ca_formation != null ? `${Number(bpf.ca_formation).toLocaleString("fr-FR")} €` : "—"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">CA formation</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold" style={{ color: "#25245e" }}>
                          {bpf.taux_satisfaction != null ? `${bpf.taux_satisfaction}%` : "—"}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Taux de satisfaction</p>
                      </div>
                    </div>

                    {/* Sous-indicateurs */}
                    <div className="flex gap-6 text-sm text-gray-500 mb-4">
                      {bpf.nb_sessions != null && <span>📅 {bpf.nb_sessions} sessions</span>}
                      {bpf.nb_formations != null && <span>📚 {bpf.nb_formations} formations</span>}
                      {bpf.repartition_thematiques && bpf.repartition_thematiques.length > 0 && (
                        <span>🏷 {bpf.repartition_thematiques.length} thématique(s)</span>
                      )}
                    </div>

                    {/* Répartition thématiques */}
                    {bpf.repartition_thematiques && bpf.repartition_thematiques.length > 0 && (
                      <div className="bg-blue-50 rounded-lg p-3 mb-4">
                        <p className="text-xs font-semibold text-gray-600 mb-2">Répartition thématiques</p>
                        <div className="space-y-1">
                          {bpf.repartition_thematiques.map((t, i) => (
                            <div key={i} className="flex justify-between text-xs text-gray-600">
                              <span className="font-medium">{t.nom}</span>
                              <span>{t.nb_heures}h — {t.nb_stagiaires} stagiaires</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 justify-end">
                      {!bpf.valide && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openEdit(bpf)}>
                            Modifier
                          </Button>
                          <Button
                            size="sm"
                            style={{ background: "#25245e", color: "#fff" }}
                            onClick={() => handleValider(bpf)}
                          >
                            Valider le BPF
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-500 hover:bg-red-50"
                        onClick={() => handleSupprimer(bpf)}
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

      {/* ─── DIALOG CRÉATION / ÉDITION ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: "#25245e" }}>
              {editingId ? `Modifier le BPF ${form.annee}` : "Nouveau Bilan Pédagogique et Financier"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">

            {/* Année */}
            <div className="space-y-2">
              <Label>Année <span className="text-red-500">*</span></Label>
              <Input
                name="annee"
                type="number"
                value={form.annee}
                onChange={handleChange}
                min={2000}
                max={new Date().getFullYear()}
                disabled={!!editingId}
              />
            </div>

            {/* Indicateurs principaux */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Indicateurs pédagogiques</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre de stagiaires</Label>
                  <Input name="nb_stagiaires" type="number" value={form.nb_stagiaires} onChange={handleChange} placeholder="ex: 120" />
                </div>
                <div className="space-y-2">
                  <Label>Heures de formation</Label>
                  <Input name="nb_heures_formation" type="number" value={form.nb_heures_formation} onChange={handleChange} placeholder="ex: 450" />
                </div>
                <div className="space-y-2">
                  <Label>Nombre de sessions</Label>
                  <Input name="nb_sessions" type="number" value={form.nb_sessions} onChange={handleChange} placeholder="ex: 24" />
                </div>
                <div className="space-y-2">
                  <Label>Nombre de formations</Label>
                  <Input name="nb_formations" type="number" value={form.nb_formations} onChange={handleChange} placeholder="ex: 8" />
                </div>
              </div>
            </div>

            {/* Indicateurs financiers */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Indicateurs financiers & qualité</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CA formation (€ HT)</Label>
                  <Input name="ca_formation" type="number" value={form.ca_formation} onChange={handleChange} placeholder="ex: 85000" />
                </div>
                <div className="space-y-2">
                  <Label>Taux de satisfaction (%)</Label>
                  <Input name="taux_satisfaction" type="number" value={form.taux_satisfaction} onChange={handleChange} min={0} max={100} placeholder="ex: 92" />
                </div>
              </div>
            </div>

            {/* Répartition thématiques */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">Répartition thématiques</p>
                <Button type="button" size="sm" variant="outline" onClick={addThematique}>
                  + Ajouter
                </Button>
              </div>
              {thematiques.length === 0 && (
                <p className="text-xs text-gray-400 italic">Aucune thématique — cliquez sur "Ajouter" pour en créer une.</p>
              )}
              <div className="space-y-2">
                {thematiques.map((t, i) => (
                  <div key={i} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
                    <Input
                      placeholder="Thématique (ex: Management)"
                      value={t.nom}
                      onChange={(e) => updateThematique(i, "nom", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="Heures"
                      value={t.nb_heures || ""}
                      onChange={(e) => updateThematique(i, "nb_heures", e.target.value)}
                      className="w-24"
                    />
                    <Input
                      type="number"
                      placeholder="Stagiaires"
                      value={t.nb_stagiaires || ""}
                      onChange={(e) => updateThematique(i, "nb_stagiaires", e.target.value)}
                      className="w-28"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-600 px-2"
                      onClick={() => removeThematique(i)}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ background: "#f2901e", color: "#fff" }}
              className="font-bold"
            >
              {saving ? "Enregistrement..." : editingId ? "Mettre à jour" : "Créer le BPF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default BPF;
