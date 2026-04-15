import { api } from "@/shared/api/client";
import type { FriendshipDto } from "@/entities/friendship/types";

export const getFriends = () => api.get<FriendshipDto[]>("/friends").then(r => r.data);
export const getIncoming = () => api.get<FriendshipDto[]>("/friends/requests/incoming").then(r => r.data);
export const getOutgoing = () => api.get<FriendshipDto[]>("/friends/requests/outgoing").then(r => r.data);

export const sendFriendRequest = (addresseeId: number) =>
    api.post<FriendshipDto>("/friends/requests", { addresseeId }).then(r => r.data);

export const acceptRequest = (id: number) =>
    api.post<FriendshipDto>(`/friends/requests/${id}/accept`).then(r => r.data);

export const rejectRequest = (id: number) =>
    api.post<FriendshipDto>(`/friends/requests/${id}/reject`).then(r => r.data);

export const cancelRequest = (id: number) =>
    api.delete(`/friends/requests/${id}`).then(r => r.data);

export const removeFriend = (otherAuthId: number) =>
    api.delete(`/friends/${otherAuthId}`).then(r => r.data);