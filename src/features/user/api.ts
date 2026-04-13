import { api } from "@/shared/api/client";

export type UserProfileDto = {
    authId?: number;
    username?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
};

export const getUserProfile = async (authId: number) => {
    const { data } = await api.get(`/users/${authId}`);
    return data as UserProfileDto;
};