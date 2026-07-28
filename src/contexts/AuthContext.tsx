import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** true tant que la session initiale n'a pas encore été résolue */
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ session: null, user: null, loading: true });

// Point d'entrée UNIQUE pour l'authentification côté client : une seule
// vérification de session (supabase.auth.getSession()) et un seul abonnement
// aux changements (onAuthStateChange) pour toute l'application, partagés via
// le contexte React. Avant, chaque composant (widget de chat, checklist
// d'onboarding, chaque page) refaisait sa propre vérification indépendante,
// ce qui multipliait les appels concurrents à Supabase au chargement d'une
// page et ralentissait sensiblement la navigation.
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
