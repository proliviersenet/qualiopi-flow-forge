import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useStatutAbonnement, StatutAbonnement } from "@/hooks/useStatutAbonnement";

// Chantier facturation, lot 2 (12/11/2026) : la page « Factures » (jusqu'ici
// un simple « Bientôt disponible ») devient « Abonnement et factures » :
// - statut de l'abonnement (bêta gratuite, essai, actif, impayé, résiliation…)
// - souscription : essai gratuit de 7 jours, carte demandée (page Stripe)
// - portail Stripe : changer de carte, coordonnées de facturation
// - liste des factures QualioFlex avec téléchargement du PDF
// Les montants affichés viennent de la grille public.tarifs (jamais en dur).

type Facture = {
  id: string;
  numero: string | null;
  emise_le: string | null;
  periode_debut: string | null;
  periode_fin: string | null;
  montant_ht_centimes: number;
  montant_ttc_centimes: number;
  statut: string;
  mois_offert: boolean;
  pdf_url: string | null;
  hosted_url: string | null;
};

const euros = (centimes: number) =>
  (centimes / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const dateFr = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—";

const LIBELLE_FACTURE: Record<string, { texte: string; classe: string }> = {
  payee: { texte: "Payée", classe: "bg-green-100 text-green-800" },
  ouverte: { texte: "À payer", classe: "bg-orange-100 text-orange-800" },
  impayee: { texte: "Impayée", classe: "bg-red-100 text-red-800" },
  annulee: { texte: "Annulée", classe: "bg-gray-100 text-gray-600" },
  brouillon: { texte: "En préparation", classe: "bg-gray-100 text-gray-600" },
};

const Factures = () => {
  const { session, user: authUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const role = authUser?.user_metadata?.role;
  const { statut, loading, rafraichir } = useStatutAbonnement();

  const [factures, setFactures] = useState<Facture[]>([]);
  const [prix, setPrix] = useState<{ abonnement: number; session: number }>({ abonnement: 3490, session: 300 });
  const [redirection, setRedirection] = useState<"souscription" | "portail" | null>(null);
  const [attenteActivation, setAttenteActivation] = useState(false);

  const activation = new URLSearchParams(window.location.search).get("activation") === "1";

  useEffect(() => {
    if (!session) { navigate("/login"); return; }
    if (role === "client") { navigate("/espace-client"); return; }

    const charger = async () => {
      const [{ data: lignes }, { data: tarifs }] = await Promise.all([
        supabase.from("factures")
          .select("id, numero, emise_le, periode_debut, periode_fin, montant_ht_centimes, montant_ttc_centimes, statut, mois_offert, pdf_url, hosted_url")
          .neq("statut", "brouillon")
          .order("emise_le", { ascending: false }),
        supabase.from("tarifs").select("code, montant_ht_centimes").in("code", ["abonnement_mensuel", "session"]),
      ]);
      setFactures((lignes ?? []) as Facture[]);
      const t = Object.fromEntries((tarifs ?? []).map((x: { code: string; montant_ht_centimes: number }) => [x.code, x.montant_ht_centimes]));
      setPrix({ abonnement: t.abonnement_mensuel ?? 3490, session: t.session ?? 300 });
    };
    charger();
  }, [session, role, navigate]);

  // Retour de la page Stripe : l'abonnement est créé par le webhook quelques
  // secondes plus tard, on relit le statut jusqu'à le voir apparaître.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const retour = params.get("abonnement");
    if (!retour) return;
    window.history.replaceState({}, "", "/factures");
    if (retour === "annule") {
      toast({ title: "Souscription annulée", description: "Aucune carte n'a été enregistrée. Vous pouvez recommencer à tout moment." });
      return;
    }
    setAttenteActivation(true);
    let essais = 0;
    const verifier = async () => {
      const s = await rafraichir();
      if (s && !s.acces_requis && s.statut !== "aucun") {
        setAttenteActivation(false);
        toast({ title: "Bienvenue sur QualioFlex !", description: "Votre essai gratuit de 7 jours a démarré." });
        return;
      }
      if (++essais < 10) setTimeout(verifier, 2000);
      else setAttenteActivation(false);
    };
    verifier();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appelerFonction = async (nom: string, type: "souscription" | "portail") => {
    setRedirection(type);
    const { data, error } = await supabase.functions.invoke(nom);
    if (error || data?.error) {
      let message = data?.error || error?.message;
      const ctx = (error as { context?: Response })?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const corps = await ctx.clone().json();
          if (corps?.error) message = corps.error;
        } catch { /* corps non-JSON */ }
      }
      toast({ title: "Action impossible", description: message, variant: "destructive" });
      setRedirection(null);
      return;
    }
    if (data?.url) window.location.href = data.url;
    else setRedirection(null);
  };

  const prixAbonnement = euros(prix.abonnement);
  const prixSession = euros(prix.session);

  const carteStatut = (s: StatutAbonnement | null) => {
    if (!s) return null;

    if (s.type_compte === "super_ambassadeur" || s.statut === "exempte") {
      return (
        <div className="space-y-2">
          <Badge className="bg-purple-100 text-purple-800">Ambassadeur</Badge>
          <p className="text-gray-700">Merci de faire partie des premiers utilisateurs de QualioFlex ! Votre compte ambassadeur est <strong>exempté d'abonnement</strong> : vous ne serez jamais facturé.</p>
        </div>
      );
    }

    if (!s.facturation_active) {
      return (
        <div className="space-y-2">
          <Badge className="bg-green-100 text-green-800">Bêta gratuite</Badge>
          <p className="text-gray-700">QualioFlex est <strong>gratuit pendant la période de bêta</strong>. Vous serez prévenu à l'avance du lancement de l'offre payante.</p>
        </div>
      );
    }

    switch (s.statut) {
      case "essai":
        return (
          <div className="space-y-3">
            <Badge className="bg-blue-100 text-blue-800">Essai gratuit</Badge>
            <p className="text-gray-700">Votre essai gratuit se termine le <strong>{dateFr(s.fin_essai)}</strong>. Ensuite, votre abonnement démarre automatiquement : <strong>{prixAbonnement} HT par mois</strong>, facturé le 1er du mois (le premier mois au prorata), plus <strong>{prixSession} HT par session</strong>. Sans engagement.</p>
            <Button variant="outline" onClick={() => appelerFonction("stripe-portail-client", "portail")} disabled={redirection !== null}>
              {redirection === "portail" ? "Ouverture..." : "Gérer ma carte bancaire"}
            </Button>
          </div>
        );
      case "actif":
        return (
          <div className="space-y-3">
            <Badge className="bg-green-100 text-green-800">Abonnement actif</Badge>
            <p className="text-gray-700"><strong>{prixAbonnement} HT par mois</strong> + <strong>{prixSession} HT par session</strong>, facturés le 1er de chaque mois. Sans engagement.</p>
            <Button variant="outline" onClick={() => appelerFonction("stripe-portail-client", "portail")} disabled={redirection !== null}>
              {redirection === "portail" ? "Ouverture..." : "Gérer ma carte bancaire"}
            </Button>
          </div>
        );
      case "impaye":
        return (
          <div className="space-y-3">
            <Badge className="bg-red-100 text-red-800">Paiement en échec</Badge>
            <p className="text-gray-700">Le dernier prélèvement n'a pas pu aboutir. Mettez à jour votre moyen de paiement pour éviter la suspension de votre accès{s.coupure_prevue_le ? <> prévue le <strong>{dateFr(s.coupure_prevue_le)}</strong></> : null}.</p>
            <Button style={{ background: "#f2901e", color: "#fff" }} onClick={() => appelerFonction("stripe-portail-client", "portail")} disabled={redirection !== null}>
              {redirection === "portail" ? "Ouverture..." : "Mettre à jour ma carte"}
            </Button>
          </div>
        );
      case "resiliation_programmee":
        return (
          <div className="space-y-3">
            <Badge className="bg-orange-100 text-orange-800">Résiliation programmée</Badge>
            <p className="text-gray-700">Votre abonnement prendra fin le <strong>{dateFr(s.resiliation_effective_le)}</strong>. Vous gardez l'accès complet à QualioFlex jusqu'à cette date.</p>
          </div>
        );
      default:
        // aucun, résilié, coupé : proposer de (re)démarrer
        return (
          <div className="space-y-4">
            {s.statut === "resilie" && <Badge className="bg-gray-100 text-gray-700">Abonnement terminé</Badge>}
            {s.statut === "coupe" && <Badge className="bg-red-100 text-red-800">Accès suspendu</Badge>}
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
              <p className="font-semibold text-gray-800">Essai gratuit de 7 jours, puis {prixAbonnement} HT par mois</p>
              <ul className="mt-2 text-sm text-gray-700 list-disc list-inside space-y-1">
                <li>Formations, sessions, clients et stagiaires illimités</li>
                <li>Signature électronique et émargement inclus</li>
                <li>{prixSession} HT par session affectée à un client (gratuite si annulée au moins 48 h avant)</li>
                <li>Facturé le 1er du mois, le premier mois au prorata — sans engagement</li>
              </ul>
              <p className="mt-2 text-xs text-gray-500">Votre carte est demandée pour démarrer l'essai. Aucun prélèvement pendant 7 jours ; un rappel vous est envoyé avant la fin de l'essai.</p>
            </div>
            <Button className="font-bold" style={{ background: "#f2901e", color: "#fff" }}
              onClick={() => appelerFonction("stripe-abonnement-checkout", "souscription")} disabled={redirection !== null}>
              {redirection === "souscription" ? "Redirection vers la page de paiement..." : "Démarrer mon essai gratuit"}
            </Button>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-3xl space-y-6">
          <Link to="/dashboard" className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour</Link>
          <h1 className="text-3xl font-bold" style={{ color: "#25245e" }}>Abonnement et factures</h1>

          {activation && statut?.acces_requis && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Pour accéder à votre espace formateur, démarrez votre essai gratuit de 7 jours.
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mon abonnement</CardTitle>
            </CardHeader>
            <CardContent>
              {loading || attenteActivation ? (
                <p className="text-gray-500">{attenteActivation ? "Activation de votre essai en cours..." : "Chargement..."}</p>
              ) : carteStatut(statut)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mes factures</CardTitle>
            </CardHeader>
            <CardContent>
              {factures.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune facture pour le moment. Vos factures QualioFlex apparaîtront ici automatiquement.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Numéro</TableHead>
                      <TableHead className="text-right">Montant TTC</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {factures.map((f) => {
                      const libelle = f.mois_offert
                        ? { texte: "Mois offert", classe: "bg-purple-100 text-purple-800" }
                        : LIBELLE_FACTURE[f.statut] ?? LIBELLE_FACTURE.ouverte;
                      return (
                        <TableRow key={f.id}>
                          <TableCell>{dateFr(f.emise_le)}</TableCell>
                          <TableCell className="font-mono text-xs">{f.numero ?? "—"}</TableCell>
                          <TableCell className="text-right">{euros(f.montant_ttc_centimes)}</TableCell>
                          <TableCell><Badge className={libelle.classe}>{libelle.texte}</Badge></TableCell>
                          <TableCell className="text-right">
                            {f.pdf_url ? (
                              <a href={f.pdf_url} target="_blank" rel="noopener noreferrer" className="text-sm text-exsenco-blue hover:underline">Télécharger (PDF)</a>
                            ) : f.hosted_url ? (
                              <a href={f.hosted_url} target="_blank" rel="noopener noreferrer" className="text-sm text-exsenco-blue hover:underline">Voir</a>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Factures;
