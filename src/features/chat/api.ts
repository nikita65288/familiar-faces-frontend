import { api } from "@/shared/api/axios";

export const getChats = async () => {
    try {
        const { data } = await api.get("/chats");
        return data;
    } catch (error: any) {
        console.error("Error loading chats:", error.response?.data || error.message);
        throw error;
    }
};

export const getMessages = async (chatId: number, page: number = 0, size: number = 20) => {
    const { data } = await api.get(`/chats/${chatId}/messages`, {
        params: { page, size },
    });
    return data; // возвращаем весь объект Page (содержит content, totalPages, etc.)
};

export const sendMessage = async (chatId: number, content: string) => {
    const { data } = await api.post(`/chats/${chatId}/messages`, {
        content,
    });

    return data;
};

export const markChatAsRead = (chatId: number) => {
    return api.post(`/chats/${chatId}/read`);
};