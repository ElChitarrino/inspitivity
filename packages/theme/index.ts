export const THEMES = ["electric", "crimson"] as const;

export type Theme = (typeof THEMES)[number];

export function isTheme(value: string | null): value is Theme {
  return value !== null && THEMES.includes(value as Theme);
}

export function resolveInitialTheme(
  savedTheme: string | null,
  hasExistingProjects: boolean,
): Theme {
  if (isTheme(savedTheme)) return savedTheme;
  return hasExistingProjects ? "electric" : "crimson";
}
