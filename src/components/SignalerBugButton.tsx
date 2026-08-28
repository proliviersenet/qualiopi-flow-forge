import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { logBug } from "@/lib/bugReport";
import { useAuth } from "@/contexts/AuthContext";
import { Bug } from "lucide-react";

// Chantier "superadmin" (28/08) : bouton discret accessible à tout utilisateur
// connecté (formateur ET client) pour signaler un souci rencontré. Alimente la
// même table "bugs" que la capture automatique (source="manuel"), visible dans
// le flux d'alertes de l'espace superadmin (Olivier uniquement).
const SignalerBugButton = () => {
  const { session } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [envoi, setEnvoi] = useState(false);

  if (!session) return null;

  const envoyer = async () => {
    if (description.trim().length < 5) {
      toast({ title: "Décris un peu plus le souci rencontré", variant: "destructive" });
      return;
    }
    setEnvoi(true);
    await logBug({ source: "manuel", type: "signalement_utilisateur", message: description.trim() });
    setEnvoi(false);
    setOpen(false);
    setDescription("");
    toast({ title: "✅ Signalement envoyé", description: "Merci, le problème remonte directement à l'équipe QalioFlex." });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-30 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 bg-white/80 hover:bg-white border border-gray-200 rounded-full px-3 py-1.5 shadow-sm transition-colors"
        title="Signaler un bug"
      >
        <Bug className="h-3.5 w-3.5" />
        Signaler un bug
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: "#25245e" }}>🐞 Signaler un bug</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 -mt-2">
            Décris ce qui ne fonctionne pas comme attendu. On récupère automatiquement la page où tu te trouves.
          </p>
          <Textarea
            placeholder="Ex : le bouton 'Générer' de l'émargement ne réagit pas quand je clique dessus..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={5}
          />
          <Button onClick={envoyer} disabled={envoi} className="w-full font-bold" style={{ background: "#f2901e", color: "#fff" }}>
            {envoi ? "Envoi..." : "Envoyer le signalement"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SignalerBugButton;
