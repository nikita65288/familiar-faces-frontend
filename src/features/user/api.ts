import { api } from "@/shared/api/client";

export type UserProfileDto = {
    id?: number;
    authId?: number;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    bio?: string;
    avatarUrl?: string;
};

export const getMyProfile = () => api.get<UserProfileDto>("/users/me").then(r => r.data);

/** Профиль по authId */
export const getUserProfile = (authId: number) =>
    api.get<UserProfileDto>(`/users/${authId}`).then(r => r.data);

/** Обновить свой профиль */
export type UpdateUserProfileDto = Partial<Pick<UserProfileDto, "firstName" | "lastName" | "bio">>;
export const updateMyProfile = (d: UpdateUserProfileDto) =>
    api.put<UserProfileDto>("/users/me", d).then(r => r.data);

/** Обновить аватар. */
export const updateMyAvatar = (avatarUrl: string) =>
    api.patch<UserProfileDto>("/users/me/avatar", { avatarUrl }).then(r => r.data);

/** Создать пользователя (регистрация) */
export const createUser = async (userData: {
    username: string;
    email: string;
    password: string;
}): Promise<any> => {
    const { data } = await api.post("/users", userData);
    return data;
};

/** Валидация пользователей */
export const validateUsers = async (authIds: number[]): Promise<boolean> => {
    const { data } = await api.post<boolean>("/users/validate", authIds);
    return data;
};