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

export const getUserProfile = (authId: number) =>
    api.get<UserProfileDto>(`/users/${authId}`).then(r => r.data);

export const searchUserByUsername = (username: string) =>
    api.get<UserProfileDto>("/users/search", { params: { username } }).then(r => r.data);

export type UpdateUserProfileDto = Partial<Pick<UserProfileDto, "firstName" | "lastName" | "bio">>;
export const updateMyProfile = (d: UpdateUserProfileDto) =>
    api.put<UserProfileDto>("/users/me", d).then(r => r.data);

export const updateMyAvatar = (avatarUrl: string) =>
    api.patch<UserProfileDto>("/users/me/avatar", { avatarUrl }).then(r => r.data);

export const createUser = async (userData: {
    username: string;
    email: string;
    password: string;
}): Promise<any> => {
    const { data } = await api.post("/users", userData);
    return data;
};

export const validateUsers = async (authIds: number[]): Promise<boolean> => {
    const { data } = await api.post<boolean>("/users/validate", authIds);
    return data;
};
