import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import Footer from "@/components/Footer";
import { validatePassword } from "@/lib/passwordUtils";
import Logo from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import SocialAuthButtons from "@/components/SocialAuthButtons";

// Page unique "Accéder à QualioFlex" (fusion Connexion + Inscription, 12/09).
//
// Avant, /login (email+mot de passe+Google) et /register (SIRET puis email+
// mot de passe, sans Google) étaient deux pages séparées. Problème constaté
// en beta test (retour Jean-Pascal Mollet) : Google ne distingue pas
// "se connecter" de "créer un compte" — un nouvel utilisateur arrivant sur
// /login pouvait cliquer sur "Continuer avec Google", ce qui créait bel et
// bien un compte, sans jamais passer par la case SIRET obligatoire. Le petit
// bandeau de complétion qui suivait pouvait passer inaperçu, laissant
// l'utilisateur "connecté" mais bloqué partout ailleurs dans l'app.
//
// /login et /register pointent maintenant vers ce même composant (voir
// App.tsx), qui gère 3 états :
//  - "access"   : étape d'entrée unique — bouton Google + email/mot de passe.
//                 On tente une connexion ; si elle échoue (pas de compte ou
//                 mauvais mot de passe), on bascule automatiquement vers la
//                 création d'espace, sans faire retaper l'email/mot de passe.
//  - "signup"   : l'assistant SIRET existant (inchangé), déclenché soit
//                 automatiquement après un échec de connexion, soit
//                 explicitement via "Nouveau sur QualioFlex ?", soit
//                 immédiatement pour un lien d'invitation sous-traitance
//                 (?st=...). Pas de bouton Google ici : la création d'un
//                 espace formateur doit toujours passer par la recherche
//                 SIRET (règle métier inchangée).
//  - "oauthCompletion" : cas de secours — session déjà active (retour
//                 Google) mais sans organisme rattaché. Comportement
//                 identique à avant.
const Register = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();
  // Utilisateur déjà connecté en arrivant sur la page (typiquement : retour
  // de redirection Google/OAuth, voir SocialAuthButtons + Dashboard.tsx). Dans
  // ce cas le compte existe déjà — il ne reste plus qu'à renseigner
  // l'entreprise (SIRET) pour finaliser l'espace, sans email/mot de passe.
  const [checkingOAuthProfile, setCheckingOAuthProfile] = useState(true);
  const [oauthCompletion, setOauthCompletion] = useState(false);
  // Chantier "sous-traitance" (28/08) : lien /register?st=<token> envoyé quand un
  // formateur invite un sous-traitant qui n'a pas encore de compte QualioFlex — on
  // affiche le contexte de l'invitation et, une fois le compte formateur créé, on
  // rattache automatiquement la session sous-traitée (voir handleSubmit).
  const [searchParams] = useSearchParams();
  const stToken = searchParams.get("st");
  const [invitationSoustraitance, setInvitationSoustraitance] = useState<{ formation_titre: string; organisme_demandeur_nom: string; email_invite: string } | null>(null);
  const [invitationInvalide, setInvitationInvalide] = useState(false);

  // Étape affichée : "access" (connexion/entrée unique) ou "signup" (assistant
  // SIRET). Un lien d'invitation sous-traitance saute directement à "signup",
  // comme avant.
  const [mode, setMode] = useState<"access" | "signup">(stToken ? "signup" : "access");

  const [isLoading, setIsLoading] = useState(false);
  const [siretLoading, setSiretLoading] = useState(false);
  const [siretTrouve, setSiretTrouve] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    siret: "",
    siren: "",
    raisonSociale: "",
    nomComplet: "",
    adresse: "",
    codeNaf: "",
    email: "",
    telephone: "",
    password: "",
    confirmPassword: "",
    role: "formateur_certifie",
    nda: "",
  });

  useEffect(() => {
    if (!stToken) return;
    const verifier = async () => {
      const { data, error } = await supabase.functions.invoke("verifier-invitation-soustraitance", { body: { token: stToken } });
      if (error || !data?.valid) { setInvitationInvalide(true); return; }
      setInvitationSoustraitance({ formation_titre: data.formation_titre, organisme_demandeur_nom: data.organisme_demandeur_nom, email_invite: data.email_invite });
      setFormData(prev => ({ ...prev, email: data.email_invite }));
    };
    verifier();
  }, [stToken]);

  // Détecte une arrivée via Google (ou autre OAuth à venir) : Dashboard.tsx
  // redirige ici tout utilisateur déjà authentifié mais sans organisme. On
  // vérifie une dernière fois côté client (au cas où l'entreprise aurait
  // déjà été créée entre-temps, ex. double-clic) avant de basculer le
  // formulaire en mode "complétion" (sans email/mot de passe).
  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { setCheckingOAuthProfile(false); return; }
    const check = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organisme_id")
        .eq("id", authSession.user.id)
        .maybeSingle();
      if (profile?.organisme_id) {
        navigate("/dashboard");
        return;
      }
      setOauthCompletion(true);
      setFormData(prev => ({ ...prev, email: authSession.user.email || prev.email }));
      setCheckingOAuthProfile(false);
    };
    check();
  }, [authSession, authLoading, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRoleChange = (value: string) => {
    setFormData(prev => ({ ...prev, role: value }));
  };

  const extractMessage = (error: unknown, fallback: string) =>
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : fallback;

  // Étape d'entrée unique : on tente d'abord une connexion classique. Si elle
  // échoue (email inconnu OU mauvais mot de passe — Supabase ne distingue pas
  // les deux pour des raisons de sécurité), on bascule vers la création
  // d'espace en conservant l'email/mot de passe déjà saisis, pour ne rien
  // faire retaper.
  const handleAccessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.password) {
      toast({ title: "Erreur", description: "Veuillez renseigner votre email et votre mot de passe", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });
      if (error) {
        setMode("signup");
        toast({
          title: "Compte introuvable avec ces identifiants",
          description: "Si vous êtes nouveau sur QualioFlex, créez votre espace ci-dessous (SIRET requis). Si vous avez déjà un compte, vérifiez votre mot de passe.",
        });
        return;
      }
      const role = data.user?.user_metadata?.role;
      toast({ title: "Connexion réussie", description: "Bienvenue sur QualioFlex !" });
      navigate(role === "client" ? "/espace-client" : "/dashboard");
    } catch (error: unknown) {
      toast({ title: "Erreur de connexion", description: extractMessage(error, "Une erreur est survenue"), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Étape 1 — Recherche SIRET et pré-remplissage automatique
  const fetchSiret = async () => {
    const siret = formData.siret.replace(/\s/g, "");
    if (siret.length !== 14) {
      toast({ title: "SIRET invalide", description: "Le SIRET doit contenir 14 chiffres", variant: "destructive" });
      return;
    }
    setSiretLoading(true);
    setSiretTrouve(false);
    try {
      const resp = await fetch(
        `https://recherche-entreprises.api.gouv.fr/search?q=${siret}&page=1&per_page=1`,
        { headers: { "Accept": "application/json" } }
      );
      if (!resp.ok) throw new Error("Erreur lors de la recherche");
      const json = await resp.json();
      if (!json.results?.length) throw new Error("Entreprise non trouvée");

      const r = json.results[0];
      const siege = r.siege || {};

      // Récupérer le NDA si disponible dans l'API
      const nda = r.complements?.liste_id_organisme_formation?.[0] || "";

      // Pré-remplir TOUS les champs automatiquement
      setFormData(prev => ({
        ...prev,
        siret,
        siren: r.siren || siret.slice(0, 9),
        raisonSociale: r.nom_raison_sociale || r.nom_complet || "",
        nomComplet: r.nom_raison_sociale || r.nom_complet || "",
        adresse: siege.adresse || "",
        codeNaf: r.activite_principale || "",
        nda,
      }));
      setSiretTrouve(true);
      toast({ title: "Entreprise trouvée !", description: `${r.nom_raison_sociale || r.nom_complet} — données pré-remplies` });
    } catch (err) {
      toast({ title: "SIRET non trouvé", description: err instanceof Error ? err.message : "Vérifiez le numéro", variant: "destructive" });
    } finally {
      setSiretLoading(false);
    }
  };

  // Étape 2 — Création de l'espace (auth + organisme + profil)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // En mode "complétion OAuth", le compte existe déjà (Google) — pas
    // d'email/mot de passe à valider ici.
    if (!oauthCompletion) {
      if (!formData.email || !formData.password || !formData.confirmPassword) {
        toast({ title: "Erreur", description: "Email et mot de passe obligatoires", variant: "destructive" });
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" });
        return;
      }
      const pwCheck = validatePassword(formData.password);
      if (!pwCheck.valid) {
        toast({ title: "Mot de passe insuffisant", description: pwCheck.message, variant: "destructive" });
        return;
      }
    }
    if (!formData.siret) {
      toast({ title: "SIRET requis", description: "Recherchez votre entreprise par SIRET pour créer votre espace", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      let userId: string;
      let userEmail: string;

      if (oauthCompletion) {
        // Déjà authentifié (retour Google) — le compte existe, il ne reste
        // qu'à créer l'organisme/le profil avec les infos SIRET saisies.
        if (!authSession) throw new Error("Session expirée, reconnectez-vous.");
        userId = authSession.user.id;
        userEmail = authSession.user.email || formData.email;
      } else {
        // 1. Créer le compte Supabase Auth. Toutes les infos SIRET/entreprise
        // saisies sont aussi stockées en user_metadata (pending_registration) :
        // si la confirmation par email est activée, aucune session n'est
        // renvoyée tant que l'utilisateur n'a pas cliqué le lien reçu — donc
        // impossible de créer l'organisme tout de suite (RLS exige une
        // session active). Ces données restent alors "en attente" et servent
        // à finaliser automatiquement l'inscription au premier chargement du
        // dashboard après confirmation (voir Dashboard.tsx).
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              nom_complet: formData.raisonSociale || formData.email,
              pending_registration: true,
              siret: formData.siret,
              siren: formData.siren,
              raison_sociale: formData.raisonSociale,
              adresse: formData.adresse,
              code_naf: formData.codeNaf,
              nda: formData.nda,
              telephone: formData.telephone,
              role: formData.role,
              st_token: stToken || null,
            },
          },
        });
        if (authError) {
          // Cas fréquent depuis la fusion Connexion/Inscription : l'email a
          // en fait déjà un compte (créé via Google, ou mot de passe oublié)
          // — on renvoie vers l'étape de connexion plutôt que d'afficher une
          // erreur technique sans solution.
          if (/already registered|already exists|user already/i.test(authError.message)) {
            setMode("access");
            toast({
              title: "Ce compte existe déjà",
              description: "Un compte est déjà associé à cet email. Connectez-vous avec votre mot de passe, avec Google, ou utilisez \"Mot de passe oublié\".",
            });
            return;
          }
          throw authError;
        }
        if (!authData.user) throw new Error("Erreur lors de la création du compte");

        // Pas de session = confirmation email en attente : on ne peut rien
        // créer sous RLS maintenant. Les données sont déjà sauvegardées
        // ci-dessus (user_metadata) et seront traitées automatiquement dès
        // que l'utilisateur confirme son adresse et revient sur le site.
        if (!authData.session) {
          toast({
            title: "Vérifiez votre boîte mail",
            description: "Un email de confirmation vient de vous être envoyé. Cliquez sur le lien qu'il contient pour activer votre compte — votre espace formateur sera créé automatiquement à ce moment-là.",
          });
          return;
        }
        userId = authData.user.id;
        userEmail = formData.email;
      }

      // 2. Créer l'organisme avec toutes les données SIRET
      const { data: orgData, error: orgError } = await supabase
        .from("organismes")
        .insert({
          owner_user_id: userId,
          siret: formData.siret,
          siren: formData.siren,
          raison_sociale: formData.raisonSociale,
          adresse: formData.adresse,
          code_naf: formData.codeNaf,
          nda: formData.nda,
          email_contact: userEmail,
          telephone: formData.telephone,
        })
        .select("id")
        .single();

      if (orgError) throw orgError;

      // 3. Mettre à jour le profil avec le rôle et l'organisme
      // Bug constaté le 14/09 (retour Google → boucle infinie sur cette page) :
      // l'erreur de cet appel n'était pas vérifiée, donc un échec (ex. policy
      // RLS manquante en INSERT sur profiles, corrigée le 14/09) passait
      // inaperçu — l'app affichait "Espace créé !" et redirigeait vers
      // /dashboard, qui renvoyait aussitôt ici faute de organisme_id rempli,
      // donnant l'impression d'une boucle sans aucun message d'erreur exploitable.
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        email: userEmail,
        nom_complet: formData.raisonSociale || userEmail,
        role: formData.role,
        organisme_id: orgData?.id,
        onboarding_complete: true,
      });
      if (profileError) throw profileError;

      // Chantier "sous-traitance" : rattachement de la session sous-traitée si
      // l'inscription vient d'une invitation. Non bloquant — le compte est déjà créé
      // à ce stade, un échec ici ne doit pas empêcher l'accès au dashboard.
      if (stToken) {
        const { data: liaison, error: liaisonError } = await supabase.functions.invoke("lier-soustraitance", { body: { token: stToken } });
        if (liaisonError || liaison?.error) {
          toast({
            title: "Espace créé, mais...",
            description: "La session sous-traitée n'a pas pu être rattachée automatiquement. Contactez le formateur qui vous a invité.",
          });
        } else {
          toast({ title: "Espace créé !", description: `Bienvenue sur QualioFlex — la session vous a été rattachée.` });
        }
      } else {
        toast({ title: "Espace créé !", description: `Bienvenue sur QualioFlex — ${formData.raisonSociale}` });
      }
      navigate("/dashboard");
    } catch (error: unknown) {
      // Les erreurs Supabase (PostgrestError, RLS, contraintes...) ne sont pas
      // des instances d'Error — sans ce cas, leur message réel était perdu et
      // on affichait toujours "Une erreur est survenue" (bug constaté au beta
      // test du 12/09 : impossible de diagnostiquer l'échec de création de
      // l'organisme faute de message précis).
      toast({ title: "Erreur d'inscription", description: extractMessage(error, "Une erreur est survenue"), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Évite un flash du formulaire complet le temps de vérifier si un
  // utilisateur arrivant déjà connecté (retour Google) a besoin de compléter
  // son entreprise ou peut filer directement au dashboard.
  if (checkingOAuthProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Chargement...</p>
      </div>
    );
  }

  const showWizard = mode === "signup" || oauthCompletion;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-grow flex items-center justify-center p-4 bg-gray-50">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center">
            <Link to="/" className="inline-flex flex-col items-center">
              <Logo size={32} withWordmark />
              <span className="text-gray-400 text-xs mt-1">by ExSenCo</span>
            </Link>
          </div>

          {!showWizard ? (
            // ÉTAPE D'ENTRÉE UNIQUE — Google + email/mot de passe. On ne sait
            // pas encore si la personne a déjà un compte ou non : "Accéder"
            // tente une connexion, et bascule automatiquement vers la
            // création d'espace en cas d'échec (voir handleAccessSubmit).
            <Card>
              <CardHeader>
                <CardTitle>Accéder à QualioFlex</CardTitle>
                <CardDescription>Connexion ou création de votre espace formateur</CardDescription>
              </CardHeader>
              <form onSubmit={handleAccessSubmit}>
                <CardContent className="space-y-4">
                  <SocialAuthButtons dividerPosition="after" />
                  <div className="space-y-2">
                    <Label htmlFor="access-email">Email professionnel</Label>
                    <Input
                      id="access-email" name="email" type="email"
                      placeholder="olivier@exsenco.fr"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      disabled={!!invitationSoustraitance}
                      className={invitationSoustraitance ? "bg-gray-100 text-gray-500" : undefined}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="access-password">Mot de passe</Label>
                      <Link to="/reset-password" className="text-xs text-exsenco-blue hover:underline">Mot de passe oublié ?</Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="access-password" name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={handleChange}
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        aria-label={showPassword ? "Masquer le mot de passe" : "Voir le mot de passe"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-3">
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Connexion en cours..." : "Accéder à mon espace"}
                  </Button>
                  {/* Bouton à part entière (et non un simple lien discret) :
                      demande explicite du 14/09 pour que "nouveau ici" soit
                      aussi visible que "j'ai déjà un compte", et mène
                      directement à l'étape SIRET (mode "signup"). Couleur
                      orange de la charte ExSenCo (btn-cta), comme les autres
                      boutons d'appel à créer un compte sur le site. */}
                  <Button
                    type="button"
                    className="btn-cta w-full font-bold"
                    onClick={() => setMode("signup")}
                  >
                    Nouveau sur QualioFlex ? Créer mon espace formateur
                  </Button>
                </CardFooter>
              </form>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{oauthCompletion ? "Finalisez votre inscription" : "Créer votre espace formateur"}</CardTitle>
                <CardDescription>
                  {oauthCompletion
                    ? "Une seule étape restante : indiquez votre SIRET et cliquez sur Rechercher"
                    : "Commencez par votre SIRET — vos informations sont pré-remplies automatiquement"}
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">

                  {invitationSoustraitance && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-800">
                      🤝 <strong>{invitationSoustraitance.organisme_demandeur_nom}</strong> vous invite à co-animer la formation <strong>{invitationSoustraitance.formation_titre}</strong> en sous-traitance. Créez votre espace formateur ci-dessous pour y accéder — la session vous sera automatiquement rattachée.
                    </div>
                  )}
                  {invitationInvalide && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                      ⚠️ Ce lien d'invitation à la sous-traitance n'est plus valide (expiré ou déjà utilisé). Vous pouvez tout de même créer votre espace formateur ci-dessous, mais contactez le formateur qui vous a invité pour qu'il vous confie de nouveau la session.
                    </div>
                  )}

                  {/* Pas de bouton Google ici : la création d'un espace
                      formateur doit imperativement passer par la recherche
                      SIRET en premier. "Continuer avec Google" n'existe que
                      sur l'étape d'entrée ci-dessus, pour se reconnecter à un
                      compte déjà créé. Ce bandeau ne concerne donc que le cas
                      de secours (voir Dashboard.tsx) : un compte Google sans
                      organisme associé — jamais atteint depuis cette étape en
                      usage normal, seulement redirigé ici. */}
                  {oauthCompletion && (
                    <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 text-blue-900">
                      <p className="text-sm">✓ Connecté avec Google ({formData.email})</p>
                      <p className="font-bold mt-1">
                        Finalisez votre inscription en saisissant votre SIRET ci-dessous, puis cliquez sur « Rechercher ».
                      </p>
                    </div>
                  )}

                  {/* ÉTAPE 1 — SIRET */}
                  <div className="space-y-2">
                    <Label htmlFor="siret">
                      <span className="inline-flex items-center gap-1">
                        <span className="bg-exsenco-blue text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">1</span>
                        SIRET de votre entreprise *
                      </span>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="siret" name="siret"
                        placeholder="14 chiffres — ex : 89278745800017"
                        maxLength={14}
                        value={formData.siret}
                        onChange={handleChange}
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" onClick={fetchSiret} disabled={siretLoading}>
                        {siretLoading ? "Recherche..." : "Rechercher"}
                      </Button>
                    </div>
                  </div>

                  {/* Résultat SIRET — données auto-remplies */}
                  {siretTrouve && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                        <span>✓</span> Entreprise trouvée — informations pré-remplies
                      </div>
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-gray-500">Raison sociale</Label>
                          <p className="text-sm font-medium">{formData.raisonSociale}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Adresse</Label>
                          <p className="text-sm">{formData.adresse}</p>
                        </div>
                        <div className="flex gap-4">
                          <div>
                            <Label className="text-xs text-gray-500">Code NAF</Label>
                            <p className="text-sm">{formData.codeNaf}</p>
                          </div>
                          {formData.nda && (
                            <div>
                              <Label className="text-xs text-gray-500">NDA Formation</Label>
                              <p className="text-sm font-medium text-exsenco-blue">{formData.nda}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ÉTAPE 2 — Email + Tel */}
                  {siretTrouve && (
                    <>
                      {!oauthCompletion && (
                        <div className="space-y-2">
                          <Label htmlFor="email">
                            <span className="inline-flex items-center gap-1">
                              <span className="bg-exsenco-blue text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">2</span>
                              Email professionnel *
                            </span>
                          </Label>
                          <Input id="email" name="email" type="email" placeholder="olivier@exsenco.fr" value={formData.email} onChange={handleChange} required disabled={!!invitationSoustraitance} className={invitationSoustraitance ? "bg-gray-100 text-gray-500" : undefined} />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="telephone">Téléphone</Label>
                        <Input id="telephone" name="telephone" placeholder="06 07 46 74 09" value={formData.telephone} onChange={handleChange} />
                      </div>

                      {/* Rôle */}
                      <div className="space-y-2">
                        <Label>Je suis *</Label>
                        <RadioGroup value={formData.role} onValueChange={handleRoleChange} className="flex flex-col space-y-1">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="formateur_certifie" id="formateur_certifie" />
                            <Label htmlFor="formateur_certifie">Formateur indépendant certifié Qualiopi</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="of_complet" id="of_complet" />
                            <Label htmlFor="of_complet">Organisme de formation (OF)</Label>
                          </div>
                        </RadioGroup>
                      </div>

                      {!oauthCompletion && (
                        <>
                          {/* Mot de passe */}
                          <div className="space-y-2">
                            <Label htmlFor="password">
                              <span className="inline-flex items-center gap-1">
                                <span className="bg-exsenco-blue text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">3</span>
                                Mot de passe *
                              </span>
                            </Label>
                            <div className="relative">
                              <Input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="Ex: MonMot2Passe!" value={formData.password} onChange={handleChange} required className="pr-10" />
                              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                            {/* Indicateur de force */}
                            {formData.password.length > 0 && (() => {
                              const check = validatePassword(formData.password);
                              return (
                                <div className="space-y-1 pt-1">
                                  {check.rules.map((rule) => (
                                    <div key={rule.label} className={`flex items-center gap-1.5 text-xs ${rule.ok ? "text-green-600" : "text-gray-400"}`}>
                                      <span>{rule.ok ? "✓" : "○"}</span>
                                      <span>{rule.label}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirmer le mot de passe *</Label>
                            <div className="relative">
                              <Input id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="••••••••" value={formData.confirmPassword} onChange={handleChange} required className="pr-10" />
                              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}

                </CardContent>
                <CardFooter className="flex flex-col">
                  {siretTrouve ? (
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading
                        ? "Création de votre espace..."
                        : oauthCompletion
                          ? `Finaliser mon espace ${formData.raisonSociale}`
                          : `Créer l'espace ${formData.raisonSociale}`}
                    </Button>
                  ) : (
                    <p className="text-sm text-gray-500 text-center">
                      Saisissez votre SIRET et cliquez sur Rechercher pour commencer
                    </p>
                  )}
                  {!oauthCompletion && (
                    <p className="mt-4 text-center text-sm text-gray-600">
                      Déjà un compte ?{" "}
                      <button
                        type="button"
                        onClick={() => setMode("access")}
                        className="text-exsenco-blue hover:underline"
                      >
                        Se connecter
                      </button>
                    </p>
                  )}
                </CardFooter>
              </form>
            </Card>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Register;
