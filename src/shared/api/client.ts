import axios from "axios";
import { getAuthToken } from "@/shared/lib/authStorage";

export const api = axios.create({
    baseURL: "",
});

api.interceptors.request.use((config) => {
    const token = getAuthToken();

    if (token) {
        config.headers.Authorization = `Bearer ${token.trim()}`;
    }

    return config;
});