import { api } from "@/shared/api/client";

export const CHAT_TYPE = { PRIVATE: 1, GROUP: 2 } as const;
export type ChatType = typeof CHAT_TYPE[keyof typeof CHAT_TYPE];

export type ChatDto = {
    id: number;
    name?: string;
    type: ChatType;
    avatarUrl?: string;
    participantIds: number[];
    otherParticipantId?: number;
    lastMessage?: string;
    lastMessageAt?: string;
    lastMessageSenderId?: number;
    createdAt: string;
};

export type MessageDto = {
    id: number; chatId: number; senderId: number;
    content?: string; attachmentUrl?: string;
    isRead: boolean; createdAt: string;
    reactions?: Record<string, number[]>;
};

export const getChats = () => api.get<ChatDto[]>("/chats").then(r => r.data);
export const getMessages = (chatId: number, page = 0, size = 30) =>
    api.get<{ content: MessageDto[] }>(`/chats/${chatId}/messages`, { params: { page, size } })
        .then(r => r.data);

export const sendMessage = (chatId: number, content: string, attachmentUrl?: string) =>
    api.post<MessageDto>(`/chats/${chatId}/messages`, { content, attachmentUrl }).then(r => r.data);

export const markAsRead = (chatId: number) =>
    api.post(`/chats/${chatId}/read`).then(r => r.data);

export const createPrivateChat = (participantId: number, firstMessage?: string) =>
    api.post<ChatDto>("/chats", {
        type: CHAT_TYPE.PRIVATE,
        participantIds: [participantId],
        firstMessage,
    }).then(r => r.data);

export const createGroupChat = (name: string, participantIds: number[]) =>
    api.post<ChatDto>("/chats", {
        type: CHAT_TYPE.GROUP, name, participantIds,
    }).then(r => r.data);

export const updateChatAvatar = (chatId: number, avatarUrl: string) =>
    api.patch<ChatDto>(`/chats/${chatId}/avatar`, { avatarUrl }).then(r => r.data);

export const leaveChat = (chatId: number) =>
    api.delete(`/chats/${chatId}/participants/me`).then(r => r.data);

export const toggleReaction = (chatId: number, messageId: number, emoji: string) =>
    api.post(`/chats/${chatId}/messages/${messageId}/reactions`, { emoji }).then(r => r.data);
