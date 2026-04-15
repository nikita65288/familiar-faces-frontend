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
import type { Client } from "@stomp/stompjs";

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
    const [infoOpen, setInfoOpen] = useState(false);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [showNewGroup, setShowNewGroup] = useState(false);

    const stompRef = useRef<Client | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const avatarFileRef = useRef<HTMLInputElement | null>(null);

    async function ensureUserProfiles(ids: number[]) {
        const need = ids.filter(id => id && !profiles[id] && id !== myId);
        if (!need.length) return;
        const loaded = await Promise.all(need.map(id => getUserProfile(id).catch(() => null)));
        const m = { ...profiles };
        loaded.forEach((p, i) => { if (p) m[need[i]] = p; });
        setProfiles(m);
    }

    async function loadChats() {
        const list = await getChats();
        setChats(list);
        const ids = list.flatMap(c => c.participantIds ?? []);
        ensureUserProfiles(ids);
        const want = sp.get("chat");
        if (want) {
            const c = list.find(x => String(x.id) === want);
            if (c) openChat(c);
        }
    }

    useEffect(() => { loadChats(); /* eslint-disable-next-line */ }, []);

    useEffect(() => {
        stompRef.current = createStompClient((client) => {
            client.subscribe(`/user/queue/chat`, (msg) => {
                const m: MessageDto = JSON.parse(msg.body);
                setMessages(prev => selected && m.chatId === selected.id ? [...prev, m] : prev);
                loadChats();
            });
        });
        return () => { stompRef.current?.deactivate(); };
        // eslint-disable-next-line
    }, [selected?.id]);

    async function openChat(c: ChatDto) {
        setSelected(c);
        const page = await getMessages(c.id);
        setMessages(page.content.reverse());
    }

    function getChatDisplay(c: ChatDto): { title: string; avatar?: string } {
        if (c.type === CHAT_TYPE.GROUP) return { title: c.name ?? "Group", avatar: c.avatarUrl };
        const u = c.otherParticipantId ? profiles[c.otherParticipantId] : undefined;
        return { title: u?.username ?? `user_${c.otherParticipantId}`, avatar: u?.avatarUrl };
    }

    async function handleSend() {
        if (!selected) return;
        if (!text.trim() && !attach) return;
        let url: string | undefined;
        if (attach) url = await uploadFile(attach);
        const sent = await sendMessage(selected.id, text, url);
        setMessages(prev => [...prev, sent]);
        setText(""); setAttach(null);
        loadChats();
    }

    async function onGroupAvatar(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]; if (!file || !selected) return;
        const url = await uploadFile(file);
        const updated = await updateChatAvatar(selected.id, url);
        setSelected(updated);
        loadChats();
    }

    async function doLeave() {
        if (!selected) return;
        if (!confirm("Покинуть чат?")) return;
        await leaveChat(selected.id);
        setSelected(null); setInfoOpen(false); loadChats();
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
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, height: "calc(100vh - 80px)" }}>
            {/* sidebar */}
            <aside style={{ borderRight: "1px solid #eee", overflow: "auto" }}>
                <button style={{ margin: 8 }} onClick={() => setShowNewGroup(true)}>+ New group</button>
                {chats.map(c => {
                    const { title, avatar } = getChatDisplay(c);
                    return (
                        <div key={c.id}
                             onClick={() => openChat(c)}
                             style={{ padding: 10, display: "flex", gap: 10, cursor: "pointer",
                                 background: selected?.id === c.id ? "#eef5ff" : "transparent" }}>
                            <Avatar url={avatar} name={title} />
                            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                                <div style={{ fontWeight: 600 }}>{title}</div>
                                <div style={{ fontSize: 12, color: "#607d8b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {previewOf(c)}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </aside>

            {/* main */}
            <section style={{ display: "flex", flexDirection: "column" }}>
                {!selected ? <div style={{ padding: 16, color: "#607d8b" }}>Выберите чат</div> : (
                    <>
                        <header style={{ borderBottom: "1px solid #eee", padding: 12 }}>
                            <button onClick={() => setInfoOpen(true)}
                                    style={{ background: "none", border: "none", fontSize: 18, fontWeight: 600, cursor: "pointer" }}>
                                {getChatDisplay(selected).title}
                            </button>
                        </header>

                        <div style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
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

                        <div style={{ borderTop: "1px solid #eee", padding: 8, display: "flex", gap: 8, alignItems: "center" }}>
                            <input type="file" hidden accept="image/*" ref={fileRef}
                                   onChange={(e) => setAttach(e.target.files?.[0] ?? null)} />
                            <button onClick={() => fileRef.current?.click()} title="Прикрепить">📎</button>
                            {attach && <span style={{ fontSize: 12 }}>{attach.name}</span>}
                            <input style={{ flex: 1 }} value={text} onChange={e => setText(e.target.value)}
                                   onKeyDown={e => e.key === "Enter" && handleSend()} placeholder="Сообщение…" />
                            <button onClick={handleSend}>Send</button>
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

            {showNewGroup && <NewGroupModal onClose={() => setShowNewGroup(false)} onCreated={() => { setShowNewGroup(false); loadChats(); }} />}
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