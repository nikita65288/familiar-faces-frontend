import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
    CHAT_TYPE, type ChatDto, createGroupChat, getChats, getMessages,
    leaveChat, type MessageDto, sendMessage, updateChatAvatar,
} from "@/features/chat/api";
import { getFriends } from "@/features/friends/api";
import { getUserProfile, type UserProfileDto } from "@/features/user/api";
import { uploadFile } from "@/features/media/api";
import { createStompClient } from "@/shared/api/ws";
import { getUserIdFromToken } from "@/shared/lib/jwt";
import { resolveMediaUrl } from "@/shared/lib/media";
import { Avatar } from "@/components/Avatar";
import type { Client, StompSubscription } from "@stomp/stompjs";

const PAGE_SIZE = 30;

// --- seenAt (непрочитанные) в localStorage ---------------------------------
const SEEN_AT_KEY = "ff.chat.seenAt";
function loadSeenAt(): Record<number, string> {
    try { return JSON.parse(localStorage.getItem(SEEN_AT_KEY) ?? "{}") ?? {}; }
    catch { return {}; }
}
function saveSeenAt(v: Record<number, string>) {
    try { localStorage.setItem(SEEN_AT_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}
// ---------------------------------------------------------------------------

export default function ChatPage() {
    const nav = useNavigate();
    const [sp] = useSearchParams();
    const myId = getUserIdFromToken();

    const [chats, setChats] = useState<ChatDto[]>([]);
    const [selected, setSelected] = useState<ChatDto | null>(null);
    const [messages, setMessages] = useState<MessageDto[]>([]);
    const [profiles, setProfiles] = useState<Record<number, UserProfileDto>>({});
    const [text, setText] = useState("");
    const [attach, setAttach] = useState<File | null>(null);
    const [uploadPercent, setUploadPercent] = useState<number | null>(null);
    const [sending, setSending] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [showNewGroup, setShowNewGroup] = useState(false);
    const [seenAt, setSeenAt] = useState<Record<number, string>>(() => loadSeenAt());

    // --- пагинация истории -------------------------------------------------
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);

    const stompRef = useRef<Client | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const avatarFileRef = useRef<HTMLInputElement | null>(null);
    const messagesRef = useRef<HTMLDivElement | null>(null);
    const selectedIdRef = useRef<number | null>(null);
    useEffect(() => { selectedIdRef.current = selected?.id ?? null; }, [selected?.id]);

    // Чтобы автоскролл «вниз» не срабатывал после подгрузки старых сообщений
    const justPrependedRef = useRef(false);
    // Однократное чтение ?chat= из URL
    const didAutoOpenRef = useRef(false);

    useEffect(() => { saveSeenAt(seenAt); }, [seenAt]);

    function markChatSeen(chatId: number, at?: string) {
        setSeenAt(prev => ({ ...prev, [chatId]: at ?? new Date().toISOString() }));
    }
    function isChatUnread(c: ChatDto): boolean {
        if (!c.lastMessage || !c.lastMessageAt) return false;
        if (c.lastMessageSenderId === myId) return false;
        const seen = seenAt[c.id];
        return !seen || seen < c.lastMessageAt;
    }

    // --- добавить/дозаписать сообщения с дедупом по id ---------------------
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

    // --- профили ------------------------------------------------------------
    async function ensureUserProfiles(ids: number[]) {
        const need = ids.filter(id => id && !profiles[id]);
        if (!need.length) return;
        const loaded = await Promise.all(need.map(id => getUserProfile(id).catch(() => null)));
        const m = { ...profiles };
        loaded.forEach((p, i) => { if (p) m[need[i]] = p; });
        setProfiles(m);
    }

    // Просто обновить список чатов (сайдбар). Без openChat, без эффектов.
    async function refreshChats() {
        const list = await getChats();
        setChats(list);
        const ids = list.flatMap(c => c.participantIds ?? []);
        ensureUserProfiles(ids);
    }

    // Начальная загрузка: список + авто-открытие из URL (один раз)
    async function loadChatsInitial() {
        const list = await getChats();
        setChats(list);
        const ids = list.flatMap(c => c.participantIds ?? []);
        ensureUserProfiles(ids);
        if (!didAutoOpenRef.current) {
            const want = sp.get("chat");
            if (want) {
                const c = list.find(x => String(x.id) === want);
                if (c) { didAutoOpenRef.current = true; openChat(c); }
            }
        }
    }

    useEffect(() => { loadChatsInitial(); /* eslint-disable-next-line */ }, []);

    // --- WebSocket ---------------------------------------------------------
    // Сортируем id, чтобы ключ не менялся при переупорядочивании списка по lastMessageAt
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
                    // sanity-check: не доверяем топику, сверяем chatId
                    if (m.chatId !== chat.id) return;

                    if (selectedIdRef.current === m.chatId) {
                        // добавляем только если его ещё нет (иначе — дубль после handleSend)
                        setMessages(prev => appendUnique(prev, m));
                        markChatSeen(m.chatId, m.createdAt);
                    }
                    // важно: не loadChatsInitial, а refreshChats — иначе ?chat= заставит
                    // перескочить в другой чат на каждом новом сообщении.
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

    // --- автоскролл --------------------------------------------------------
    // При открытии чата — всегда к низу.
    useEffect(() => {
        const el = messagesRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [selected?.id]);

    // При изменении списка сообщений — к низу, только если мы уже около низа
    // и это не результат подгрузки старых (prepend).
    useEffect(() => {
        if (justPrependedRef.current) {
            justPrependedRef.current = false;
            return;
        }
        const el = messagesRef.current;
        if (!el) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
        if (nearBottom) el.scrollTop = el.scrollHeight;
    }, [messages]);

    async function openChat(c: ChatDto) {
        setSelected(c);
        setPage(0);
        const p = await getMessages(c.id, 0, PAGE_SIZE);
        setMessages(p.content);
        setHasMore(p.content.length >= PAGE_SIZE);
        markChatSeen(c.id, c.lastMessageAt ?? new Date().toISOString());
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

            // сохраняем позицию, чтобы не «проваливались» вниз
            requestAnimationFrame(() => {
                if (!el) return;
                const delta = el.scrollHeight - prevScrollHeight;
                el.scrollTop = prevScrollTop + delta;
            });
        } catch (e) {
            console.error("Failed to load older messages", e);
        } finally {
            setLoadingOlder(false);
        }
    }

    function getChatDisplay(c: ChatDto): { title: string; avatar?: string } {
        if (c.type === CHAT_TYPE.GROUP) return { title: c.name ?? "Group", avatar: c.avatarUrl };
        const u = c.otherParticipantId ? profiles[c.otherParticipantId] : undefined;
        return { title: u?.username ?? `user_${c.otherParticipantId}`, avatar: u?.avatarUrl };
    }

    async function handleSend() {
        if (!selected) return;
        if (!text.trim() && !attach) return;
        if (sending) return;
        setSending(true);
        try {
            let url: string | undefined;
            if (attach) {
                setUploadPercent(0);
                url = await uploadFile(attach, (p) => setUploadPercent(p));
            }
            const sent = await sendMessage(selected.id, text, url);
            // Дедуп: WS параллельно пришлёт это же сообщение
            setMessages(prev => appendUnique(prev, sent));
            setText(""); setAttach(null);
            refreshChats();
        } catch (e) {
            console.error("Failed to send message", e);
            alert("Не удалось отправить сообщение. Попробуйте ещё раз.");
        } finally {
            setUploadPercent(null);
            setSending(false);
        }
    }

    async function onGroupAvatar(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]; if (!file || !selected) return;
        const url = await uploadFile(file);
        const updated = await updateChatAvatar(selected.id, url);
        setSelected(updated);
        refreshChats();
    }

    async function doLeave() {
        if (!selected) return;
        if (!confirm("Покинуть чат?")) return;
        await leaveChat(selected.id);
        setSelected(null); setInfoOpen(false); refreshChats();
    }

    const previewOf = (c: ChatDto) => {
        if (!c.lastMessage) return <span style={{ color: "#90a4ae" }}>Нет сообщений</span>;
        let prefix = "";
        if (c.lastMessageSenderId === myId) prefix = "Вы: ";
        else if (c.type === CHAT_TYPE.GROUP && c.lastMessageSenderId) {
            prefix = (profiles[c.lastMessageSenderId]?.username ?? "…") + ": ";
        }
        return <span>{prefix}{c.lastMessage}</span>;
    };

    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr",
            gap: 16,
            height: "100%",
            minHeight: 0,
        }}>
            {/* sidebar */}
            <aside style={{ borderRight: "1px solid #eee", overflow: "auto", minHeight: 0 }}>
                <button style={{ margin: 8 }} onClick={() => setShowNewGroup(true)}>+ New group</button>
                {chats.map(c => {
                    const { title, avatar } = getChatDisplay(c);
                    const unread = isChatUnread(c);
                    return (
                        <div key={c.id}
                             onClick={() => openChat(c)}
                             style={{ padding: 10, display: "flex", gap: 10, cursor: "pointer",
                                 background: selected?.id === c.id ? "#eef5ff" : "transparent" }}>
                            <Avatar url={avatar} name={title} />
                            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <div style={{ fontWeight: unread ? 700 : 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {title}
                                    </div>
                                    {unread && (
                                        <span
                                            title="Есть непрочитанные"
                                            style={{
                                                width: 10, height: 10, borderRadius: "50%",
                                                background: "#1976d2", flexShrink: 0,
                                            }}
                                        />
                                    )}
                                </div>
                                <div style={{
                                    fontSize: 12,
                                    color: unread ? "#263238" : "#607d8b",
                                    fontWeight: unread ? 600 : 400,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                    {previewOf(c)}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </aside>

            {/* main */}
            <section style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                {!selected ? <div style={{ padding: 16, color: "#607d8b" }}>Выберите чат</div> : (
                    <>
                        <header style={{ borderBottom: "1px solid #eee", padding: 12, flexShrink: 0 }}>
                            <button onClick={() => setInfoOpen(true)}
                                    style={{ background: "none", border: "none", fontSize: 18, fontWeight: 600, cursor: "pointer" }}>
                                {getChatDisplay(selected).title}
                            </button>
                        </header>

                        <div
                            ref={messagesRef}
                            style={{
                                flex: 1,
                                minHeight: 0,
                                overflowY: "auto",
                                padding: 12,
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                            }}
                        >
                            {/* Кнопка подгрузки старых сообщений */}
                            {hasMore && (
                                <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                                    <button
                                        type="button"
                                        onClick={loadOlder}
                                        disabled={loadingOlder}
                                        style={{
                                            padding: "6px 14px",
                                            borderRadius: 16,
                                            border: "1px solid #cfd8dc",
                                            background: "#fff",
                                            cursor: loadingOlder ? "default" : "pointer",
                                            color: "#37474f",
                                            fontSize: 12,
                                        }}
                                    >
                                        {loadingOlder ? "Загрузка…" : "Загрузить старые сообщения"}
                                    </button>
                                </div>
                            )}

                            {messages.map(m => {
                                const mine = m.senderId === myId;
                                return (
                                    <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start",
                                        background: mine ? "#1976d2" : "#eceff1", color: mine ? "#fff" : "#263238",
                                        padding: 8, borderRadius: 8, maxWidth: "60%" }}>
                                        {m.attachmentUrl && (
                                            <img src={resolveMediaUrl(m.attachmentUrl)}
                                                 onClick={() => setLightbox(resolveMediaUrl(m.attachmentUrl)!)}
                                                 style={{ maxWidth: 180, maxHeight: 180, borderRadius: 6, cursor: "pointer", display: "block" }} />
                                        )}
                                        {m.content && <div>{m.content}</div>}
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ borderTop: "1px solid #eee", padding: 8, display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                            {attach && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#37474f" }}>
                                    <span>📎 {attach.name}</span>
                                    {sending && uploadPercent !== null && uploadPercent < 100 && (
                                        <span>Загрузка {uploadPercent}%…</span>
                                    )}
                                    {sending && uploadPercent === 100 && (
                                        <span>Отправка…</span>
                                    )}
                                    {!sending && (
                                        <button
                                            type="button"
                                            onClick={() => setAttach(null)}
                                            style={{ background: "none", border: "none", color: "#b00020", cursor: "pointer", padding: 0 }}
                                            title="Убрать файл"
                                        >
                                            ✕
                                        </button>
                                    )}
                                    <div style={{ flex: 1, height: 4, background: "#eceff1", borderRadius: 2, overflow: "hidden" }}>
                                        <div style={{
                                            width: `${uploadPercent ?? 0}%`,
                                            height: "100%",
                                            background: uploadPercent === 100 ? "#43a047" : "#1976d2",
                                            transition: "width .2s ease",
                                        }} />
                                    </div>
                                </div>
                            )}
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <input type="file" hidden accept="image/*" ref={fileRef}
                                       onChange={(e) => setAttach(e.target.files?.[0] ?? null)} />
                                <button onClick={() => fileRef.current?.click()} title="Прикрепить" disabled={sending}>📎</button>
                                <input style={{ flex: 1 }} value={text} onChange={e => setText(e.target.value)}
                                       onKeyDown={e => e.key === "Enter" && !sending && handleSend()}
                                       placeholder="Сообщение…" disabled={sending} />
                                <button onClick={handleSend} disabled={sending}>
                                    {sending ? "…" : "Send"}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </section>

            {/* info panel */}
            {infoOpen && selected && (
                <div onClick={() => setInfoOpen(false)}
                     style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20 }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: "#fff", padding: 20, borderRadius: 12, minWidth: 360, maxWidth: 480 }}>
                        {selected.type === CHAT_TYPE.PRIVATE ? (
                            <PrivateInfo chat={selected} profiles={profiles} onOpenProfile={(id) => nav(`/profile/${id}`)} onZoom={setLightbox} />
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
                                <ul>
                                    {selected.participantIds?.map(id => (
                                        <li key={id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                                            onClick={() => nav(`/profile/${id}`)}>
                                            <Avatar url={profiles[id]?.avatarUrl} name={profiles[id]?.username ?? `user_${id}`} size={28} />
                                            <span>{id === myId ? "Вы" : (profiles[id]?.username ?? `user_${id}`)}</span>
                                        </li>
                                    ))}
                                </ul>
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

            {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} onCreated={() => { setShowNewGroup(false); refreshChats(); }} />}
        </div>
    );
}

function PrivateInfo({ chat, profiles, onOpenProfile, onZoom }:{
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

function NewGroupModal({ onClose, onCreated }:{ onClose:()=>void; onCreated:()=>void }) {
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
        <div onClick={onClose}
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", padding: 20, borderRadius: 12, minWidth: 360 }}>
                <h3>Новый групповой чат</h3>
                <input placeholder="Название" value={name} onChange={e => setName(e.target.value)} />
                <div style={{ maxHeight: 240, overflow: "auto", marginTop: 8 }}>
                    {friends.map(f => (
                        <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 4 }}>
                            <input type="checkbox" checked={selected.includes(f.id)}
                                   onChange={(e) => setSelected(prev =>
                                       e.target.checked ? [...prev, f.id] : prev.filter(x => x !== f.id))} />
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