import axios from "axios";
import { API_URL } from "@/shared/config";
import { getUserIdFromToken } from "@/shared/lib/jwt";

export type UserProfileDto = {
    authId?: number;
    username?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    email?: string;
};

const getAuthHeaders = () => {
    const authId = getUserIdFromToken();
    return authId ? { "X-User-Id": String(authId) } : {};
};

export const getUserProfile = async (authId: number): Promise<UserProfileDto> => {
    
    const { data } = await axios.get(`${API_URL}/users/${authId}`, {
        headers: getAuthHeaders()
    });
    return data;
};

/** Обновить свой профиль */
export const updateMyProfile = async (profileData: {
    username?: string;
    firstName?: string;
    lastName?: string;
}): Promise<UserProfileDto> => {
    const { data } = await axios.put(`${API_URL}/users/me`, profileData, {
        headers: getAuthHeaders(),
    });
    return data;
};

/** Обновить аватар */
export const updateMyAvatar = async (formData: FormData): Promise<any> => {
    const { data } = await axios.patch(`${API_URL}/users/me/avatar`, formData, {
        headers: {
            ...getAuthHeaders(),
            "Content-Type": "multipart/form-data",
        },
    });
    return data;
};

/** Создать пользователя (регистрация) */
export const createUser = async (userData: {
    username: string;
    email: string;
    password: string;
}): Promise<any> => {
    const { data } = await axios.post(`${API_URL}/users`, userData);
    return data;
};

/** Валидация пользователей */
export const validateUsers = async (userIds: number[]): Promise<any> => {
    const { data } = await axios.post(`${API_URL}/users/validate`, userIds);
    return data;
};