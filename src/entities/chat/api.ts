import { api } from "@/shared/api/client";

export const getChats = () => api.get("/chats");

export const getMessages = (chatId: number) =>
    api.get(`/chats/${chatId}/messages`, {
        params: { page: 0, size: 50 },
    });

export const sendMessage = (chatId: number, content: string) =>
    api.post(`/chats/${chatId}/messages`, { content });