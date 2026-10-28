import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, Check, Circle, Info } from "lucide-react";
import { useSeenHint } from "@/hooks/useSeenHint";
import { loadFormateurItems, loadClientItems, type ChecklistItem } from "@/lib/onboardingSteps";
import qualiosAvatar from "@/assets/qualios.png";

// Checklist de bienvenue affichée automatiquement à la 1ère connexion (formateur
// ou client), présentée par Qualios : une vue d'ensemble de toutes les étapes et
// de la progression. Les cases se cochent toutes seules au fur et à mesure que
// l'utilisateur avance réellement (profil complété, logo chargé, 1ère formation
// créée...) — ce n'est pas juste un diaporama figé. Une fois vue une 1ère fois,
// elle reste accessible via la petite bulle "?" en bas à gauche.
//
// Chantier onboarding pas-à-pas : en complément de cette vue d'ensemble, des
// bulles contextuelles (OnboardingSpotlight, montée séparément dans App.tsx)
// pointent en direct, une à la fois, l'élément exact à utiliser sur chaque
// écran — les deux partagent la même logique de progression (src/lib/
// onboardingSteps.ts) pour ne jamais se désynchroniser.
const OnboardingChecklist = () => {
  const { user } = useAuth();
  const role: "formateur" | "client" | null = user
    ? (user.user_metadata?.role === "client" ? "client" : "formateur")
    : null;
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const { seen, markSeen } = useSeenHint(role ? "onboarding_tour" : null);

  // La session vient du contexte d'authentification partagé (AuthContext) — une
  // seule vérification pour toute l'appli — plutôt que d'un appel indépendant ici.
  useEffect(() => {
    let cancelled = false;
    if (!user) { setItems(null); return; }

    const isClient = user.user_metadata?.role === "client";
    const load = async () => {
      const data = isClient ? await loadClientItems(user.email || "") : await loadFormateurItems(user.id);
      if (!cancelled) setItems(data);
    };

    load();
    return () => { cancelled = true; };
  }, [user]);

  // Ouverture automatique, une seule fois, dès que le contenu est prêt.
  useEffect(() => {
    if (seen === false && items && items.length > 0) setOpen(true);
  }, [seen, items]);

  if (!role || !items) return null;

  const trackable = items.filter(i => !i.info);
  const doneCount = trackable.filter(i => i.done).length;
  const allDone = doneCount === trackable.length;

  const handleClose = () => {
    setOpen(false);
    if (seen === false) markSeen();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full overflow-hidden shrink-0" style={{ background: "#25245e" }}>
                <img src={qualiosAvatar} alt="Qualios" className="w-full h-full object-contain" />
              </div>
              <div>
                <DialogTitle style={{ color: "#25245e" }}>
                  {role === "formateur" ? "Bienvenue sur QualioFlex !" : "Bienvenue dans ton espace client !"}
                </DialogTitle>
                <p className="text-xs text-gray-400">{doneCount}/{trackable.length} étapes complétées</p>
              </div>
            </div>
          </DialogHeader>

          <p className="text-sm text-gray-600 -mt-2">
            Je suis Qualios 🪽 — voici les premières étapes pour bien démarrer. Je te montrerai aussi en direct, sur chaque écran, où cliquer :
          </p>

          <ul className="space-y-2.5 mt-1">
            {items.map((it, i) => (
              <li key={i}>
                <a href={it.href} className="flex items-start gap-2.5 text-sm group" onClick={handleClose}>
                  {it.info ? (
                    <Info size={16} className="mt-0.5 shrink-0 text-blue-400" />
                  ) : it.done ? (
                    <Check size={16} className="mt-0.5 shrink-0 text-green-600" />
                  ) : (
                    <Circle size={16} className="mt-0.5 shrink-0 text-gray-300" />
                  )}
                  <span className={!it.info && it.done ? "text-gray-400 line-through" : "text-gray-700 group-hover:underline"}>
                    {it.label}
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button onClick={handleClose} style={{ background: "#f2901e", color: "#fff" }} className="w-full">
              {allDone ? "Parfait, continuer 🎉" : "C'est parti !"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 left-5 z-40 w-11 h-11 rounded-full shadow-lg flex items-center justify-center bg-white border border-gray-200 hover:scale-105 transition-transform"
          aria-label="Revoir les étapes de prise en main"
          title="Revoir les étapes de prise en main"
        >
          <HelpCircle size={20} style={{ color: "#25245e" }} />
        </button>
      )}
    </>
  );
};

export default OnboardingChecklist;
