import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

// Lot 6 du chantier facturation (12/11/2026) : animation du parrainage sur le
// tableau de bord du formateur. Progression vers les badges Membre Argent
// (3 filleuls : +1 mois offert) et Membre Or (5 filleuls : sessions offertes
// pendant 1 an), quota annuel et lien d'invitation. Masquée pendant la bêta
// (mon_parrainage renvoie disponible = false tant que la facturation est coupée).

type Parrainage = {
  disponible: boolean;
  code?: string;
  filleuls_confirmes?: number;
  filleuls_en_attente?: number;
  filleuls_annee?: number;
  max_filleuls_par_an?: number;
  seuil_argent?: number;
  seuil_or?: number;
  badge?: "argent" | "or" | null;
  sessions_offertes_jusqu_au?: string | null;
  parrainage_en_pause_jusqu_au?: string | null;
  mois_restants?: number;
};

const CarteParrainage = () => {
  const { toast } = useToast();
  const [p, setP] = useState<Parrainage | null>(null);

  useEffect(() => {
    (supabase as any).rpc("mon_parrainage").then(({ data }: { data: Parrainage | null }) => setP(data ?? null));
  }, []);

  if (!p?.disponible || !p.code) return null;

  const confirmes = p.filleuls_confirmes ?? 0;
  const argent = p.seuil_argent ?? 3;
  const or = p.seuil_or ?? 5;
  const quota = p.max_filleuls_par_an ?? 5;
  const annee = p.filleuls_annee ?? 0;
  const lien = `${window.location.origin}/register?parrain=${p.code}`;
  const objectif = p.badge === "or" ? or : p.badge === "argent" ? or : argent;
  const pourcent = Math.min(100, Math.round((confirmes / objectif) * 100));
  const reste = Math.max(objectif - confirmes, 0);

  const copier = async () => {
    try { await navigator.clipboard.writeText(lien); toast({ title: "Lien d'invitation copié", description: lien }); }
    catch { toast({ title: "Votre lien d'invitation", description: lien }); }
  };

  return (
    <div className="mb-6 p-4 rounded-lg border bg-white" style={{ borderColor: p.badge === "or" ? "#d4a017" : p.badge === "argent" ? "#a8a9ad" : "#f2901e" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden>{p.badge === "or" ? "🥇" : p.badge === "argent" ? "🥈" : "🤝"}</span>
          <div>
            <p className="font-semibold" style={{ color: "#25245e" }}>
              {p.badge === "or" ? "Membre Or" : p.badge === "argent" ? "Membre Argent" : "Parrainez vos confrères formateurs"}
            </p>
            <p className="text-sm text-gray-600">
              {p.badge === "or"
                ? p.parrainage_en_pause_jusqu_au
                  ? <>Toutes vos sessions sont offertes jusqu'au <strong>{new Date(p.parrainage_en_pause_jusqu_au).toLocaleDateString("fr-FR")}</strong>. Votre code de parrainage est en pause jusqu'à cette date. Merci !</>
                  : <>Chaque nouveau filleul vous offre toujours un mois d'abonnement.</>
                : p.badge === "argent"
                  ? <>Plus que <strong>{reste} filleul{reste > 1 ? "s" : ""}</strong> pour devenir Membre Or : <strong>sessions offertes pendant un an</strong>.</>
                  : <>1 mois offert pour vous et votre filleul. Plus que <strong>{reste} filleul{reste > 1 ? "s" : ""}</strong> pour le badge Argent (+1 mois bonus).</>}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!p.parrainage_en_pause_jusqu_au && (
            <Button size="sm" style={{ background: "#f2901e", color: "#fff" }} onClick={copier}>Copier mon lien d'invitation</Button>
          )}
          <Link to="/factures"><Button size="sm" variant="outline">Mes parrainages</Button></Link>
        </div>
      </div>

      {p.badge !== "or" && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{confirmes} filleul{confirmes > 1 ? "s" : ""} confirmé{confirmes > 1 ? "s" : ""}{p.filleuls_en_attente ? ` · ${p.filleuls_en_attente} en essai` : ""}</span>
            <span>🥈 {argent} · 🥇 {or}</span>
          </div>
          <Progress value={pourcent} />
        </div>
      )}
      <p className="text-xs text-gray-500 mt-2">
        Code : <span className="font-mono font-semibold">{p.code}</span> · {annee}/{quota} filleuls cette année
        {(p.mois_restants ?? 0) > 0 ? ` · ${p.mois_restants} mois offert${(p.mois_restants ?? 0) > 1 ? "s" : ""} à venir` : ""}
      </p>
    </div>
  );
};

export default CarteParrainage;
