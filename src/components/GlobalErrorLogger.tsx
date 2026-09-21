import { useEffect } from "react";
import { logBug } from "@/lib/bugReport";

// Chantier "superadmin" (28/08) : capture les erreurs JS que l'ErrorBoundary
// React ne voit pas (promesses rejetées non catchées, erreurs hors cycle de
// rendu). Monté une seule fois au niveau racine dans App.tsx, ne rend rien.
// Fix 21/09 : "ResizeObserver loop completed with undelivered notifications"
// (et sa variante "...loop limit exceeded") est un avertissement natif et
// bénin des navigateurs (Chrome, Safari...), déclenché par de nombreux
// composants UI usuels (dropdowns, tableaux redimensionnables, etc.) et sans
// aucun impact fonctionnel. Il remontait ici comme fausse "alerte bug" dans
// le superadmin à chaque occurrence. On le filtre à la source.
const estBruitBenin = (message: string) => /ResizeObserver loop/i.test(message);

const GlobalErrorLogger = () => {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (estBruitBenin(event.message || "")) return;
      logBug({
        source: "auto",
        type: "erreur_js",
        message: event.message || "Erreur JS non précisée",
        stack: event.error?.stack,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = (reason?.message || String(reason) || "Promesse rejetée non précisée").slice(0, 500);
      if (estBruitBenin(message)) return;
      logBug({
        source: "auto",
        type: "promesse_rejetee",
        message,
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
