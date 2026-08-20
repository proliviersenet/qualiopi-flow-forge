import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { extractFunctionErrorMessage } from "@/lib/functionsError";

interface SupportData {
  signed_url: string;
  expires_in: number;
  prenom: string;
  formation_titre: string;
}

// Page PUBLIQUE — accessible sans compte via le MÊME token que la feuille
// d'émargement (/emargement/:token). Correctif audit juillet 2026 : le support
// pédagogique doit être réellement bloqué pour un stagiaire tant que SON
// émargement n'est pas signé — toute la vérification et la génération de l'URL
// signée (bucket Storage privé) passent par l'Edge Function support-public, sur
// le même principe que emargement-public / evaluation-public / Positionnement.tsx.
const SupportPublic = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SupportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("support-public", {
      body: { token },
    });
    if (err || res?.error) {
      setError(res?.error || (err ? await extractFunctionErrorMessage(err, "Lien invalide.") : "Lien invalide."));
      setData(null);
      setLoading(false);
      return;
    }
    setData(res as SupportData);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="max-w-md w-full"><CardContent className="pt-6 text-center space-y-4">
        <p className="text-4xl mb-1">📚</p>
        <div>
          <h1 className="text-lg font-bold" style={{ color: "#25245e" }}>Support pédagogique</h1>
          <p className="text-sm text-gray-500">{data.formation_titre}</p>
        </div>
        <p className="text-sm text-gray-600">
          Merci {data.prenom}, votre émargement est bien signé. Le lien ci-dessous est valable
          {" "}{Math.round(data.expires_in / 60)} minutes.
        </p>
        <a href={data.signed_url} target="_blank" rel="noopener noreferrer">
          <Button className="w-full font-bold" style={{ background: "#25245e", color: "#fff" }}>
            Ouvrir le support pédagogique
          </Button>
        </a>
        <button onClick={load} className="text-xs text-gray-400 hover:underline">
          Le lien a expiré ? Cliquez ici pour en générer un nouveau
        </button>
      </CardContent></Card>
    </div>
  );
};

export default SupportPublic;
