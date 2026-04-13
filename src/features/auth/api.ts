import axios from "axios";
import { API_URL } from "@/shared/config";
import { setAuthToken } from "@/shared/lib/authStorage";

export const login = async (username: string, password: string) => {
    const { data } = await axios.post(`${API_URL}/auth/login`, {
        username,
        password,
    });

    if (data === "Incorrect credentials") {
        throw new Error("Invalid credentials");
    }

    const token = String(data).trim();
    setAuthToken(token);
    return token;
};

export const validate = async (token: string) => {
    const { data } = await axios.get(`${API_URL}/auth/validate`, {
        params: { token },
    });

    return data;
};

export const register = async (
    username: string,
    email: string,
    password: string
) => {
    const { data } = await axios.post(`${API_URL}/auth/register`, {
        username,
        email,
        password,
    });

    return data;
};