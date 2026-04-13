import { useState } from "react";
import { register } from "@/features/auth/api";
import { useNavigate, Link } from "react-router-dom";

export const RegisterPage = () => {
    const navigate = useNavigate();

    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const handleRegister = async () => {
        try {
            setError("");
            setSuccess("");

            await register(username, email, password);

            setSuccess("User created successfully");

            setTimeout(() => navigate("/"), 1000);
        } catch (e) {
            setError("Registration failed");
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>Register</h2>

            <input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
            />

            <br />

            <input
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />

            <br />

            <input
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />

            <br />

            <button onClick={handleRegister}>Register</button>

            {error && <div style={{ color: "red" }}>{error}</div>}
            {success && <div style={{ color: "green" }}>{success}</div>}

            <p>
                Already have an account? <Link to="/">Login</Link>
            </p>
        </div>
    );
};