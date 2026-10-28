import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSeenHint } from "@/hooks/useSeenHint";
import { loadFormateurItems, loadClientItems, type ChecklistItem } from "@/lib/onboardingSteps";
import qualiosAvatar from "@/assets/qualios.png";

// Guide pas-à-pas contextuel (chantier onboarding, inspiré d'un tunnel vu
// par Olivier chez un autre produit) : plutôt qu'un seul popup listant
// toutes les étapes (OnboardingChecklist, toujours disponible via la bulle
// "?"), ce composant affiche UNE bulle à la fois, positionnée directement
// sur l'élément réel à utiliser (bouton "Créer une formation", champ logo,
// lien BPF...), repérable via un attribut data-onboarding="<id>" posé sur
// cet élément dans la page concernée.
//
// La progression suit exactement la même source de vérité que
// OnboardingChecklist (src/lib/onboardingSteps.ts) : dès qu'une étape est
// réellement complétée (logo chargé, formation créée...), la bulle
// correspondante disparaît et celle de l'étape suivante apparaît — rien à
// synchroniser manuellement entre les deux affichages.
//
// Chaque bulle ne s'affiche qu'une fois : un clic sur "C'est noté" la
// marque comme vue (table ui_hints_seen, même mécanisme que les autres
// indices contextuels de l'appli) et elle ne revient plus, même si l'étape
// reste à faire — pour rester un simple coup de pouce, jamais insistant.
const BUBBLE_WIDTH = 280;
const MARGIN = 10;

interface Rect { top: number; left: number; width: number; height: number }

const OnboardingSpotlight = () => {
  const { user } = useAuth();
  const location = useLocation();
  const role: "formateur" | "client" | null = user
    ? (user.user_metadata?.role === "client" ? "client" : "formateur")
    : null;

  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubblePos, setBubblePos] = useState<{ top: number; left: number; placement: "below" | "above" } | null>(null);

  // Même chargement que OnboardingChecklist, relancé à chaque changement de
  // page pour détecter une étape tout juste complétée (ex. retour sur
  // /formations après avoir créé sa 1ère formation).
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
  }, [user, location.pathname]);

  const currentStep = items?.find((i) => !i.info && !i.done && i.id) ?? null;

  const { seen, markSeen } = useSeenHint(currentStep?.id ? `onboarding_spot_${currentStep.id}` : null);

  // Recherche de l'élément cible sur la page actuelle, avec quelques
  // tentatives espacées : certains éléments (ex. champs du profil) ne sont
  // montés qu'après la fin du chargement de la page, donc absents au tout
  // premier rendu.
  const locateTarget = useCallback(() => {
    if (!currentStep?.id || seen !== false) { setTargetRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-onboarding="${currentStep.id}"]`);
    if (!el) { setTargetRect(null); return; }
    const r = el.getBoundingClientRect();
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [currentStep?.id, seen]);

  useEffect(() => {
    setTargetRect(null);
    setBubblePos(null);
    if (!currentStep?.id || seen !== false) return;

    locateTarget();
    const retries = [150, 400, 900, 1600];
    const timers = retries.map((ms) => setTimeout(locateTarget, ms));

    const onScrollOrResize = () => locateTarget();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [currentStep?.id, seen, locateTarget, location.pathname]);

  // Une fois la cible repérée, on mesure la bulle réellement rendue (hors
  // champ, opacité 0) pour la positionner sans qu'elle déborde de l'écran,
  // puis on l'affiche.
  useLayoutEffect(() => {
    if (!targetRect || !bubbleRef.current) { setBubblePos(null); return; }
    const bubbleHeight = bubbleRef.current.offsetHeight || 120;

    const spaceBelow = window.innerHeight - (targetRect.top + targetRect.height);
    const placement: "below" | "above" = spaceBelow < bubbleHeight + MARGIN + 20 && targetRect.top > bubbleHeight + MARGIN
      ? "above"
      : "below";

    const top = placement === "below"
      ? targetRect.top + targetRect.height + MARGIN
      : targetRect.top - bubbleHeight - MARGIN;

    let left = targetRect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - BUBBLE_WIDTH - 8));

    setBubblePos({ top, left, placement });
  }, [targetRect]);

  if (!role || !currentStep?.id || seen !== false || !targetRect) return null;

  return (
    <>
      {/* Anneau discret autour de l'élément à utiliser */}
      <div
        className="fixed z-40 rounded-lg pointer-events-none transition-all duration-200"
        style={{
          top: targetRect.top - 4,
          left: targetRect.left - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
          boxShadow: "0 0 0 2px #f2901e, 0 0 0 6px rgba(242,144,30,0.25)",
        }}
      />

      {/* Bulle d'explication */}
      <div
        ref={bubbleRef}
        className="fixed z-40 bg-white rounded-xl shadow-xl border p-4"
        style={{
          width: BUBBLE_WIDTH,
          borderColor: "#f2901e",
          top: bubblePos ? bubblePos.top : targetRect.top,
          left: bubblePos ? bubblePos.left : targetRect.left,
          opacity: bubblePos ? 1 : 0,
          transition: "opacity 150ms ease",
        }}
      >
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-full overflow-hidden shrink-0" style={{ background: "#25245e" }}>
            <img src={qualiosAvatar} alt="Qualios" className="w-full h-full object-contain" />
          </div>
          <p className="text-sm text-gray-700 leading-snug">{currentStep.label}</p>
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={markSeen}
            className="text-xs font-bold rounded-md px-3 py-1.5"
            style={{ background: "#25245e", color: "#fff" }}
          >
            C'est noté
          </button>
        </div>
      </div>
    </>
  );
};

export default OnboardingSpotlight;
