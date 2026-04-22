import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearAuthToken } from "@/shared/lib/authStorage";
import { getTheme, toggleTheme, type Theme } from "@/shared/lib/theme";

const tabs = [
    { path: "/chats", label: "Чатики" },
    { path: "/friends", label: "Друзья Никиты" },
    { path: "/profile", label: "Я" },
];

export default function Layout() {
    const nav = useNavigate();
    const loc = useLocation();
    const [theme, setTheme] = useState<Theme>(getTheme);

    const logout = () => { clearAuthToken(); nav("/login"); };

    return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>
            <header style={{
                display: "flex", gap: 8, padding: 12,
                borderBottom: "1px solid var(--border)",
                alignItems: "center", flexShrink: 0,
                background: "var(--bg)",
            }}>
                {tabs.map(t => {
                    const active = loc.pathname.startsWith(t.path);
                    return (
                        <button key={t.path} onClick={() => nav(t.path)} style={{
                            padding: "8px 14px", border: "1px solid var(--border)",
                            borderRadius: 8, cursor: "pointer",
                            background: active ? "#1976d2" : "var(--bg-card, var(--bg))",
                            color: active ? "#fff" : "var(--text-h)",
                            fontWeight: 600,
                        }}>
                            {t.label}
                        </button>
                    );
                })}
                <div style={{ flex: 1 }} />
                <button
                    onClick={() => setTheme(toggleTheme())}
                    style={{
                        padding: "8px 14px", borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--bg-card, var(--bg))",
                        color: "var(--text-h)", cursor: "pointer",
                    }}
                >
                    {theme === "dark" ? "☀ Светлая" : "☾ Тёмная"}
                </button>
                <button onClick={logout} style={{
                    padding: "8px 14px", borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-card, var(--bg))",
                    color: "var(--text-h)", cursor: "pointer",
                }}>
                    Выход
                </button>
            </header>
            <main style={{ flex: 1, padding: 16, minHeight: 0, overflow: "hidden", background: "var(--bg)" }}>
                <Outlet />
            </main>
        </div>
    );
}
