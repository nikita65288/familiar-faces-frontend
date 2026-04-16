import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { clearAuthToken } from "@/shared/lib/authStorage";

const tabs = [
    { path: "/chats", label: "Chats" },
    { path: "/friends", label: "Friends" },
    { path: "/profile", label: "Profile" },
];

export default function Layout() {
    const nav = useNavigate();
    const loc = useLocation();

    const logout = () => { clearAuthToken(); nav("/login"); };

    return (
        // height:100vh + overflow:hidden => дочерние страницы управляют своим скроллом
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <header style={{ display: "flex", gap: 8, padding: 12, borderBottom: "1px solid #eee", alignItems: "center", flexShrink: 0 }}>
                {tabs.map(t => {
                    const active = loc.pathname.startsWith(t.path);
                    return (
                        <button
                            key={t.path}
                            onClick={() => nav(t.path)}
                            style={{
                                padding: "8px 14px", border: "1px solid #cfd8dc",
                                borderRadius: 8, cursor: "pointer",
                                background: active ? "#1976d2" : "#fff",
                                color: active ? "#fff" : "#263238",
                                fontWeight: 600,
                            }}>
                            {t.label}
                        </button>
                    );
                })}
                <div style={{ flex: 1 }} />
                <button onClick={logout} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #cfd8dc", background: "#fff", cursor: "pointer" }}>
                    Logout
                </button>
            </header>
            {/* minHeight:0 нужен, чтобы flex-child мог сжиматься и передавать скролл внутрь */}
            <main style={{ flex: 1, padding: 16, minHeight: 0, overflow: "hidden" }}>
                <Outlet />
            </main>
        </div>
    );
}
