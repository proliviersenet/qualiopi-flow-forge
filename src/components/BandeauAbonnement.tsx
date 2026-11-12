import { Link } from "react-router-dom";
import { useStatutAbonnement } from "@/hooks/useStatutAbonnement";

// Chantier facturation, lot 2 (retour test Olivier 12/11/2026) : la date de
// fin d'essai et l'accès à la gestion de la carte n'étaient visibles que dans
// le menu « Abonnement et factures ». Bandeau discret affiché sous l'en-tête,
// sur toutes les pages formateur, uniquement quand il y a quelque chose à
// signaler : essai en cours, paiement en échec, résiliation programmée.
// Rien n'est affiché pendant la bêta (facturation coupée) ni pour les
// ambassadeurs exemptés.

const joursRestants = (iso: string) =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

const BandeauAbonnement = () => {
  const { statut } = useStatutAbonnement();
  if (!statut?.facturation_active || statut.type_compte === "super_ambassadeur") return null;

  let message: string | null = null;
  let style = "bg-blue-50 text-blue-900 border-blue-200";
  let lien = "Gérer mon abonnement";

  if (statut.statut === "essai" && statut.fin_essai) {
    const j = joursRestants(statut.fin_essai);
    message = `Essai gratuit : ${j === 0 ? "dernier jour" : `plus que ${j} jour${j > 1 ? "s" : ""}`} (jusqu'au ${dateFr(statut.fin_essai)}). Votre abonnement démarrera automatiquement.`;
  } else if (statut.statut === "impaye") {
    message = `Le dernier paiement a échoué${statut.coupure_prevue_le ? ` : votre accès sera suspendu le ${dateFr(statut.coupure_prevue_le)} sans mise à jour de votre carte` : ""}.`;
    style = "bg-red-50 text-red-900 border-red-200";
    lien = "Mettre à jour ma carte";
  } else if (statut.statut === "resiliation_programmee" && statut.resiliation_effective_le) {
    message = `Votre abonnement prendra fin le ${dateFr(statut.resiliation_effective_le)}.`;
    style = "bg-orange-50 text-orange-900 border-orange-200";
  }

  if (!message) return null;

  return (
    <div className={`border-b ${style}`}>
      <div className="container mx-auto px-4 py-2 text-sm flex flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        <Link to="/factures" className="font-semibold underline whitespace-nowrap">{lien} →</Link>
      </div>
    </div>
  );
};

export default BandeauAbonnement;
