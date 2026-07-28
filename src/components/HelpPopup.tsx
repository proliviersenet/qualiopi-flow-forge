import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSeenHint } from "@/hooks/useSeenHint";
import qualiosAvatar from "@/assets/qualios.png";

interface HelpPopupProps {
  /** Clé unique identifiant ce hint dans `ui_hints_seen` (ex: "bpf_intro"). */
  hintKey: string;
  title: string;
  items: string[];
  cta?: string;
}

// Popup d'aide contextuelle affichée automatiquement une seule fois, la première
// fois qu'un utilisateur arrive sur une page "à étape impactante" (BPF, préparation
// d'audit...). Une fois fermée, elle ne réapparaît plus jamais pour cet utilisateur
// (mémorisée via useSeenHint / table ui_hints_seen).
const HelpPopup = ({ hintKey, title, items, cta = "J'ai compris, c'est parti !" }: HelpPopupProps) => {
  const { seen, markSeen } = useSeenHint(hintKey);

  // seen === null : pas encore chargé — on n'affiche rien pour éviter un flash.
  // seen === true : déjà vue — on n'affiche rien.
  if (seen !== false) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) markSeen(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full overflow-hidden shrink-0" style={{ background: "#25245e" }}>
              <img src={qualiosAvatar} alt="Qualios" className="w-full h-full object-contain" />
            </div>
            <DialogTitle style={{ color: "#25245e" }}>{title}</DialogTitle>
          </div>
        </DialogHeader>
        <ul className="space-y-2.5 text-sm text-gray-700">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-1 shrink-0" style={{ color: "#f2901e" }}>●</span>
              <span>{it}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={markSeen} style={{ background: "#f2901e", color: "#fff" }} className="w-full">
            {cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HelpPopup;
