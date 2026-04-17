export type Theme = "light" | "dark";
const THEME_KEY = "ff.theme";

function apply(theme: Theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
}

export function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    if (saved) apply(saved);
}

export function getTheme(): Theme {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function toggleTheme(): Theme {
    const next: Theme = getTheme() === "dark" ? "light" : "dark";
    apply(next);
    return next;
}
