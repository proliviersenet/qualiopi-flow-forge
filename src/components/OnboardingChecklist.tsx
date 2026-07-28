import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, Check, Circle, Info } from "lucide-react";
import { useSeenHint } from "@/hooks/useSeenHint";
import qualiosAvatar from "@/assets/qualios.png";

interface ChecklistItem {
  label: string;
  href: string;
  /** Étape purement informative (pas de suivi de complétion — pas de coche). */
  info?: boolean;
  done: boolean;
}

// Checklist de bienvenue affichée automatiquement à la 1ère connexion (formateur
// ou client), présentée par Qualios. Les cases se cochent toutes seules au fur et
// à mesure que l'utilisateur avance réellement (profil complété, logo chargé,
// 1ère formation créée...) — ce n'est pas juste un diaporama figé. Une fois vue
// une 1ère fois, elle reste accessible via la petite bulle "?" en bas à gauche.
const OnboardingChecklist = () => {
  const { user } = useAuth();
  const role: "formateur" | "client" | null = user
    ? (user.user_metadata?.role === "client" ? "client" : "formateur")
    : null;
  const [items, setItems] = useState<ChecklistItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const { seen, markSeen } = useSeenHint(role ? "onboarding_tour" : null);

  const loadFormateurItems = useCallback(async (userId: string): Promise<ChecklistItem[] | null> => {
    const { data: profile } = await supabase.from("profiles").select("organisme_id").eq("id", userId).single();
    if (!profile?.organisme_id) return null;
    const orgId = profile.organisme_id;

    const [{ data: org }, { count: nbFormations }, { count: nbClients }, { data: bpfHint }] = await Promise.all([
      supabase.from("organismes").select("siret, nda, raison_sociale, adresse, logo_url").eq("id", orgId).single(),
      supabase.from("formations").select("*", { count: "exact", head: true }).eq("organisme_id", orgId),
      supabase.from("clients").select("*", { count: "exact", head: true }).eq("organisme_id", orgId),
      supabase.from("ui_hints_seen").select("hint_key").eq("user_id", userId).eq("hint_key", "bpf_intro").maybeSingle(),
    ]);

    return [
      {
        label: "Compléter le profil de ton organisme (raison sociale, SIRET, NDA, adresse)",
        href: "/profile",
        done: !!(org?.siret && org?.nda && org?.raison_sociale && org?.adresse),
      },
      { label: "Charger le logo de ton organisme", href: "/profile", done: !!org?.logo_url },
      { label: "Créer ta première formation", href: "/formations/creation", done: (nbFormations ?? 0) > 0 },
      { label: "Inviter ton premier client", href: "/clients", done: (nbClients ?? 0) > 0 },
      { label: "Découvrir le module BPF (déclaration annuelle DREETS)", href: "/bpf", done: !!bpfHint },
    ];
  }, []);

  const loadClientItems = useCallback(async (email: string): Promise<ChecklistItem[] | null> => {
    const { data: client } = await supabase.from("clients").select("id").eq("contact_email", email).single();
    if (!client?.id) return null;

    const { data: sessions } = await supabase.from("sessions").select("id").eq("client_id", client.id);
    const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);

    let hasStagiaires = false;
    let hasSignedConvention = false;

    if (sessionIds.length > 0) {
      const { count } = await supabase
        .from("stagiaires")
        .select("*", { count: "exact", head: true })
        .in("session_id", sessionIds);
      hasStagiaires = (count ?? 0) > 0;

      const { data: docs } = await supabase
        .from("documents_formation")
        .select("id")
        .eq("type", "convention")
        .in("session_id", sessionIds);
      const docIds = (docs ?? []).map((d: { id: string }) => d.id);

      if (docIds.length > 0) {
        const { data: sigs } = await supabase
          .from("signatures")
          .select("statut")
          .in("document_id", docIds)
          .eq("statut", "signe");
        hasSignedConvention = (sigs?.length ?? 0) > 0;
      }
    }

    return [
      { label: "Découvrir tes sessions de formation dans ton espace client", href: "/espace-client", done: sessionIds.length > 0 },
      { label: "Signer la convention de formation envoyée par ton formateur", href: "/espace-client", done: hasSignedConvention },
      { label: "Importer la liste de tes stagiaires (prénom, nom, mobile, email)", href: "/espace-client", done: hasStagiaires },
      { label: "Retrouver l'émargement, les évaluations et l'attestation en fin de formation", href: "/espace-client", info: true, done: false },
    ];
  }, []);

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
  }, [user, loadFormateurItems, loadClientItems]);

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
                  {role === "formateur" ? "Bienvenue sur QalioFlex !" : "Bienvenue dans ton espace client !"}
                </DialogTitle>
                <p className="text-xs text-gray-400">{doneCount}/{trackable.length} étapes complétées</p>
              </div>
            </div>
          </DialogHeader>

          <p className="text-sm text-gray-600 -mt-2">
            Je suis Qualios 🪽 — voici les premières étapes pour bien démarrer :
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
