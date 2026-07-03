// Règles de sécurité communes à toute l'application
export interface PasswordCheck {
  valid: boolean;
  rules: {
    label: string;
    ok: boolean;
  }[];
  message: string;
}

export const validatePassword = (password: string): PasswordCheck => {
  const rules = [
    { label: "8 caractères minimum",          ok: password.length >= 8 },
    { label: "1 majuscule (A-Z)",             ok: /[A-Z]/.test(password) },
    { label: "1 minuscule (a-z)",             ok: /[a-z]/.test(password) },
    { label: "1 chiffre (0-9)",               ok: /[0-9]/.test(password) },
    { label: "1 caractère spécial (!@#...)",  ok: /[^A-Za-z0-9]/.test(password) },
  ];

  const failed = rules.filter((r) => !r.ok);
  return {
    valid: failed.length === 0,
    rules,
    message: failed.length > 0
      ? `Mot de passe trop faible — manque : ${failed.map((r) => r.label).join(", ")}`
      : "Mot de passe valide",
  };
};
