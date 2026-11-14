// Offre commerciale QualioFlex affichée sur les pages publiques (accueil, CGV,
// FAQ, documentation). Source de vérité facturée : table public.tarifs (réglable
// depuis Superadmin → Abonnements & parrainage → Tarifs et règles). Les pages
// publiques ne peuvent pas lire cette table sans connexion : en cas de
// changement de prix, mettre à jour ces valeurs dans le même temps.
// Décisions Olivier du 09 au 12/11/2026 (chantier facturation).

export const OFFRE = {
  abonnementHt: 34.9,
  sessionHt: 3,
  exportHt: 10,
  tva: 0.2,
  essaiJours: 7,
  preavisJours: 30,
  delaiAnnulationSessionHeures: 48,
  delaiSuspensionImpayeJours: 10,
  parrainage: {
    moisOffertsParFilleul: 1,
    maxFilleulsParAn: 5,
    seuilArgent: 3,
    seuilOr: 5,
    dureeSessionsOffertesMois: 12,
  },
} as const;

export const euros = (montant: number, decimales = 2) =>
  montant.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: decimales, maximumFractionDigits: decimales });

export const ttc = (ht: number) => Math.round(ht * (1 + OFFRE.tva) * 100) / 100;

export const EXSENCO_URL = "https://exsenco.fr";
export const CONTACT_EMAIL = "olivier@exsenco.fr";
