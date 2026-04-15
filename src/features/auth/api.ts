import axios from "axios";
import { API_URL } from "@/shared/config";
import { setAuthToken } from "@/shared/lib/authStorage";

const JSON_HEADERS = { headers: { "Content-Type": "application/json" } };

export const login = async (username: string, password: string) => {
    const { data } = await axios.post(
        `${API_URL}/auth/login`,
        { username, password },
        JSON_HEADERS,
    );

    if (data === "Incorrect credentials") {
        throw new Error("Invalid credentials");
    }
    const token = String(data).trim();
    setAuthToken(token, true);
    return token;
};

export const register = async (username: string, email: string, password: string) => {
    const { data } = await axios.post(
        `${API_URL}/auth/register`,
        { username, email, password },
        JSON_HEADERS,
    );
    return data;
};

export const validate = async (token: string) => {
    const { data } = await axios.get(`${API_URL}/auth/validate`, {
        params: { token },
    });
    return data;
};