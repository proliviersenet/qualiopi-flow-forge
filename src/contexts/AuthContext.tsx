import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** true tant que la session initiale n'a pas encore été résolue */
  loading: boolean;
  // Chantier "2FA" (14/09, point 13 de l'audit) : un compte formateur peut
  // activer un second facteur (TOTP, voir Settings.tsx). Quand c'est le cas,
  // une connexion réussie (mot de passe ou Google) ne suffit plus : la
  // session existe (niveau "aal1") mais l'application doit encore réclamer
  // le code à 6 chiffres avant de donner accès à quoi que ce soit (niveau
  // "aal2"). mfaRequired centralise ce calcul une seule fois ici, plutôt que
  // dans chaque page qui redirige vers /dashboard après authentification
  // (mot de passe dans Register.tsx, retour Google via SocialAuthButtons,
  // etc.) — voir le garde global MfaGuard dans App.tsx qui s'en sert.
  /** true si l'utilisateur est authentifié (aal1) mais doit encore valider
   * son second facteur (aal2) avant d'accéder à l'application. */
  mfaRequired: boolean;
  /** true tant que mfaRequired n'a pas encore été déterminé pour la session en cours */
  mfaLoading: boolean;
  /** À appeler juste après une activation/désactivation du 2FA (Settings.tsx)
   * ou une vérification réussie (Verification2FA.tsx) pour rafraîchir
   * mfaRequired immédiatement, sans attendre un futur changement de session. */
  refreshMfaStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  mfaRequired: false,
  mfaLoading: true,
  refreshMfaStatus: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(true);

  const checkMfaStatus = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) {
      setMfaRequired(false);
      setMfaLoading(false);
      return;
    }
    setMfaLoading(true);
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!error && data) {
      setMfaRequired(data.currentLevel === "aal1" && data.nextLevel === "aal2");
    } else {
      setMfaRequired(false);
    }
    setMfaLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setLoading(false);
      checkMfaStatus(session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setLoading(false);
      // onAuthStateChange se redéclenche notamment sur l'évènement
      // "MFA_CHALLENGE_VERIFIED" (émis par Supabase juste après un
      // challengeAndVerify réussi) : mfaRequired est donc automatiquement
      // recalculé à ce moment-là, en plus de toute connexion/déconnexion.
      checkMfaStatus(session);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [checkMfaStatus]);

  const refreshMfaStatus = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    await checkMfaStatus(currentSession);
  }, [checkMfaStatus]);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, mfaRequired, mfaLoading, refreshMfaStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
