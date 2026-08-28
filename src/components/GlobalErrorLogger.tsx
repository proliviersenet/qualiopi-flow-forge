import { useEffect } from "react";
import { logBug } from "@/lib/bugReport";

// Chantier "superadmin" (28/08) : capture les erreurs JS que l'ErrorBoundary
// React ne voit pas (promesses rejetées non catchées, erreurs hors cycle de
// rendu). Monté une seule fois au niveau racine dans App.tsx, ne rend rien.
const GlobalErrorLogger = () => {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      logBug({
        source: "auto",
        type: "erreur_js",
        message: event.message || "Erreur JS non précisée",
        stack: event.error?.stack,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      logBug({
        source: "auto",
        type: "promesse_rejetee",
        message: (reason?.message || String(reason) || "Promesse rejetée non précisée").slice(0, 500),
        stack: reason?.stack,
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
};

export default GlobalErrorLogger;
