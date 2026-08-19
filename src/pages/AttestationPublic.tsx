import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface AttestationData {
  prenom: string;
  contenu_html: string;
}

// Page PUBLIQUE — accessible sans compte via le token token_attestation du
// stagiaire (/attestation/:token), sur le même principe que livret-public /
// emargement-public. Chantier "consultation directe livret/attestation"
// (19/08/2026) : jusqu'ici seul l'espace client (compte requis) permettait de
// consulter l'attestation — écart hors-périmètre identifié lors du test E2E
// du 14/08, corrigé ici. Le token est généré par generer-attestation lors de
// la première génération, et envoyé par email au stagiaire à ce moment-là.
const AttestationPublic = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<AttestationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("attestation-public", {
      body: { token },
    });
    if (err || res?.error) {
      setError(res?.error || err?.message || "Lien invalide.");
      setData(null);
      setLoading(false);
      return;
    }
    setData(res as AttestationData);
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
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="px-4 py-3 border-b bg-white flex items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold" style={{ color: "#25245e" }}>🎓 Attestation de fin de formation</h1>
          <p className="text-xs text-gray-500">Bonjour {data.prenom}</p>
        </div>
      </div>
      <iframe
        title="Attestation de fin de formation"
        srcDoc={data.contenu_html}
        className="flex-1 w-full border-0 bg-white"
      />
    </div>
  );
};

export default AttestationPublic;
