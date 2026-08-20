import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { extractFunctionErrorMessage } from "@/lib/functionsError";

interface LivretData {
  prenom: string;
  formation_titre: string;
  contenu_html: string | null;
  fichier_url: string | null;
}

// Page PUBLIQUE — accessible sans compte via le token token_livret du stagiaire
// (/livret/:token), sur le même principe que emargement-public / support-public.
// Chantier "consultation directe livret/attestation" (19/08/2026) : jusqu'ici
// seul l'espace client (compte requis) permettait de consulter le livret —
// écart hors-périmètre identifié lors du test E2E du 14/08, corrigé ici.
const LivretPublic = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<LivretData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("livret-public", {
      body: { token },
    });
    if (err || res?.error) {
      setError(res?.error || (err ? await extractFunctionErrorMessage(err, "Lien invalide.") : "Lien invalide."));
      setData(null);
      setLoading(false);
      return;
    }
    setData(res as LivretData);
    setLoading(false);
  };

  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400">Chargement...</p></div>;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full"><CardContent className="pt-6 text-center space-y-3">
          <p className="text-4xl mb-1">🔒</p>
          <p className="text-gray-600">{error || "Lien invalide."}</p>
          <Button variant="outline" size="sm" onClick={load}>Réessayer</Button>
        </CardContent></Card>
      </div>
    );
  }

  // Cas d'un livret importé en fichier (fichier_url) plutôt que généré en HTML
  // (contenu_html) : on propose simplement le lien d'ouverture, comme pour le
  // support pédagogique.
  if (!data.contenu_html && data.fichier_url) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full"><CardContent className="pt-6 text-center space-y-4">
          <p className="text-4xl mb-1">📘</p>
          <div>
            <h1 className="text-lg font-bold" style={{ color: "#25245e" }}>Livret d'accueil</h1>
            <p className="text-sm text-gray-500">{data.formation_titre}</p>
          </div>
          <p className="text-sm text-gray-600">Bonjour {data.prenom}, votre livret d'accueil est disponible.</p>
          <a href={data.fichier_url} target="_blank" rel="noopener noreferrer">
            <Button className="w-full font-bold" style={{ background: "#25245e", color: "#fff" }}>
              Ouvrir le livret d'accueil
            </Button>
          </a>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="px-4 py-3 border-b bg-white flex items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold" style={{ color: "#25245e" }}>📘 Livret d'accueil</h1>
          <p className="text-xs text-gray-500">{data.formation_titre} — bonjour {data.prenom}</p>
        </div>
      </div>
      <iframe
        title="Livret d'accueil"
        srcDoc={data.contenu_html ?? ""}
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  );
};

export default LivretPublic;
