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
        } catch (e) {
            setError("Invalid username or password");
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>Login</h2>

            <input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
            />

            <br />

            <input
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />

            <br />

            <button onClick={handleLogin}>Login</button>

            {error && <div style={{ color: "red" }}>{error}</div>}

            <p>
                No account? <Link to="/register">Register</Link>
            </p>
        </div>
    );
};