import { jwtDecode } from "jwt-decode";
import { getAuthToken } from "./authStorage";

export const getUserIdFromToken = (): number | null => {
    const t = getAuthToken();
    if (!t) return null;
    try {
        const payload = jwtDecode<{ sub: string | number }>(t);
        return Number(payload.sub);
    } catch {
        return null;
    }
};
