import { useState } from "react";
import { login } from "@/features/auth/api";
import { useNavigate, Link } from "react-router-dom";

export const getAuthToken = () => localStorage.getItem("token");

export const LoginPage = () => {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleLogin = async () => {
        try {
            setError("");
            const token = await login(username, password);
            localStorage.setItem("token", token);
            navigate("/chats");
        } catch {
            setError("Неверные логин или пароль");
        }
    };

    return (
        <div style={{
            minHeight: "100vh", display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "var(--bg)",
        }}>
            <div style={{
                width: "100%", maxWidth: 380,
                padding: "36px 40px",
                border: "1px solid var(--border)", borderRadius: 12,
                boxShadow: "var(--shadow)",
                display: "flex", flexDirection: "column", gap: 12,
                background: "var(--bg)",
            }}>
                <h2 style={{ margin: "0 0 8px", textAlign: "center" }}>Login</h2>
                <input
                    placeholder="Логин"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box" }}
                />
                <input
                    placeholder="Пароль"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    style={{ width: "100%", boxSizing: "border-box" }}
                />
                <button onClick={handleLogin} style={{ width: "100%", padding: "10px 0" }}>
                    Войди в меня
                </button>
                {error && <div style={{ color: "red", textAlign: "center" }}>{error}</div>}
                <p style={{ textAlign: "center", margin: 0 }}>
                    Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
                </p>
            </div>
        </div>
    );
};
