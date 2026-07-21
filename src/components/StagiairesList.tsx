import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface Stagiaire {
  id: string;
  nom: string;
  prenom: string;
  email_pro: string;
  telephone: string;
  doc_convention?: string | null;
  doc_programme?: string | null;
  doc_emargement?: string | null;
  doc_attestation?: string | null;
  formation_titre?: string;
}

const docStatus = (val: string | null | undefined) => {
  if (!val) return { label: "En attente", color: "bg-gray-100 text-gray-400" };
  if (val === "envoye") return { label: "Envoyé", color: "bg-blue-100 text-blue-600" };
  if (val === "signe") return { label: "Signé ✓", color: "bg-green-100 text-green-700" };
  if (val === "erreur") return { label: "Erreur ⚠️", color: "bg-red-100 text-red-600" };
  return { label: val, color: "bg-gray-100 text-gray-500" };
};

const motifs = [
  { value: "convention", label: "Convention de formation" },
  { value: "emargement", label: "Feuille d'émargement" },
  { value: "attestation", label: "Attestation de fin" },
  { value: "questionnaire", label: "Questionnaire de satisfaction" },
];

const StagiairesList = ({
  sessionId,
  canRelance = false,
  envoye_par = "formateur",
  canal = "les_deux",
  formationTitre = "",
}: {
  sessionId: string;
  canRelance?: boolean;
  envoye_par?: "auto" | "formateur" | "client";
  canal?: "email" | "sms" | "les_deux";
  formationTitre?: string;
}) => {
  const { toast } = useToast();
  const [stagiaires, setStagiaires] = useState<Stagiaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [relancing, setRelancing] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editForm, setEditForm] = useState({ nom: "", prenom: "", email_pro: "", telephone: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("stagiaires")
        .select("*")
        .eq("session_id", sessionId)
        .order("nom");
      setStagiaires((data as Stagiaire[]) || []);
      setLoading(false);
    };
    fetch();
  }, [sessionId]);

  const openEdit = (s: Stagiaire) => {
    setEditingId(s.id);
    setEditForm({ nom: s.nom, prenom: s.prenom, email_pro: s.email_pro, telephone: s.telephone });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    const { error } = await supabase.from("stagiaires").update({
      nom: editForm.nom,
      prenom: editForm.prenom,
      email_pro: editForm.email_pro,
      telephone: editForm.telephone,
    }).eq("id", editingId);
    setSaving(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setEditingId(null);
    toast({ title: "Stagiaire mis à jour" });
    const { data } = await supabase.from("stagiaires").select("*").eq("session_id", sessionId).order("nom");
    setStagiaires((data as Stagiaire[]) || []);
  };

  const deleteStagiaire = async (id: string) => {
    if (!confirm("Supprimer ce stagiaire ?")) return;
    const { error } = await supabase.from("stagiaires").delete().eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setStagiaires(prev => prev.filter(s => s.id !== id));
    toast({ title: "Stagiaire supprimé" });
  };

  const addStagiaire = async () => {
    if (!editForm.nom || !editForm.prenom) {
      toast({ title: "Nom et prénom obligatoires", variant: "destructive" }); return;
    }
    setSaving(true);
    const { data: session } = await supabase.from("sessions").select("client_id").eq("id", sessionId).single();
    const { error } = await supabase.from("stagiaires").insert({
      session_id: sessionId,
      client_id: (session as Record<string, string>)?.client_id || null,
      nom: editForm.nom,
      prenom: editForm.prenom,
      email_pro: editForm.email_pro,
      telephone: editForm.telephone,
    });
    setSaving(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setShowAddForm(false);
    setEditForm({ nom: "", prenom: "", email_pro: "", telephone: "" });
    toast({ title: "Stagiaire ajouté" });
    const { data } = await supabase.from("stagiaires").select("*").eq("session_id", sessionId).order("nom");
    setStagiaires((data as Stagiaire[]) || []);
  };

  const handleRelance = async (stagiaire: Stagiaire, motif: string) => {
    setRelancing(stagiaire.id + motif);
    try {
      const { data, error } = await supabase.functions.invoke("envoyer-relance", {
        body: {
          prenom: stagiaire.prenom,
          nom: stagiaire.nom,
          email: stagiaire.email_pro,
          telephone: stagiaire.telephone,
          formation_titre: formationTitre,
          motif,
          canal,
          envoye_par,
        },
      });

      console.log("Réponse relance:", JSON.stringify(data), JSON.stringify(error));

      if (error) {
        // Extraire le vrai message depuis la réponse HTTP
        let errMsg = error.message || "Erreur inconnue";
        try {
          const ctx = await (error as Record<string, unknown>)?.context;
          if (ctx) errMsg = JSON.stringify(ctx);
        } catch {}
        throw new Error(errMsg);
      }

      if (data?.error) throw new Error(data.error);

      toast({
        title: "✅ Relance envoyée",
        description: `${stagiaire.prenom} ${stagiaire.nom} relancé${canal === "les_deux" ? " par email et SMS" : ` par ${canal}`}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast({ title: "Erreur relance", description: msg, variant: "destructive" });
    } finally {
      setRelancing(null);
    }
  };

  if (loading) return <p className="text-xs text-gray-400">Chargement des stagiaires...</p>;
  if (stagiaires.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">
          👥 Stagiaires ({stagiaires.length})
        </p>
        {canRelance && (
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setShowAddForm(true); setEditForm({ nom: "", prenom: "", email_pro: "", telephone: "" }); }}>
            + Ajouter un stagiaire
          </Button>
        )}
      </div>

      {/* Formulaire ajout */}
      {showAddForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 space-y-2">
          <p className="text-xs font-semibold text-blue-700 mb-2">Nouveau stagiaire</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Prénom *" value={editForm.prenom} onChange={e => setEditForm(p => ({ ...p, prenom: e.target.value }))} className="h-7 text-xs" />
            <Input placeholder="Nom *" value={editForm.nom} onChange={e => setEditForm(p => ({ ...p, nom: e.target.value }))} className="h-7 text-xs" />
            <Input placeholder="Email pro" value={editForm.email_pro} onChange={e => setEditForm(p => ({ ...p, email_pro: e.target.value }))} className="h-7 text-xs" />
            <Input placeholder="Mobile (0612345678)" value={editForm.telephone} onChange={e => setEditForm(p => ({ ...p, telephone: e.target.value }))} className="h-7 text-xs" />
          </div>
          <div className="flex gap-2 mt-2">
            <Button size="sm" className="h-7 text-xs" style={{ background: "#f2901e", color: "#fff" }} onClick={addStagiaire} disabled={saving}>{saving ? "..." : "Ajouter"}</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddForm(false)}>Annuler</Button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 pr-3 text-gray-500 font-medium">Nom</th>
              <th className="text-left py-2 pr-3 text-gray-500 font-medium">Prénom</th>
              <th className="text-left py-2 pr-3 text-gray-500 font-medium">Email</th>
              <th className="text-left py-2 pr-3 text-gray-500 font-medium">Mobile</th>
              <th className="text-left py-2 pr-2 text-gray-500 font-medium">Convention</th>
              <th className="text-left py-2 pr-2 text-gray-500 font-medium">Émargement</th>
              <th className="text-left py-2 pr-2 text-gray-500 font-medium">Attestation</th>
              {canRelance && <th className="text-left py-2 pr-2 text-gray-500 font-medium">Relance</th>}
              {canRelance && <th className="text-left py-2 text-gray-500 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {stagiaires.map((s) => {
              const convention = docStatus(s.doc_convention);
              const emargement = docStatus(s.doc_emargement);
              const attestation = docStatus(s.doc_attestation);
              const allSigned = s.doc_convention === "signe" && s.doc_emargement === "signe" && s.doc_attestation === "signe";
              const needsRelance = !allSigned;

              return (
                <>
                <tr key={s.id} className={`border-b border-gray-50 ${allSigned ? "bg-green-50" : ""}`}>
                  <td className="py-2 pr-3 font-medium text-gray-800">{s.nom}</td>
                  <td className="py-2 pr-3 text-gray-700">{s.prenom}</td>
                  <td className="py-2 pr-3 text-gray-500">{s.email_pro || "—"}</td>
                  <td className="py-2 pr-3 text-gray-500">{s.telephone || "—"}</td>
                  <td className="py-2 pr-2">
                    <Badge className={`text-xs px-1.5 py-0.5 ${convention.color}`}>{convention.label}</Badge>
                  </td>
                  <td className="py-2 pr-2">
                    <Badge className={`text-xs px-1.5 py-0.5 ${emargement.color}`}>{emargement.label}</Badge>
                  </td>
                  <td className="py-2 pr-2">
                    <Badge className={`text-xs px-1.5 py-0.5 ${attestation.color}`}>{attestation.label}</Badge>
                  </td>
                  {canRelance && (
                    <td className="py-2 pr-2">
                      {needsRelance ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-orange-300 text-orange-600 hover:bg-orange-50" disabled={relancing !== null}>
                              {relancing?.startsWith(s.id) ? "..." : "📨 Relancer"}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {motifs.map(m => (
                              <DropdownMenuItem key={m.value} onClick={() => handleRelance(s, m.value)} className="text-xs cursor-pointer">{m.label}</DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-xs text-green-600">✓ Complet</span>
                      )}
                    </td>
                  )}
                  {canRelance && (
                    <td className="py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => openEdit(s)}>✏️</Button>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-red-200 text-red-500 hover:bg-red-50" onClick={() => deleteStagiaire(s.id)}>🗑</Button>
                      </div>
                    </td>
                  )}
                </tr>
                {/* Formulaire édition inline */}
                {editingId === s.id && (
                  <tr>
                    <td colSpan={8} className="py-2 px-0">
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-yellow-700">Modifier le stagiaire</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Prénom" value={editForm.prenom} onChange={e => setEditForm(p => ({ ...p, prenom: e.target.value }))} className="h-7 text-xs" />
                          <Input placeholder="Nom" value={editForm.nom} onChange={e => setEditForm(p => ({ ...p, nom: e.target.value }))} className="h-7 text-xs" />
                          <Input placeholder="Email pro" value={editForm.email_pro} onChange={e => setEditForm(p => ({ ...p, email_pro: e.target.value }))} className="h-7 text-xs" />
                          <Input placeholder="Mobile" value={editForm.telephone} onChange={e => setEditForm(p => ({ ...p, telephone: e.target.value }))} className="h-7 text-xs" />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs" style={{ background: "#f2901e", color: "#fff" }} onClick={saveEdit} disabled={saving}>{saving ? "..." : "Enregistrer"}</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>Annuler</Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Résumé avancement */}
      <div className="mt-3 flex gap-4 text-xs text-gray-500">
        <span>⏳ En attente : {stagiaires.filter(s => !s.doc_convention).length}</span>
        <span>📤 Envoyés : {stagiaires.filter(s => s.doc_convention === "envoye").length}</span>
        <span>✅ Complets : {stagiaires.filter(s => s.doc_convention === "signe" && s.doc_emargement === "signe" && s.doc_attestation === "signe").length}</span>
        {canRelance && stagiaires.filter(s => s.doc_convention !== "signe").length > 0 && (
          <span className="text-orange-500 font-medium">
            ⚠️ {stagiaires.filter(s => s.doc_convention !== "signe").length} en attente de signature
          </span>
        )}
      </div>
    </div>
  );
};

export default StagiairesList;
