import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
    CHAT_TYPE, type ChatDto, addParticipantToChat, createGroupChat, getChats, getMessages,
    leaveChat, type MessageDto, sendMessage, updateChatAvatar, toggleReaction, getOrCreateSelfChat,
} from "@/features/chat/api";

import { getFriends } from "@/features/friends/api";
import { getUserProfile, type UserProfileDto } from "@/features/user/api";
import { uploadFile } from "@/features/media/api";
import { createStompClient } from "@/shared/api/ws";
import { getUserIdFromToken } from "@/shared/lib/jwt";
import { resolveMediaUrl } from "@/shared/lib/media";
import { Avatar } from "@/components/Avatar";
import type { Client, StompSubscription } from "@stomp/stompjs";

const REACTIONS = ["✍️", "💯", "🤮"];
const PAGE_SIZE = 30;
const MAX_LINES = 5;
const MOBILE_BREAKPOINT = 768;

const SEEN_AT_KEY = "ff.chat.seenAt";
function loadSeenAt(): Record<number, string> {
    try { return JSON.parse(localStorage.getItem(SEEN_AT_KEY) ?? "{}") ?? {}; }
    catch { return {}; }
}
function saveSeenAt(v: Record<number, string>) {
    try { localStorage.setItem(SEEN_AT_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

function formatTime(ts: unknown): string {
    if (!ts) return "";
    const d = new Date(ts as string);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(
        typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT
    );
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return isMobile;
}

export default function ChatPage() {
    const nav = useNavigate();
    const [sp] = useSearchParams();
    const myId = getUserIdFromToken();
    const isMobile = useIsMobile();

    const [chats, setChats] = useState<ChatDto[]>([]);
    const [selected, setSelected] = useState<ChatDto | null>(null);
    const [messages, setMessages] = useState<MessageDto[]>([]);
    const [profiles, setProfiles] = useState<Record<number, UserProfileDto>>({});
    const [text, setText] = useState("");
    const [attach, setAttach] = useState<File | null>(null);
    const [attachedUrl, setAttachedUrl] = useState<string | null>(null);
    const [uploadPercent, setUploadPercent] = useState<number | null>(null);
    const [uploading, setUploading] = useState(false);
    const [sending, setSending] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [showNewGroup, setShowNewGroup] = useState(false);
    const [seenAt, setSeenAt] = useState<Record<number, string>>(() => loadSeenAt());
    const [typingUsers, setTypingUsers] = useState<Record<number, number>>({});
    const [isDragging, setIsDragging] = useState(false);
    const [expandedMsgs, setExpandedMsgs] = useState<Set<number>>(new Set());
    const [reactionPopupBelow, setReactionPopupBelow] = useState(false);
    const [replyTo, setReplyTo] = useState<MessageDto | null>(null);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);

    // Кэш содержимого сообщений по id — чтобы реплай показывал контент,
    // даже если оригинал ушёл за пределы загруженной страницы.
    const msgCacheRef = useRef<Record<number, MessageDto>>({});

    const stompRef = useRef<Client | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const avatarFileRef = useRef<HTMLInputElement | null>(null);
    const messagesRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const selectedIdRef = useRef<number | null>(null);
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const justPrependedRef = useRef(false);
    const didAutoOpenRef = useRef(false);
    const [hoveredMsgId, setHoveredMsgId] = useState<number | null>(null);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { selectedIdRef.current = selected?.id ?? null; }, [selected?.id]);
    useEffect(() => { saveSeenAt(seenAt); }, [seenAt]);
    useEffect(() => { setTypingUsers({}); }, [selected?.id]);

    // Обновляем кэш сообщений при каждом изменении messages
    useEffect(() => {
        messages.forEach(m => { msgCacheRef.current[m.id] = m; });
    }, [messages]);

    function markChatSeen(chatId: number, at?: string) {
        setSeenAt(prev => ({ ...prev, [chatId]: at ?? new Date().toISOString() }));
    }
    function isChatUnread(c: ChatDto): boolean {
        if (!c.lastMessage || !c.lastMessageAt) return false;
        if (c.lastMessageSenderId === myId) return false;
        const seen = seenAt[c.id];
        return !seen || seen < c.lastMessageAt;
    }

    function appendUnique(list: MessageDto[], extra: MessageDto | MessageDto[]): MessageDto[] {
        const arr = Array.isArray(extra) ? extra : [extra];
        const ids = new Set(list.map(m => m.id));
        const fresh = arr.filter(m => !ids.has(m.id));
        return fresh.length ? [...list, ...fresh] : list;
    }
    function prependUnique(list: MessageDto[], older: MessageDto[]): MessageDto[] {
        const ids = new Set(list.map(m => m.id));
        const fresh = older.filter(m => !ids.has(m.id));
        return fresh.length ? [...fresh, ...list] : list;
    }

    async function ensureUserProfiles(ids: number[]) {
        const need = ids.filter(id => id && !profiles[id]);
        if (!need.length) return;
        const loaded = await Promise.all(need.map(id => getUserProfile(id).catch(() => null)));
        const m = { ...profiles };
        loaded.forEach((p, i) => { if (p) m[need[i]] = p; });
        setProfiles(m);
    }

    async function refreshChats() {
        const list = await getChats();
        const sorted = [...list].sort((a, b) => {
            const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return bTime - aTime;
        });
        setChats(sorted);
        ensureUserProfiles(list.flatMap(c => c.participantIds ?? []));
    }

    async function loadChatsInitial() {
        const list = await getChats();
        setChats(list);
        ensureUserProfiles(list.flatMap(c => c.participantIds ?? []));
        if (!didAutoOpenRef.current) {
            const want = sp.get("chat");
            if (want) {
                const c = list.find(x => String(x.id) === want);
                if (c) { didAutoOpenRef.current = true; openChat(c); }
            }
        }
    }

    useEffect(() => { loadChatsInitial(); /* eslint-disable-next-line */ }, []);

    const chatIdsKey = useMemo(
        () => [...chats.map(c => c.id)].sort((a, b) => a - b).join(","),
        [chats]
    );

    useEffect(() => {
        if (!chats.length) return;
        const subs: StompSubscription[] = [];
        const client = createStompClient((c) => {
            chats.forEach(chat => {
                subs.push(c.subscribe(`/topic/chats.${chat.id}`, (msg) => {
                    const m: MessageDto = JSON.parse(msg.body);
                    if (m.chatId !== chat.id) return;
                    msgCacheRef.current[m.id] = m;
                    if (selectedIdRef.current === m.chatId) {
                        setMessages(prev => appendUnique(prev, m));
                        markChatSeen(m.chatId, m.createdAt);
                    }
                    refreshChats();
                }));
                subs.push(c.subscribe(`/topic/chats.${chat.id}.delete`, (msg) => {
                    const deletedId = Number(msg.body);
                    setMessages(prev => prev.filter(x => x.id !== deletedId));
                }));
                subs.push(c.subscribe(`/topic/chats.${chat.id}.read`, (msg) => {
                    const { messageIds } = JSON.parse(msg.body) as { messageIds: number[] };
                    setMessages(prev =>
                        prev.map(x => messageIds.includes(x.id) ? { ...x, isRead: true } : x)
                    );
                }));
                subs.push(c.subscribe(`/topic/chats.${chat.id}.reactions`, (msg) => {
                    const { messageId, reactions } = JSON.parse(msg.body) as {
                        messageId: number; reactions: Record<string, number[]>;
                    };
                    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
                }));
                subs.push(c.subscribe(`/topic/chats.${chat.id}.typing`, (msg) => {
                    const { userId } = JSON.parse(msg.body) as { userId: number };
                    if (userId === myId) return;
                    if (selectedIdRef.current !== chat.id) return;
                    const ts = Date.now();
                    setTypingUsers(prev => ({ ...prev, [userId]: ts }));
                    setTimeout(() => {
                        setTypingUsers(prev => {
                            const next = { ...prev };
                            if (next[userId] === ts) delete next[userId];
                            return next;
                        });
                    }, 3500);
                }));
            });
        });
        stompRef.current = client;
        return () => {
            subs.forEach(s => { try { s.unsubscribe(); } catch { /* ignore */ } });
            client.deactivate();
            stompRef.current = null;
        };
        // eslint-disable-next-line
    }, [chatIdsKey]);

    useEffect(() => {
        const el = messagesRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [selected?.id]);

    useEffect(() => {
        if (justPrependedRef.current) { justPrependedRef.current = false; return; }
        const el = messagesRef.current;
        if (!el) return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) el.scrollTop = el.scrollHeight;
    }, [messages]);

    useEffect(() => {
        if (selected) setTimeout(() => inputRef.current?.focus(), 50);
    }, [selected?.id]);

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        };
    }, []);

    async function openChat(c: ChatDto) {
        setSelected(c);
        setPage(0);
        const p = await getMessages(c.id, 0, PAGE_SIZE);
        setMessages(p.content);
        setHasMore(p.content.length >= PAGE_SIZE);
        markChatSeen(c.id, c.lastMessageAt ?? new Date().toISOString());
    }

    async function openSelfChat() {
        const chat = await getOrCreateSelfChat();
        setChats(prev => {
            const exists = prev.find(c => c.id === chat.id);
            const newList = exists ? prev : [chat, ...prev];
            // сортируем по убыванию даты последнего сообщения
            return newList.sort((a, b) => {
                const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
                const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
                return bTime - aTime;
            });
        });
        openChat(chat);
    }

    async function loadOlder() {
        if (!selected || loadingOlder || !hasMore) return;
        setLoadingOlder(true);
        try {
            const nextPage = page + 1;
            const p = await getMessages(selected.id, nextPage, PAGE_SIZE);
            const el = messagesRef.current;
            const prevScrollHeight = el?.scrollHeight ?? 0;
            const prevScrollTop = el?.scrollTop ?? 0;
            justPrependedRef.current = true;
            setMessages(prev => prependUnique(prev, p.content));
            setPage(nextPage);
            setHasMore(p.content.length >= PAGE_SIZE);
            requestAnimationFrame(() => {
                if (!el) return;
                el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
            });
        } catch (e) { console.error(e); }
        finally { setLoadingOlder(false); }
    }

    function getChatDisplay(c: ChatDto): { title: string; avatar?: string } {
        if (c.type === CHAT_TYPE.GROUP) return { title: c.name ?? "Group", avatar: c.avatarUrl };
        if (!c.otherParticipantId) return { title: "Избранное", avatar: undefined };
        const u = profiles[c.otherParticipantId];
        return { title: u?.username ?? `user_${c.otherParticipantId}`, avatar: u?.avatarUrl };
    }

    async function attachFile(file: File) {
        setAttach(file);
        setAttachedUrl(null);
        setUploading(true);
        setUploadPercent(0);
        try {
            const url = await uploadFile(file, (pct) => setUploadPercent(pct));
            setAttachedUrl(url);
        } catch {
            alert("Ошибка загрузки файла");
            setAttach(null);
        } finally {
            setUploading(false);
        }
    }

    function removeAttach() {
        setAttach(null);
        setAttachedUrl(null);
        setUploadPercent(null);
        if (fileRef.current) fileRef.current.value = "";
    }

    function handleTextChange(val: string) {
        setText(val);
        if (!selected || !stompRef.current?.connected) return;
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        stompRef.current.publish({
            destination: `/app/chats.${selected.id}.typing`,
            body: JSON.stringify({ userId: myId }),
        });
        typingTimerRef.current = setTimeout(() => {}, 3000);
    }

    async function handleSend() {
        if (!selected || sending || uploading) return;
        if (!text.trim() && !attach) return;
        if (attach && !attachedUrl) return;
        setSending(true);
        try {
            const sent = await sendMessage(selected.id, text, attachedUrl ?? undefined, replyTo?.id);
            msgCacheRef.current[sent.id] = sent;
            setMessages(prev => appendUnique(prev, sent));
            setText("");
            setReplyTo(null);
            removeAttach();
            refreshChats();
            setTimeout(() => inputRef.current?.focus(), 50);
        } catch (e) {
            console.error(e);
            alert("Не удалось отправить сообщение. Попробуйте ещё раз.");
        } finally {
            setSending(false);
        }
    }

    function scrollToMessage(id: number) {
        const el = messagesRef.current?.querySelector(`[data-msg-id="${id}"]`) as HTMLElement | null;
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.style.transition = "background .2s";
            el.style.background = "#fff9c4";
            setTimeout(() => { el.style.background = ""; }, 1500);
        }
    }

    async function handleReaction(chatId: number, messageId: number, emoji: string) {
        try { await toggleReaction(chatId, messageId, emoji); }
        catch (e) { console.error(e); }
    }

    async function onGroupAvatar(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]; if (!file || !selected) return;
        const url = await uploadFile(file);
        const updated = await updateChatAvatar(selected.id, url);
        setSelected(updated); refreshChats();
    }

    async function doLeave() {
        if (!selected || !confirm("Покинуть чат?")) return;
        await leaveChat(selected.id);
        setSelected(null); setInfoOpen(false); refreshChats();
    }

    function handleMsgHover(e: React.MouseEvent, msgId: number) {
        setHoveredMsgId(msgId);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const container = messagesRef.current;
        if (container) {
            const cr = container.getBoundingClientRect();
            setReactionPopupBelow(rect.top < (cr.top + cr.height / 2));
        }
    }

    const previewOf = (c: ChatDto) => {
        if (!c.lastMessage) return <span style={{ color: "#90a4ae" }}>Нет сообщений</span>;
        let prefix = "";
        if (c.lastMessageSenderId === myId) prefix = "Вы: ";
        else if (c.type === CHAT_TYPE.GROUP && c.lastMessageSenderId)
            prefix = (profiles[c.lastMessageSenderId]?.username ?? "…") + ": ";
        return <span>{prefix}{c.lastMessage}</span>;
    };

    const isGroup = selected?.type === CHAT_TYPE.GROUP;
    const canSend = !sending && !uploading && (!!text.trim() || !!attachedUrl);
    const typingList = Object.keys(typingUsers).map(Number).filter(id => Date.now() - typingUsers[id] < 3500);

    // === Мобильная логика ===
    // На мобильном: если чат не выбран — показываем только список; если выбран — только чат.
    const showSidebar = !isMobile || !selected;
    const showMain = !isMobile || !!selected;

    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "280px 1fr",
                gap: isMobile ? 0 : 16,
                height: "100%",
                minHeight: 0,
            }}
        >
            {showSidebar && (
                <aside style={{
                    borderRight: isMobile ? "none" : "1px solid #eee",
                    overflow: "auto", minHeight: 0,
                }}>
                    <button style={{ margin: 8 }} onClick={() => setShowNewGroup(true)}>Создать конфу</button>
                    <button style={{ margin: "0 8px 8px", display: "block", width: "calc(100% - 16px)", textAlign: "left" }}
                            onClick={openSelfChat}>
                        ⭐ Избранное
                    </button>
                    {chats.map(c => {
                        const { title, avatar } = getChatDisplay(c);
                        const unread = isChatUnread(c);
                        return (
                            <div key={c.id} onClick={() => openChat(c)}
                                 style={{ padding: 10, display: "flex", gap: 10, cursor: "pointer", background: selected?.id === c.id && !isMobile ? "#eef5ff" : "transparent" }}>
                                <Avatar url={avatar} name={title} />
                                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <div style={{ fontWeight: unread ? 700 : 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                                        {unread && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#1976d2", flexShrink: 0 }} />}
                                    </div>
                                    <div style={{ fontSize: 12, color: unread ? "#263238" : "#607d8b", fontWeight: unread ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {previewOf(c)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </aside>
            )}

            {showMain && (
                <section style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                    {!selected ? <div style={{ padding: 16, color: "#607d8b" }}>Выберите чат</div> : (
                        <>
                            <header style={{ borderBottom: "1px solid #eee", padding: 12, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                                {isMobile && (
                                    <button
                                        onClick={() => setSelected(null)}
                                        style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "0 4px" }}
                                        title="К списку чатов"
                                    >
                                        ←
                                    </button>
                                )}
                                <button onClick={() => setInfoOpen(true)}
                                        style={{ background: "none", border: "none", fontSize: 18, fontWeight: 600, cursor: "pointer", flex: 1, textAlign: "left" }}>
                                    {getChatDisplay(selected).title}
                                </button>
                            </header>

                            <div
                                ref={messagesRef}
                                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={e => {
                                    e.preventDefault(); setIsDragging(false);
                                    const file = e.dataTransfer.files?.[0];
                                    if (file) attachFile(file);
                                }}
                                style={{
                                    flex: 1, minHeight: 0, overflowY: "auto", overflowX: "visible", padding: 12,
                                    display: "flex", flexDirection: "column", gap: 6,
                                    outline: isDragging ? "2px dashed #1976d2" : "none",
                                    background: isDragging ? "#e3f2fd" : undefined,
                                }}
                            >
                                {hasMore && (
                                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                                        <button type="button" onClick={loadOlder} disabled={loadingOlder}
                                                style={{ padding: "6px 14px", borderRadius: 16, border: "1px solid #cfd8dc", background: "#fff", cursor: loadingOlder ? "default" : "pointer", color: "#37474f", fontSize: 12 }}>
                                            {loadingOlder ? "Загрузка…" : "Загрузить старые сообщения"}
                                        </button>
                                    </div>
                                )}

                                {messages.map((m, index) => {
                                    const mine = m.senderId === myId;
                                    const reactions = m.reactions ?? {};
                                    const hasReactions = Object.values(reactions).some(u => u.length > 0);
                                    const isExpanded = expandedMsgs.has(m.id);
                                    const senderName = profiles[m.senderId]?.username ?? `user_${m.senderId}`;

                                    const replyId = m.replyToMessageId;
                                    const replyOrig: MessageDto | undefined = replyId
                                        ? (messages.find(x => x.id === replyId) ?? msgCacheRef.current[replyId])
                                        : undefined;

                                    // --- Логика разделителя дат ---
                                    const currentDate = new Date(m.createdAt);
                                    const prevMsg = messages[index - 1];
                                    let showDivider = false;
                                    let label = "";

                                    if (!prevMsg) {
                                        showDivider = true;
                                    } else {
                                        const prevDate = new Date(prevMsg.createdAt);
                                        if (
                                            currentDate.getDate() !== prevDate.getDate() ||
                                            currentDate.getMonth() !== prevDate.getMonth() ||
                                            currentDate.getFullYear() !== prevDate.getFullYear()
                                        ) {
                                            showDivider = true;
                                        }
                                    }

                                    if (showDivider) {
                                        const today = new Date();
                                        const yesterday = new Date(today);
                                        yesterday.setDate(yesterday.getDate() - 1);
                                        const isToday = currentDate.toDateString() === today.toDateString();
                                        const isYesterday = currentDate.toDateString() === yesterday.toDateString();

                                        if (isToday) label = "Сегодня";
                                        else if (isYesterday) label = "Вчера";
                                        else {
                                            label = currentDate.toLocaleDateString("ru-RU", {
                                                day: "numeric",
                                                month: "long",
                                                year: "numeric",
                                            });
                                        }
                                    }

                                    return (
                                        <Fragment key={m.id}>
                                            {showDivider && (
                                                <div
                                                    style={{
                                                        textAlign: "center",
                                                        margin: "12px 0 8px",
                                                        color: "#78909c",
                                                        fontSize: 12,
                                                        fontWeight: 500,
                                                        textTransform: "uppercase",
                                                    }}
                                                >
                                                    {label}
                                                </div>
                                            )}

                                            <div
                                                data-msg-id={m.id}
                                                style={{
                                                    alignSelf: mine ? "flex-end" : "flex-start",
                                                    maxWidth: isMobile ? "85%" : "60%",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    position: "relative",
                                                    paddingTop: 28,
                                                    marginTop: -28,
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (hoverTimerRef.current) {
                                                        clearTimeout(hoverTimerRef.current);
                                                        hoverTimerRef.current = null;
                                                    }
                                                    handleMsgHover(e, m.id);
                                                }}
                                                onMouseLeave={() => {
                                                    hoverTimerRef.current = setTimeout(() => {
                                                        setHoveredMsgId(null);
                                                    }, 100); // задержка 100 мс
                                                }}
                                            >
                                                {hoveredMsgId === m.id && (
                                                    <button
                                                        onClick={() => setReplyTo(m)}
                                                        onMouseEnter={() => {
                                                            if (hoverTimerRef.current) {
                                                                clearTimeout(hoverTimerRef.current);
                                                                hoverTimerRef.current = null;
                                                            }
                                                            setHoveredMsgId(m.id);
                                                        }}
                                                        onMouseLeave={() => {
                                                            hoverTimerRef.current = setTimeout(() => {
                                                                setHoveredMsgId(null);
                                                            }, 100);
                                                        }}
                                                        style={{
                                                            position: "absolute",
                                                            // Для своих сообщений: кнопка слева от пузыря (смещаем влево на 100% ширины кнопки + отступ)
                                                            // Для чужих сообщений: кнопка справа от пузыря (смещаем вправо на 100% ширины родителя)
                                                            ...(mine
                                                                ? {
                                                                    right: "100%",        // правый край кнопки прижат к левому краю родителя
                                                                    marginRight: 2,       // отступ между кнопкой и пузырём
                                                                }
                                                                : {
                                                                    left: "100%",         // левый край кнопки прижат к правому краю родителя
                                                                    marginLeft: 2,        // отступ между кнопкой и пузырём
                                                                }),
                                                            top: "50%",
                                                            transform: "translateY(-50%)",
                                                            background: mine ? "#1565c0" : "#e0e0e0",
                                                            border: "none",
                                                            borderRadius: "50%",
                                                            width: 32,
                                                            height: 32,
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            cursor: "pointer",
                                                            color: mine ? "#fff" : "#333",
                                                            fontSize: 18,
                                                            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                                                            zIndex: 5,
                                                        }}
                                                        title="Ответить"
                                                    >
                                                        ↩
                                                    </button>
                                                )}

                                                {/* Reaction picker */}
                                                {hoveredMsgId === m.id && (
                                                    <div
                                                        style={{
                                                            position: "absolute",
                                                            [mine ? "right" : "left"]: 0,
                                                            ...(reactionPopupBelow
                                                                ? { top: "100%", marginTop: 0 }
                                                                : { bottom: "calc(100% - 28px)", marginBottom: 0 }),
                                                            zIndex: 10,
                                                            padding: reactionPopupBelow ? "4px 0 0 0" : "0 0 4px 0",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: "inline-flex",
                                                                gap: 2,
                                                                background: "#fff",
                                                                border: "1px solid #e0e0e0",
                                                                borderRadius: 20,
                                                                padding: "3px 8px",
                                                                boxShadow: "0 2px 8px rgba(0,0,0,.18)",
                                                                whiteSpace: "nowrap",
                                                            }}
                                                        >
                                                            {REACTIONS.map(emoji => (
                                                                <button
                                                                    key={emoji}
                                                                    onClick={() => handleReaction(m.chatId, m.id, emoji)}
                                                                    style={{
                                                                        background: "none",
                                                                        border: "none",
                                                                        cursor: "pointer",
                                                                        fontSize: 18,
                                                                        lineHeight: 1,
                                                                        padding: 2,
                                                                    }}
                                                                >
                                                                    {emoji}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Пузырь сообщения */}
                                                <div
                                                    style={{
                                                        background: mine ? "#1976d2" : "#eceff1",
                                                        color: mine ? "#fff" : "#263238",
                                                        padding: 8,
                                                        borderRadius: 8,
                                                    }}
                                                >
                                                    {/* Блок ответа */}
                                                    {replyId && (
                                                        <div
                                                            onClick={() => scrollToMessage(replyId)}
                                                            style={{
                                                                borderLeft: `3px solid ${mine ? "rgba(255,255,255,0.6)" : "#1976d2"}`,
                                                                paddingLeft: 6,
                                                                marginBottom: 6,
                                                                opacity: 0.85,
                                                                cursor: "pointer",
                                                                fontSize: 12,
                                                                maxHeight: 40,
                                                                overflow: "hidden",
                                                                background: mine
                                                                    ? "rgba(255,255,255,0.12)"
                                                                    : "rgba(25,118,210,0.08)",
                                                                borderRadius: 4,
                                                                padding: "4px 6px",
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display: "flex",
                                                                    alignItems: "baseline",
                                                                    gap: 4,
                                                                    fontWeight: 600,
                                                                    fontSize: 11,
                                                                    marginBottom: 0,
                                                                    color: mine ? "rgba(255,255,255,0.9)" : "#37474f",
                                                                }}
                                                            >
                                                                <span style={{ flexShrink: 0 }}>
                                                                  {replyOrig
                                                                      ? replyOrig.senderId === myId
                                                                          ? "Вы"
                                                                          : profiles[replyOrig.senderId]?.username ?? `user_${replyOrig.senderId}`
                                                                      : `Сообщение #${replyId}`}
                                                                </span>
                                                                <span
                                                                    style={{
                                                                        whiteSpace: "nowrap",
                                                                        overflow: "hidden",
                                                                        textOverflow: "ellipsis",
                                                                        opacity: 0.8,
                                                                        flex: 1,
                                                                    }}
                                                                >
                                                                    {replyOrig 
                                                                        ? replyOrig.content?.trim() || 
                                                                        (replyOrig.attachmentUrl ? "📎 Вложение" : "…") 
                                                                        : "Загрузите старые сообщения…"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {isGroup && !mine && (
                                                        <div
                                                            style={{
                                                                fontSize: 11,
                                                                fontWeight: 700,
                                                                marginBottom: 2,
                                                                opacity: 0.75,
                                                                textAlign: "left",
                                                            }}
                                                        >
                                                            {senderName}
                                                        </div>
                                                    )}

                                                    {m.attachmentUrl && (
                                                        <img
                                                            src={resolveMediaUrl(m.attachmentUrl)}
                                                            onClick={() => setLightbox(resolveMediaUrl(m.attachmentUrl)!)}
                                                            style={{
                                                                maxWidth: 180,
                                                                maxHeight: 180,
                                                                borderRadius: 6,
                                                                cursor: "pointer",
                                                                display: "block",
                                                            }}
                                                        />
                                                    )}

                                                    {m.content && (
                                                        <CollapsibleText
                                                            text={m.content}
                                                            maxLines={MAX_LINES}
                                                            expanded={isExpanded}
                                                            onToggle={() =>
                                                                setExpandedMsgs(prev => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(m.id)) next.delete(m.id);
                                                                    else next.add(m.id);
                                                                    return next;
                                                                })
                                                            }
                                                            textColor={mine ? "#fff" : "#263238"}
                                                        />
                                                    )}

                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            justifyContent: "flex-end",
                                                            alignItems: "center",
                                                            gap: 3,
                                                            marginTop: 2,
                                                            opacity: 0.7,
                                                            fontSize: 10,
                                                            userSelect: "none",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        <span>{formatTime(m.createdAt)}</span>
                                                        {mine && (
                                                            <span
                                                                title={m.isRead ? "Прочитано" : "Доставлено"}
                                                                style={{ letterSpacing: "-2px" }}
                                                            >
                                                                {m.isRead ? "✓✓" : "✓"}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {hasReactions && (
                                                    <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                                                        {Object.entries(reactions)
                                                            .filter(([, u]) => u.length > 0)
                                                            .map(([emoji, users]) => (
                                                                <button
                                                                    key={emoji}
                                                                    onClick={() => handleReaction(m.chatId, m.id, emoji)}
                                                                    style={{
                                                                        background:
                                                                            myId && users.includes(myId) ? "#e3f2fd" : "#f5f5f5",
                                                                        border:
                                                                            myId && users.includes(myId)
                                                                                ? "1px solid #90caf9"
                                                                                : "1px solid #e0e0e0",
                                                                        borderRadius: 12,
                                                                        padding: "2px 8px",
                                                                        cursor: "pointer",
                                                                        fontSize: 13,
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        gap: 4,
                                                                    }}
                                                                >
                                                                    {emoji} {users.length}
                                                                </button>
                                                            ))}
                                                    </div>
                                                )}
                                            </div>
                                        </Fragment>
                                    );
                                })}

                                {typingList.length > 0 && (
                                    <div style={{ alignSelf: "flex-start", fontSize: 12, color: "#607d8b", fontStyle: "italic", padding: "2px 4px" }}>
                                        {typingList.map(id => profiles[id]?.username ?? `user_${id}`).join(", ")}
                                        {" "}{typingList.length === 1 ? "печатает" : "печатают"}…
                                    </div>
                                )}
                            </div>

                            <div style={{ borderTop: "1px solid #eee", padding: 8, display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                                {attach && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#37474f" }}>
                                        <span>📎 {attach.name}</span>
                                        {uploading && <span>{uploadPercent ?? 0}%…</span>}
                                        {!uploading && attachedUrl && <span style={{ color: "#43a047" }}>✓</span>}
                                        {!uploading && (
                                            <button type="button" onClick={removeAttach}
                                                    style={{ background: "none", border: "none", color: "#b00020", cursor: "pointer", padding: 0 }}>✕</button>
                                        )}
                                        <div style={{ flex: 1, height: 4, background: "#eceff1", borderRadius: 2, overflow: "hidden" }}>
                                            <div style={{ width: `${uploadPercent ?? 0}%`, height: "100%", background: attachedUrl ? "#43a047" : "#1976d2", transition: "width .2s ease" }} />
                                        </div>
                                    </div>
                                )}
                                {replyTo && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: "#f5f5f5", borderRadius: 6, fontSize: 12 }}>
                                        <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#37474f" }}>
                                            ↩ <b>{replyTo.senderId === myId ? "Вы" : (profiles[replyTo.senderId]?.username ?? `user_${replyTo.senderId}`)}</b>: {replyTo.content ?? "📎 Вложение"}
                                        </div>
                                        <button onClick={() => setReplyTo(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#b00020", padding: 0 }}>
                                            ✕
                                        </button>
                                    </div>
                                )}
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <input type="file" hidden accept="image/*" ref={fileRef}
                                           onChange={e => { const f = e.target.files?.[0]; if (f) attachFile(f); }} />
                                    <button onClick={() => fileRef.current?.click()} title="Прикрепить" disabled={sending || uploading}>📎</button>
                                    <input ref={inputRef} style={{ flex: 1 }} value={text}
                                           onChange={e => handleTextChange(e.target.value)}
                                           onKeyDown={e => e.key === "Enter" && canSend && handleSend()}
                                           placeholder="Сообщение…" disabled={sending} />
                                    <button onClick={handleSend} disabled={!canSend}>
                                        {sending ? "…" : "Send"}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            )}

            {infoOpen && selected && (
                <div onClick={() => setInfoOpen(false)}
                     style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20 }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: "#fff", padding: 20, borderRadius: 12, minWidth: 320, maxWidth: "90vw" }}>
                        {selected.type === CHAT_TYPE.PRIVATE ? (
                            <PrivateInfo chat={selected} profiles={profiles} onOpenProfile={id => nav(`/profile/${id}`)} onZoom={setLightbox} />
                        ) : (
                            <>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <Avatar url={selected.avatarUrl} name={selected.name} size={96}
                                            onClick={() => selected.avatarUrl && setLightbox(resolveMediaUrl(selected.avatarUrl)!)} />
                                    <h3 style={{ margin: 0 }}>{selected.name}</h3>
                                </div>
                                <input hidden type="file" accept="image/*" ref={avatarFileRef} onChange={onGroupAvatar} />
                                <button style={{ marginTop: 12 }} onClick={() => avatarFileRef.current?.click()}>Сменить аватар</button>
                                <h4>Участники</h4>
                                <ul style={{ maxHeight: 200, overflowY: "auto", paddingLeft: 0, listStyle: "none", margin: 0 }}>
                                    {selected.participantIds?.map(id => (
                                        <li key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}
                                            onClick={() => nav(`/profile/${id}`)}>
                                            <Avatar url={profiles[id]?.avatarUrl} name={profiles[id]?.username ?? `user_${id}`} size={28} />
                                            <span>{id === myId ? "Вы" : (profiles[id]?.username ?? `user_${id}`)}</span>
                                        </li>
                                    ))}
                                </ul>
                                <AddParticipantToGroup
                                    chatId={selected.id}
                                    existingIds={selected.participantIds ?? []}
                                    onAdded={() => { refreshChats(); setInfoOpen(false); }}
                                />
                                <button style={{ marginTop: 12, color: "crimson" }} onClick={doLeave}>Покинуть чат</button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {lightbox && (
                <div onClick={() => setLightbox(null)}
                     style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }}>
                    <img src={lightbox} style={{ maxWidth: "90vw", maxHeight: "90vh" }} />
                </div>
            )}

            {showNewGroup && (
                <NewGroupModal onClose={() => setShowNewGroup(false)} onCreated={() => { setShowNewGroup(false); refreshChats(); }} />
            )}
        </div>
    );
}

// --- Вспомогательные компоненты ---

function CollapsibleText({ text, maxLines, expanded, onToggle, textColor }: {
    text: string; maxLines: number; expanded: boolean; onToggle: () => void; textColor: string;
}) {
    const lines = text.split("\n");
    const needsCollapse = lines.length > maxLines || text.length > maxLines * 80;
    if (!needsCollapse) {
        return <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left" }}>{text}</div>;
    }
    return (
        <div>
            <div style={{
                whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left",
                display: "-webkit-box", WebkitBoxOrient: "vertical",
                WebkitLineClamp: expanded ? undefined : maxLines,
                overflow: expanded ? "visible" : "hidden",
            }}>
                {text}
            </div>
            <button onClick={onToggle} style={{
                background: "none", border: "none", cursor: "pointer",
                color: textColor, opacity: 0.75, fontSize: 11, padding: "2px 0",
                textDecoration: "underline", display: "block",
            }}>
                {expanded ? "Свернуть" : "Показать полностью"}
            </button>
        </div>
    );
}

function PrivateInfo({ chat, profiles, onOpenProfile, onZoom }: {
    chat: ChatDto; profiles: Record<number, UserProfileDto>;
    onOpenProfile: (id: number) => void; onZoom: (url: string) => void;
}) {
    const u = chat.otherParticipantId ? profiles[chat.otherParticipantId] : undefined;
    return (
        <div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Avatar url={u?.avatarUrl} name={u?.username} size={96}
                        onClick={() => u?.avatarUrl && onZoom(resolveMediaUrl(u.avatarUrl)!)} />
                <h3 style={{ margin: 0 }}>{u?.username ?? `user_${chat.otherParticipantId}`}</h3>
            </div>
            {u?.bio && <p style={{ marginTop: 12 }}>{u.bio}</p>}
            <button onClick={() => chat.otherParticipantId && onOpenProfile(chat.otherParticipantId)}>Открыть профиль</button>
        </div>
    );
}

function AddParticipantToGroup({ chatId, existingIds, onAdded }: {
    chatId: number; existingIds: number[]; onAdded: () => void;
}) {
    const [friends, setFriends] = useState<{ id: number; username: string; avatarUrl?: string }[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const myId = getUserIdFromToken();

    useEffect(() => {
        (async () => {
            const frs = await getFriends();
            const ids = frs.map(f => f.requesterId === myId ? f.addresseeId : f.requesterId);
            const profs = await Promise.all(ids.map(id => getUserProfile(id).catch(() => null)));
            setFriends(
                profs.filter(Boolean)
                    .map((p: any) => ({ id: p.authId, username: p.username, avatarUrl: p.avatarUrl }))
                    .filter(f => !existingIds.includes(f.id))
            );
        })();
    }, [chatId]);

    async function doAdd() {
        if (!selectedId) return;
        try {
            await addParticipantToChat(chatId, selectedId);
            onAdded();
        } catch (e) { console.error(e); alert("Не удалось добавить участника"); }
    }

    if (!friends.length) return null;
    return (
        <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: "0 0 6px" }}>Добавить участника</h4>
            <div style={{ display: "flex", gap: 8 }}>
                <select value={selectedId ?? ""} onChange={e => setSelectedId(Number(e.target.value))} style={{ flex: 1 }}>
                    <option value="">Выбрать из друзей…</option>
                    {friends.map(f => <option key={f.id} value={f.id}>{f.username}</option>)}
                </select>
                <button onClick={doAdd} disabled={!selectedId}>Добавить</button>
            </div>
        </div>
    );
}

function NewGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState("");
    const [selected, setSelected] = useState<number[]>([]);
    const [friends, setFriends] = useState<{ id: number; username: string; avatarUrl?: string }[]>([]);
    const myId = getUserIdFromToken();

    useEffect(() => {
        (async () => {
            const frs = await getFriends();
            const ids = frs.map(f => f.requesterId === myId ? f.addresseeId : f.requesterId);
            const profs = await Promise.all(ids.map(id => getUserProfile(id).catch(() => null)));
            setFriends(profs.filter(Boolean).map((p: any) => ({ id: p.authId, username: p.username, avatarUrl: p.avatarUrl })));
        })();
    }, []);

    async function create() {
        if (!name.trim() || !selected.length) return;
        await createGroupChat(name.trim(), selected);
        onCreated();
    }

    return (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", padding: 20, borderRadius: 12, minWidth: 320, maxWidth: "90vw" }}>
                <h3>Новый групповой чат</h3>
                <input placeholder="Название" value={name} onChange={e => setName(e.target.value)} />
                <div style={{ maxHeight: 240, overflow: "auto", marginTop: 8 }}>
                    {friends.map(f => (
                        <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 4 }}>
                            <input type="checkbox" checked={selected.includes(f.id)}
                                   onChange={e => setSelected(prev => e.target.checked ? [...prev, f.id] : prev.filter(x => x !== f.id))} />
                            <Avatar url={f.avatarUrl} name={f.username} size={24} />
                            {f.username}
                        </label>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={create}>Создать</button>
                    <button onClick={onClose}>Отмена</button>
                </div>
            </div>
        </div>
    );
}
