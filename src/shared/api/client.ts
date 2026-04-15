import axios from "axios";
import { API_URL } from "@/shared/config";
import { getAuthToken, clearAuthToken } from "@/shared/lib/authStorage";

export const api = axios.create({
    baseURL: API_URL,
    withCredentials: false,
});

api.interceptors.request.use((config) => {
    const token = getAuthToken();
    if (token) {
        config.headers = config.headers ?? {};
        (config.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (r) => r,
    (err) => {
        if (err?.response?.status === 401) clearAuthToken();
        return Promise.reject(err);
    },
);