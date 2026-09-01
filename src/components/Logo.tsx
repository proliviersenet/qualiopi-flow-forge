// Marque QualioFlex (chantier identité visuelle, 01/09) : un anneau (le "Q") et
// une coche orange qui en part, en bas à droite, façon paraphe de validation —
// cohérent avec la charte ExSenco déjà utilisée dans toute l'appli (exsenco-blue
// / exsenco-orange, cf. tailwind.config). Icône seule ou icône + nom, au choix.

interface LogoProps {
  /** Hauteur de l'icône en pixels (largeur identique, ratio 1:1). */
  size?: number;
  /** Affiche le nom "QualioFlex" à côté de l'icône. */
  withWordmark?: boolean;
  /** Couleur du texte du wordmark (le "Qualio"). Le "Flex" reste toujours orange. */
  wordmarkColor?: string;
  className?: string;
}

const Logo = ({ size = 28, withWordmark = false, wordmarkColor = "#25245e", className }: LogoProps) => {
  const icon = (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <circle cx="46" cy="46" r="27" stroke="#25245e" strokeWidth="11" />
      <path
        d="M59 70 C66 76, 72 80, 77 76 C82 72, 80 60, 92 40"
        stroke="#f2901e"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (!withWordmark) return <span className={className}>{icon}</span>;

  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: size * 0.32 }}>
      {icon}
      <span style={{ fontWeight: 800, fontSize: size * 0.78, lineHeight: 1, letterSpacing: "-0.01em" }}>
        <span style={{ color: wordmarkColor }}>Qualio</span>
        <span style={{ color: "#f2901e" }}>Flex</span>
      </span>
    </span>
  );
};

export default Logo;
