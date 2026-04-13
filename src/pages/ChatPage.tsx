import { switchChat, disconnectWebSocket } from "@/shared/api/ws";
import { getChats, getMessages, sendMessage, markChatAsRead  } from "@/features/chat/api";
import { getUserProfile } from "@/features/user/api";
import { getUserIdFromToken } from "@/shared/lib/jwt";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ChatDto = {
    id: number;
    name?: string;
    type?: string;
    createdAt?: string;
};

type MessageDto = {
    id: number;
    chatId: number;
    senderId: number;
    content: string;
    read: boolean;
    createdAt: string;
};

function getDisplayName(profile: any, fallbackId: number) {
    const username =
        profile?.username ??
        profile?.name ??
        [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();

    return username || `User ${fallbackId}`;
}

export const ChatPage = () => {
    const [chats, setChats] = useState<ChatDto[]>([]);
    const [messages, setMessages] = useState<MessageDto[]>([]);
    const [activeChat, setActiveChat] = useState<ChatDto | null>(null);
    const [text, setText] = useState("");
    const [userNames, setUserNames] = useState<Record<number, string>>({});
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const myId = Number(getUserIdFromToken() ?? 0);
    const currentChatIdRef = useRef<number | null>(null);
    const markReadDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const lastMarkedChatRef = useRef<number | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const nextPageRef = useRef(0);
    const prevScrollTopRef = useRef(0);
    const prevScrollHeightRef = useRef(0);
    const disableAutoScrollRef = useRef(false);

    const loadChats = async () => {
        const data = await getChats();
        setChats(data);
    };

    const ensureUserNames = async (incomingMessages: MessageDto[]) => {
        const uniqueSenderIds = [...new Set(incomingMessages.map((m) => Number(m.senderId)))];
        const missingIds = uniqueSenderIds.filter((id) => !userNames[id]);
        if (!missingIds.length) return;
        const resolved = await Promise.all(
            missingIds.map(async (id) => {
                try {
                    const profile = await getUserProfile(id);
                    return [id, getDisplayName(profile, id)] as const;
                } catch {
                    return [id, `User ${id}`] as const;
                }
            })
        );
        setUserNames((prev) => ({ ...prev, ...Object.fromEntries(resolved) }));
    };

    const markCurrentChatAsRead = useCallback(() => {
        if (!currentChatIdRef.current) return;
        const chatId = currentChatIdRef.current;
        // Предотвращаем повторные вызовы для того же чата в течение 500 мс
        if (lastMarkedChatRef.current === chatId) return;
        lastMarkedChatRef.current = chatId;

        if (markReadDebounceRef.current) clearTimeout(markReadDebounceRef.current);
        markReadDebounceRef.current = setTimeout(async () => {
            try {
                await markChatAsRead(chatId);
            } catch (error) {
                console.error("Failed to mark chat as read", error);
            } finally {
                lastMarkedChatRef.current = null;
            }
        }, 300);
    }, []);

    const loadMessages = useCallback(async (chatId: number, page: number, reset: boolean = false) => {
        if (reset) {
            setMessages([]);
            setHasMore(true);
            nextPageRef.current = 0;
        }
        const data = await getMessages(chatId, page, 20);
        const newMessages = data.content;
        if (reset) {
            setMessages(newMessages);
        } else {
            // Добавляем только те сообщения, которых ещё нет (защита от дублей)
            setMessages(prev => {
                const existingIds = new Set(prev.map(m => m.id));
                const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
                return [...uniqueNew, ...prev];
            });
        }
        setHasMore(!data.last);
        if (reset) {
            nextPageRef.current = 1;
        } else {
            nextPageRef.current = page + 1;
        }
        await ensureUserNames(newMessages);
        if (reset) {
            markCurrentChatAsRead();
        }
    }, [ensureUserNames, markCurrentChatAsRead]);

    const loadOlderMessages = async () => {
        if (!currentChatIdRef.current || isLoadingMore || !hasMore) return;

        const container = messagesContainerRef.current;
        if (!container) return;

        // Запоминаем позицию до загрузки
        prevScrollTopRef.current = container.scrollTop;
        prevScrollHeightRef.current = container.scrollHeight;

        // Отключаем автоскролл
        disableAutoScrollRef.current = true;
        setIsLoadingMore(true);

        try {
            await loadMessages(currentChatIdRef.current, nextPageRef.current, false);
        } finally {
            // После обновления DOM восстанавливаем позицию
            requestAnimationFrame(() => {
                if (container) {
                    const newScrollHeight = container.scrollHeight;
                    container.scrollTop = prevScrollTopRef.current + (newScrollHeight - prevScrollHeightRef.current);
                }
                disableAutoScrollRef.current = false;
                setIsLoadingMore(false);
            });
        }
    };

    const handleWsEvent = async (event: any) => {
        if (event?.type === "NEW_MESSAGE") {
            const incoming = event.payload as MessageDto;
            if (currentChatIdRef.current === incoming.chatId) {
                setMessages(prev =>
                    prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
                );
                await ensureUserNames([incoming]);
                markCurrentChatAsRead();
                scrollToBottom();
            }
        }

        if (event?.type === "DELETE_MESSAGE") {
            const messageId = Number(event.payload);
            setMessages((prev) => prev.filter((m) => m.id !== messageId));
        }

        if (event?.type === "READ_MESSAGES") {
            const { chatId, readerId, messageIds } = event.payload;
            if (currentChatIdRef.current === chatId && Number(readerId) !== myId) {
                setMessages(prev =>
                    prev.map(msg =>
                        messageIds.includes(msg.id) ? { ...msg, read: true } : msg
                    )
                );
            }
        }
    };

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    const openChat = async (chat: ChatDto) => {
        try {
            currentChatIdRef.current = chat.id;
            setActiveChat(chat);
            await loadMessages(chat.id, 0, true);
            await switchChat(chat.id, handleWsEvent);
            scrollToBottom();
        } catch (error) {
            console.error("Failed to open chat", error);
            setActiveChat(null);
        }
    };

    const handleSend = async () => {
        if (!activeChat || !text.trim()) return;
        const content = text.trim();
        setText("");
        await sendMessage(activeChat.id, content);
        scrollToBottom();
    };

    const activeChatTitle = useMemo(() => {
        return activeChat?.name?.trim() ? activeChat.name : "Без названия";
    }, [activeChat]);

    useEffect(() => {
        loadChats();
        return () => {
            disconnectWebSocket();
            if (markReadDebounceRef.current) clearTimeout(markReadDebounceRef.current);
        };
    }, []);

    return (
        <div style={{ display: "flex", height: "100vh" }}>
            <div style={{ width: 300, borderRight: "1px solid #ccc", overflowY: "auto" }}>
                <h3 style={{ padding: 12, margin: 0 }}>Chats</h3>

                {chats.map((chat) => (
                    <div
                        key={chat.id}
                        onClick={() => openChat(chat)}
                        style={{
                            padding: 12,
                            cursor: "pointer",
                            borderBottom: "1px solid #eee",
                            background: activeChat?.id === chat.id ? "#f5f5f5" : "transparent",
                        }}
                    >
                        <b>{chat.name?.trim() ? chat.name : "Без названия"}</b>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{chat.type}</div>
                    </div>
                ))}
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                {activeChat ? (
                    <>
                        <div style={{ padding: 16, borderBottom: "1px solid #ddd" }}>
                            <h3 style={{ margin: 0 }}>{activeChatTitle}</h3>
                        </div>

                        <div ref={messagesContainerRef} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", maxHeight: "100%" }}>
                            {hasMore && (
                                <div style={{ textAlign: "center", padding: 8 }}>
                                    <button onClick={loadOlderMessages} disabled={isLoadingMore}>
                                        {isLoadingMore ? "Loading..." : "Load older messages"}
                                    </button>
                                </div>
                            )}

                            {messages.map((m) => {
                                const senderId = Number(m.senderId);
                                const currentUserId = Number(myId);
                                const isMine = senderId === currentUserId;

                                return (
                                    <div
                                        key={m.id}
                                        style={{
                                            display: "flex",
                                            width: "100%",
                                            marginBottom: 10,
                                            justifyContent: isMine ? "flex-end" : "flex-start",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "inline-block",
                                                maxWidth: "60%",
                                                padding: "10px 14px",
                                                borderRadius: 12,
                                                background: isMine ? "#DCF8C6" : "#eee",
                                                boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                                                alignSelf: isMine ? "flex-end" : "flex-start",
                                            }}
                                        >
                                            {!isMine && (
                                                <div style={{ fontSize: 12, fontWeight: "bold", marginBottom: 4 }}>
                                                    {userNames[senderId] ?? `User ${senderId}`}
                                                </div>
                                            )}

                                            <div>{m.content}</div>

                                            <div
                                                style={{
                                                    fontSize: 10,
                                                    opacity: 0.6,
                                                    textAlign: "right",
                                                    marginTop: 4,
                                                }}
                                            >
                                                {new Date(m.createdAt).toLocaleTimeString()}{" "}
                                                {isMine && (m.read ? "✓✓" : "✓")}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        <div
                            style={{
                                padding: 16,
                                borderTop: "1px solid #ddd",
                                display: "flex",
                                gap: 8,
                            }}
                        >
                            <input
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder="Type message..."
                                style={{ flex: 1 }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSend();
                                }}
                            />
                            <button onClick={handleSend}>Send</button>
                        </div>
                    </>
                ) : (
                    <div style={{ padding: 16 }}>Select a chat</div>
                )}
            </div>
        </div>
    );
};