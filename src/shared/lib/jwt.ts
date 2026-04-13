import { jwtDecode } from "jwt-decode";
import { getAuthToken } from "@/shared/lib/authStorage";

export const getUserIdFromToken = (): number | null => {
    const token = getAuthToken();
    if (!token) return null;

    try {
        const decoded: any = jwtDecode(token.trim());

        const raw =
            decoded.userId ??
            decoded.id ??
            decoded.sub ??
            decoded.user_id ??
            decoded.authId;

        const parsed = Number(raw);

        return Number.isFinite(parsed) ? parsed : null;
    } catch {
        return null;
    }
};
