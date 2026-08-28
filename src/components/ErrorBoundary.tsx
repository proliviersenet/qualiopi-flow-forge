import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { logBug } from "@/lib/bugReport";

// Chantier "superadmin" (28/08) : capture automatique des crashs de rendu React
// (erreurs "techniques") pour alimenter le flux d'alertes bug côté superadmin.
// Les erreurs JS hors rendu (promesses rejetées, erreurs réseau) sont couvertes
// séparément par le handler global monté dans App.tsx (window.onerror /
// unhandledrejection) — un ErrorBoundary ne les intercepte pas, c'est une
// limitation connue de React.
interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logBug({
      source: "auto",
      type: "crash_react",
      message: error.message || String(error),
      stack: `${error.stack || ""}\n\nComponent stack:${info.componentStack || ""}`,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="text-center max-w-md">
            <p className="text-4xl mb-3">😵</p>
            <h1 className="text-xl font-bold mb-2" style={{ color: "#25245e" }}>Une erreur inattendue s'est produite</h1>
            <p className="text-sm text-gray-500 mb-6">
              Le problème a été enregistré automatiquement. Tu peux recharger la page pour continuer.
            </p>
            <Button style={{ background: "#f2901e", color: "#fff" }} onClick={() => window.location.reload()}>
              Recharger la page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
