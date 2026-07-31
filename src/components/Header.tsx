
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
import { User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface HeaderProps {
  user?: {
    name: string;
    email: string;
    profileImage?: string;
  };
  onLogout?: () => void;
  logoHref?: string;
}

const Header = ({ user: userProp, onLogout, logoHref }: HeaderProps) => {
  // La détection "connecté ou non" ne doit JAMAIS reposer uniquement sur le prop
  // `user` passé par la page : certaines pages publiques (mentions légales, aide,
  // contact...) passent un objet vide, et la page d'accueil n'en passe aucun. Si on
  // se basait dessus, le logo et tous les liens "Retour" qui ramènent vers ces pages
  // publiques donneraient l'impression à un utilisateur connecté qu'il a été
  // déconnecté. On se base donc sur la session réelle, partagée par toute
  // l'application via AuthContext.
  const { session, user: authUser } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const isAuthenticated = !!session;
  const role = authUser?.user_metadata?.role;

  const user = isAuthenticated
    ? {
        name: userProp?.name || authUser?.user_metadata?.nom_complet || authUser?.email || "",
        email: userProp?.email || authUser?.email || "",
        profileImage: userProp?.profileImage || "",
      }
    : undefined;

  const defaultHref = isAuthenticated ? (role === "client" ? "/espace-client" : "/dashboard") : "/login";

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  const handleLogoutClick = async () => {
    if (onLogout) { onLogout(); return; }
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to={logoHref ?? defaultHref} className="flex items-center">
              <span className="text-exsenco-blue text-2xl font-bold">QalioFlex</span>
            </Link>
          </div>

          {!isMobile && (
            <nav className="hidden md:flex items-center space-x-6">
              <Link to="/dashboard" className="text-gray-700 hover:text-exsenco-blue font-medium">
                Tableau de bord
              </Link>
              <Link to="/formations" className="text-gray-700 hover:text-exsenco-blue font-medium">
                Formations
              </Link>
              <Link to="/clients" className="text-gray-700 hover:text-exsenco-blue font-medium">
                Clients
              </Link>
              <Link to="/documents" className="text-gray-700 hover:text-exsenco-blue font-medium">
                Documents
              </Link>
              <Link to="/bpf" className="text-gray-700 hover:text-exsenco-blue font-medium">
                BPF
              </Link>
              <Link to="/notations-formateur" className="text-gray-700 hover:text-exsenco-blue font-medium">
                Notations
              </Link>
              <Link to="/chatbot-escalades" className="text-gray-700 hover:text-exsenco-blue font-medium">
                Escalades
              </Link>
            </nav>
          )}

          <div className="flex items-center space-x-4">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.profileImage} alt={user.name} />
                      <AvatarFallback className="bg-exsenco-blue text-white">
                        {user.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile">Mon profil</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings">Paramètres</Link>
                  </DropdownMenuItem>
                  {role !== "client" && (
                    <DropdownMenuItem asChild>
                      <Link to="/factures">Factures</Link>
                    </DropdownMenuItem>
                  )}
                  {role !== "client" && (
                    <DropdownMenuItem asChild>
                      <Link to="/qualiopi-statut">Statut réglementaire</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogoutClick}>
                    Se déconnecter
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex space-x-2">
                <Link to="/login">
                  <Button variant="outline" size="sm">Connexion</Button>
                </Link>
                <Link to="/register">
                  <Button size="sm">Inscription</Button>
                </Link>
              </div>
            )}

            {isMobile && (
              <Button variant="ghost" className="md:hidden" onClick={toggleMobileMenu}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-6 h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={showMobileMenu ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16m-7 6h7"}
                  />
                </svg>
              </Button>
            )}
          </div>
        </div>

        {isMobile && showMobileMenu && (
          <nav className="mt-4 pb-4 flex flex-col space-y-2">
            <Link
              to="/dashboard"
              className="text-gray-700 hover:text-exsenco-blue font-medium py-2 px-4 rounded hover:bg-gray-50"
              onClick={() => setShowMobileMenu(false)}
            >
              Tableau de bord
            </Link>
            <Link
              to="/formations"
              className="text-gray-700 hover:text-exsenco-blue font-medium py-2 px-4 rounded hover:bg-gray-50"
              onClick={() => setShowMobileMenu(false)}
            >
              Formations
            </Link>
            <Link
              to="/clients"
              className="text-gray-700 hover:text-exsenco-blue font-medium py-2 px-4 rounded hover:bg-gray-50"
              onClick={() => setShowMobileMenu(false)}
            >
              Clients
            </Link>
            <Link
              to="/documents"
              className="text-gray-700 hover:text-exsenco-blue font-medium py-2 px-4 rounded hover:bg-gray-50"
              onClick={() => setShowMobileMenu(false)}
            >
              Documents
            </Link>
            <Link
              to="/bpf"
              className="text-gray-700 hover:text-exsenco-blue font-medium py-2 px-4 rounded hover:bg-gray-50"
              onClick={() => setShowMobileMenu(false)}
            >
              BPF
            </Link>
            <Link
              to="/notations-formateur"
              className="text-gray-700 hover:text-exsenco-blue font-medium py-2 px-4 rounded hover:bg-gray-50"
              onClick={() => setShowMobileMenu(false)}
            >
              Notations
            </Link>
            <Link
              to="/chatbot-escalades"
              className="text-gray-700 hover:text-exsenco-blue font-medium py-2 px-4 rounded hover:bg-gray-50"
              onClick={() => setShowMobileMenu(false)}
            >
              Escalades
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
