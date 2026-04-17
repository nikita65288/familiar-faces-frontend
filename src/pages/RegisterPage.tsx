import { useState } from "react";
import { register } from "@/features/auth/api";
import { useNavigate, Link } from "react-router-dom";

export const RegisterPage = () => {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const handleRegister = async () => {
        try {
            setError("");
            setSuccess("");
            if (password !== confirmPassword) {
                setError("Пароли не совпадают");
                return;
            }
            await register(username, email, password);
            setSuccess("Пользователь успешно создан");
            setTimeout(() => navigate("/"), 1000);
        } catch {
            setError("Ошибка регистрации");
        }
    };

    const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box" };

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
                <h2 style={{ margin: "0 0 8px", textAlign: "center" }}>Register</h2>
                <input placeholder="Логин" value={username}
                       onChange={(e) => setUsername(e.target.value)} style={inputStyle} />
                <input placeholder="Email" value={email}
                       onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
                <input placeholder="Пароль" type="password" value={password}
                       onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
                <input placeholder="Подтвердить пароль" type="password" value={confirmPassword}
                       onChange={(e) => setConfirmPassword(e.target.value)}
                       onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                       style={inputStyle} />
                <button onClick={handleRegister} style={{ width: "100%", padding: "10px 0" }}>
                    Register
                </button>
                {error && <div style={{ color: "red", textAlign: "center" }}>{error}</div>}
                {success && <div style={{ color: "green", textAlign: "center" }}>{success}</div>}
                <p style={{ textAlign: "center", margin: 0 }}>
                    Уже есть аккаунт? <Link to="/">Войти</Link>
                </p>
            </div>
        </div>
    );
};
