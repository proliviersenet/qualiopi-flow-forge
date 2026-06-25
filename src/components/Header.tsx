
import { useState } from 'react';
import { Link } from 'react-router-dom';
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

interface HeaderProps {
  user?: {
    name: string;
    email: string;
    profileImage?: string;
  };
  onLogout?: () => void;
}

const Header = ({ user, onLogout }: HeaderProps) => {
  const isMobile = useIsMobile();
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/" className="flex items-center">
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout}>
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
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
