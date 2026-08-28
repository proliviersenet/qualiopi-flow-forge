import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { extractFunctionErrorMessage } from "@/lib/functionsError";

interface ResultatFormateur {
  organisme_id: string;
  raison_sociale: string;
  formateur_profile_id: string;
  formateur_nom: string;
}

// Chantier "sous-traitance" (28/08) : modal ouverte par le bouton "🤝 Sous-traiter
// cette formation" sur une session dans ClientDetail.tsx. Deux façons d'assigner un
// sous-traitant : le retrouver dans l'annuaire QalioFlex (recherche par nom/raison
// sociale) ou l'inviter par email s'il n'a pas encore de compte formateur — mêmes
// choix qu'Olivier a validés pour ce chantier. Toute la logique d'assignation vit
// côté Edge Function (assigner-soustraitance) : ce composant ne fait qu'appeler l'API
// et remonter le résultat au parent (onAssigned) pour rafraîchir la liste.
const SoustraiterSessionDialog = ({
  sessionId,
  formationTitre,
  onClose,
  onAssigned,
}: {
  sessionId: string;
  formationTitre: string;
  onClose: () => void;
  onAssigned: () => void;
}) => {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [resultats, setResultats] = useState<ResultatFormateur[] | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const rechercher = async () => {
    if (query.trim().length < 2) {
      toast({ title: "Saisissez au moins 2 caractères", variant: "destructive" });
      return;
    }
    setSearching(true);
    setResultats(null);
    try {
      const { data, error } = await supabase.functions.invoke("rechercher-formateur", { body: { query: query.trim() } });
      if (error || data?.error) throw new Error(data?.error || (error ? await extractFunctionErrorMessage(error) : "Erreur de recherche."));
      setResultats(data?.resultats || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur de recherche.";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const choisirFormateur = async (f: ResultatFormateur) => {
    setAssigning(f.organisme_id);
    try {
      const { data, error } = await supabase.functions.invoke("assigner-soustraitance", {
        body: { session_id: sessionId, mode: "existing", organisme_sous_traitant_id: f.organisme_id, formateur_profile_id: f.formateur_profile_id },
      });
      if (error || data?.error) throw new Error(data?.error || (error ? await extractFunctionErrorMessage(error) : "Erreur d'assignation."));
      toast({ title: "✅ Sous-traitant assigné", description: `${f.formateur_nom} a été notifié par email.` });
      onAssigned();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur d'assignation.";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setAssigning(null);
    }
  };

  const envoyerInvitation = async () => {
    if (!inviteEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      toast({ title: "Email invalide", variant: "destructive" });
      return;
    }
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("assigner-soustraitance", {
        body: { session_id: sessionId, mode: "invite", email: inviteEmail.trim() },
      });
      if (error || data?.error) throw new Error(data?.error || (error ? await extractFunctionErrorMessage(error) : "Erreur d'invitation."));
      toast({
        title: data?.compte_existant ? "✅ Sous-traitant assigné" : "✉️ Invitation envoyée",
        description: data?.compte_existant
          ? `${inviteEmail} a été notifié par email.`
          : `${inviteEmail} va recevoir un email pour créer son espace formateur.`,
      });
      onAssigned();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur d'invitation.";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ color: "#25245e" }}>🤝 Sous-traiter "{formationTitre}"</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500 -mt-2">
          Le formateur sous-traitant aura son propre espace QalioFlex et pourra animer cette session (émargement, questionnaires, attestation) — elle apparaîtra aussi dans son BPF et son suivi Qualiopi.
        </p>

        <Tabs defaultValue="recherche">
          <TabsList className="mb-2">
            <TabsTrigger value="recherche">Rechercher un formateur</TabsTrigger>
            <TabsTrigger value="invite">Inviter par email</TabsTrigger>
          </TabsList>

          <TabsContent value="recherche" className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Nom ou raison sociale..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && rechercher()}
              />
              <Button onClick={rechercher} disabled={searching} style={{ background: "#25245e", color: "#fff" }}>
                {searching ? "..." : "Chercher"}
              </Button>
            </div>
            {resultats !== null && resultats.length === 0 && (
              <p className="text-sm text-gray-400">Aucun formateur trouvé sur QalioFlex avec ce nom — utilisez plutôt l'invitation par email.</p>
            )}
            {resultats && resultats.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {resultats.map(f => (
                  <div key={f.organisme_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{f.formateur_nom}</p>
                      <p className="text-xs text-gray-400">{f.raison_sociale}</p>
                    </div>
                    <Button
                      size="sm"
                      disabled={assigning !== null}
                      onClick={() => choisirFormateur(f)}
                      style={{ background: "#f2901e", color: "#fff" }}
                    >
                      {assigning === f.organisme_id ? "..." : "Choisir"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="invite" className="space-y-3">
            <div className="space-y-2">
              <Label>Email du formateur sous-traitant</Label>
              <Input
                type="email"
                placeholder="formateur@exemple.fr"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && envoyerInvitation()}
              />
              <p className="text-xs text-gray-400">
                S'il n'a pas encore de compte QalioFlex, un email l'invite à créer son espace formateur — la session lui sera automatiquement rattachée une fois son compte créé.
              </p>
            </div>
            <Button onClick={envoyerInvitation} disabled={inviting} className="w-full font-bold" style={{ background: "#f2901e", color: "#fff" }}>
              {inviting ? "Envoi..." : "Envoyer l'invitation"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SoustraiterSessionDialog;
