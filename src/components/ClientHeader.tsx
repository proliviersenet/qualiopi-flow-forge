import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface ClientHeaderProps {
  active: "formations" | "profil" | "parametres";
  email?: string;
  onLogout: () => void;
}

const NAV_ITEMS = [
  { key: "formations", label: "Mes formations", to: "/espace-client" },
  { key: "profil", label: "Mon profil", to: "/espace-client/profil" },
  { key: "parametres", label: "Paramètres", to: "/espace-client/parametres" },
] as const;

// Header dédié à l'espace client — distinct du Header.tsx public/formateur.
// Contrairement à ce dernier, ce header n'a pas vocation à être partagé avec
// les pages publiques : l'espace client est un tunnel authentifié à part.
const ClientHeader = ({ active, email, onLogout }: ClientHeaderProps) => {
  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
      <div className="container mx-auto px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/espace-client" className="flex items-center gap-2">
          <span className="text-xl font-bold" style={{ color: "#25245e" }}>QalioFlex</span>
          <span className="text-xs text-gray-400">Espace client</span>
        </Link>

        <nav className="flex items-center gap-1 md:gap-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                active === item.key ? "text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
              style={active === item.key ? { background: "#25245e" } : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {email && <span className="text-sm text-gray-500 hidden md:inline truncate max-w-[180px]">{email}</span>}
          <Button variant="outline" size="sm" onClick={onLogout}>Se déconnecter</Button>
        </div>
      </div>
    </header>
  );
};

export default ClientHeader;
