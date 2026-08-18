import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// Page interne, réservée à Olivier (ADMIN_EMAIL) : liste des demandes de
// suppression de compte formateur en attente (comptes bannis, données
// conservées 30 jours). Deux actions possibles par ligne : restaurer l'accès
// (avant J+30, ou même après si Olivier le décide — rien n'est automatique),
// ou valider la suppression définitive. Voir demander-suppression-compte /
// relance-suppression-compte / restaurer-compte-formateur /
// valider-suppression-definitive côté backend.
const ADMIN_EMAIL = "olivier@exsenco.fr";

interface Demande {
  id: string;
  email: string;
  avec_recuperation: boolean;
  mode_paiement: string | null;
  demandee_le: string;
  relance_j5_envoyee: boolean;
  relance_j15_envoyee: boolean;
  notif_olivier_envoyee: boolean;
  jours_ecoules: number;
  jours_restants: number;
}

function extraireMessageErreur(error: unknown, data: { error?: string } | null): string {
  return data?.error || (error as Error)?.message || "Une erreur est survenue.";
}

const AdminSuppressions = () => {
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);
  const [confirmSuppression, setConfirmSuppression] = useState<Demande | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const chargerDemandes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("lister-demandes-suppression");
    if (error || data?.error) {
      toast({ title: "Erreur", description: extraireMessageErreur(error, data), variant: "destructive" });
      setLoading(false);
      return;
    }
    setDemandes(data?.demandes || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    if (authSession.user.email?.toLowerCase() !== ADMIN_EMAIL) { navigate("/dashboard"); return; }
    setUser({
      name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "",
      email: authSession.user.email || "",
      profileImage: "",
    });
    chargerDemandes();
  }, [authSession, authLoading, navigate, chargerDemandes]);

  const restaurer = async (email: string) => {
    setActionEnCours(email);
    const { data, error } = await supabase.functions.invoke("restaurer-compte-formateur", { body: { email } });
    setActionEnCours(null);
    if (error || data?.error) {
      toast({ title: "Erreur", description: extraireMessageErreur(error, data), variant: "destructive" });
      return;
    }
    toast({ title: "Accès restauré", description: `Le compte ${email} peut de nouveau se connecter.` });
    chargerDemandes();
  };

  const validerSuppressionDefinitive = async (email: string) => {
    setActionEnCours(email);
    const { data, error } = await supabase.functions.invoke("valider-suppression-definitive", { body: { email } });
    setActionEnCours(null);
    setConfirmSuppression(null);
    if (error || data?.error) {
      toast({ title: "Suppression impossible", description: extraireMessageErreur(error, data), variant: "destructive" });
      return;
    }
    toast({ title: "Compte supprimé définitivement", description: `Le compte ${email} a été supprimé de la base.` });
    chargerDemandes();
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#25245e" }}>🗂️ Demandes de suppression de compte</h1>
          <p className="text-sm text-gray-500 mb-6">
            Comptes formateur désactivés en attente. Données conservées 30 jours : restaure l'accès ou valide la
            suppression définitive quand tu es sûr d'avoir reçu le paiement (ou que tu n'en as pas besoin).
          </p>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: "#25245e" }}>
                {loading ? "Chargement..." : `${demandes.length} demande(s) en attente`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!loading && demandes.length === 0 && (
                <p className="text-sm text-gray-500">Aucune demande de suppression en attente pour le moment.</p>
              )}
              {demandes.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Compte</TableHead>
                      <TableHead>Demandée le</TableHead>
                      <TableHead>Délai</TableHead>
                      <TableHead>Récupération</TableHead>
                      <TableHead>Relances</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {demandes.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.email}</TableCell>
                        <TableCell>{new Date(d.demandee_le).toLocaleDateString("fr-FR")}</TableCell>
                        <TableCell>
                          {d.jours_restants > 0 ? (
                            <Badge variant="outline">{d.jours_restants} j restants</Badge>
                          ) : (
                            <Badge variant="destructive">Délai dépassé</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {d.avec_recuperation ? (d.mode_paiement === "stripe" ? "Payé par carte" : d.mode_paiement === "virement" ? "Virement annoncé" : "Souhaitée") : "Non demandée"}
                        </TableCell>
                        <TableCell className="space-x-1">
                          {d.relance_j5_envoyee && <Badge variant="secondary">J5</Badge>}
                          {d.relance_j15_envoyee && <Badge variant="secondary">J15</Badge>}
                          {d.notif_olivier_envoyee && <Badge variant="secondary">Toi notifié</Badge>}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionEnCours === d.email}
                            onClick={() => restaurer(d.email)}
                          >
                            Restaurer l'accès
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={actionEnCours === d.email}
                            onClick={() => setConfirmSuppression(d)}
                          >
                            Supprimer définitivement
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />

      <AlertDialog open={!!confirmSuppression} onOpenChange={(open) => !open && setConfirmSuppression(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement ce compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmSuppression && (
                <>
                  Cette action va tenter de supprimer définitivement le compte <strong>{confirmSuppression.email}</strong>{" "}
                  de la base de données. Cette action est irréversible.
                  <br /><br />
                  Si ce compte a encore des données de formation liées (évaluations, compétences, dérogations
                  Qualiopi...), la suppression sera refusée automatiquement pour préserver ces données d'audit — le
                  compte restera bloqué mais ne sera pas supprimé.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmSuppression && validerSuppressionDefinitive(confirmSuppression.email)}
            >
              Oui, supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminSuppressions;
