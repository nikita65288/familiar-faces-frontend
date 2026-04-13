import axios from "axios";
import { API_URL } from "@/shared/config";
import { getUserIdFromToken } from "@/shared/lib/jwt";

const getAuthHeaders = () => {
    const authId = getUserIdFromToken();
    return authId ? { "X-User-Id": String(authId) } : {};
};

/** Список друзей */
export const getFriends = async (): Promise<any[]> => {
    const { data } = await axios.get(`${API_URL}/friends`, {
        headers: getAuthHeaders(),
    });
    return data;
};

/** Отправить заявку в друзья */
export const sendFriendRequest = async (targetAuthId: number): Promise<any> => {
    const { data } = await axios.post(
        `${API_URL}/friends/requests`,
        { targetAuthId },
        { headers: getAuthHeaders() }
    );
    return data;
};

/** Входящие заявки */
export const getIncomingRequests = async (): Promise<any[]> => {
    const { data } = await axios.get(`${API_URL}/friends/requests/incoming`, {
        headers: getAuthHeaders(),
    });
    return data;
};

/** Исходящие заявки */
export const getOutgoingRequests = async (): Promise<any[]> => {
    const { data } = await axios.get(`${API_URL}/friends/requests/outgoing`, {
        headers: getAuthHeaders(),
    });
    return data;
};

/** Отменить исходящую заявку */
export const cancelFriendRequest = async (friendshipId: number): Promise<void> => {
    await axios.delete(`${API_URL}/friends/requests/${friendshipId}`, {
        headers: getAuthHeaders(),
    });
};

/** Принять заявку */
export const acceptFriendRequest = async (friendshipId: number): Promise<any> => {
    const { data } = await axios.post(
        `${API_URL}/friends/requests/${friendshipId}/accept`,
        null,
        { headers: getAuthHeaders() }
    );
    return data;
};

/** Отклонить заявку */
export const rejectFriendRequest = async (friendshipId: number): Promise<any> => {
    const { data } = await axios.post(
        `${API_URL}/friends/requests/${friendshipId}/reject`,
        null,
        { headers: getAuthHeaders() }
    );
    return data;
};

/** Удалить друга */
export const removeFriend = async (otherUserAuthId: number): Promise<void> => {
    await axios.delete(`${API_URL}/friends/${otherUserAuthId}`, {
        headers: getAuthHeaders(),
    });
};