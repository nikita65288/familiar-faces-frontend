import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  acceptRequest, cancelRequest, getFriends, getIncoming, getOutgoing,
  rejectRequest, removeFriend, sendFriendRequest,
} from "@/features/friends/api";
import type { FriendshipDto } from "@/entities/friendship/types";
import { getUserProfile, searchUserByUsername, searchUsersByPrefix, type UserProfileDto } from "@/features/user/api";
import { getUserIdFromToken } from "@/shared/lib/jwt";
import { createPrivateChat } from "@/features/chat/api";
import { Avatar } from "@/components/Avatar";

export default function FriendsPage() {
  const nav = useNavigate();
  const myAuthId = getUserIdFromToken();

  const [friends, setFriends] = useState<FriendshipDto[]>([]);
  const [incoming, setIncoming] = useState<FriendshipDto[]>([]);
  const [outgoing, setOutgoing] = useState<FriendshipDto[]>([]);
  const [profiles, setProfiles] = useState<Record<number, UserProfileDto>>({});

  const [searchUsername, setSearchUsername] = useState("");
  const [suggestions, setSuggestions] = useState<UserProfileDto[]>([]);
  const [searchResult, setSearchResult] = useState<UserProfileDto | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadAll() {
    setError(null);
    try {
      const [f, i, o] = await Promise.all([getFriends(), getIncoming(), getOutgoing()]);
      setFriends(f); setIncoming(i); setOutgoing(o);

      const ids = new Set<number>();
      [...f, ...i, ...o].forEach(fr => { ids.add(fr.requesterId); ids.add(fr.addresseeId); });
      if (myAuthId) ids.delete(myAuthId);
      const needed = [...ids].filter(id => !profiles[id]);
      const loaded = await Promise.all(needed.map(id => getUserProfile(id).catch(() => null)));
      const map = { ...profiles };
      loaded.forEach((p, idx) => { if (p) map[needed[idx]] = p; });
      setProfiles(map);
    } catch (e: any) {
      setError(`${e?.response?.status ?? ""} ${e?.message ?? "Ошибка"}`);
    }
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  const otherIdOf = (fr: FriendshipDto) =>
      fr.requesterId === myAuthId ? fr.addresseeId : fr.requesterId;

  const renderUser = (uid: number) => {
    const u = profiles[uid];
    const label = u?.username ?? `user_${uid}`;
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}
             onClick={() => nav(`/profile/${uid}`)}>
          <Avatar url={u?.avatarUrl} name={label} />
          <span style={{ fontWeight: 500 }}>{label}</span>
        </div>
    );
  };

  // Suggestions from already-loaded profiles (no extra network)
  async function computeSuggestions(val: string) {
    if (val.length < 3) { setSuggestions([]); return; }
    try {
      const results = await searchUsersByPrefix(val);
      setSuggestions(results.filter(u => u.authId !== myAuthId).slice(0, 8));
    } catch {
      setSuggestions([]);
    }
  }

  function handleSearchInput(val: string) {
    setSearchUsername(val);
    setSearchResult(null);
    setSearchError(null);

    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    suggestTimerRef.current = setTimeout(() => { computeSuggestions(val); }, 300);
  }

  async function handleSearch() {
    const q = searchUsername.trim();
    if (!q) return;
    setSearchError(null);
    setSearchResult(null);
    setSuggestions([]);
    try {
      // Backend exact match is case-sensitive — try as-is and lowercase
      const user = await searchUserByUsername(q).catch(() =>
          searchUserByUsername(q.toLowerCase())
      );
      setSearchResult(user);
    } catch {
      setSearchError("Пользователь не найден");
    }
  }

  function pickSuggestion(u: UserProfileDto) {
    setSearchUsername(u.username ?? "");
    setSuggestions([]);
    setSearchResult(u);
  }

  async function handleAddFound() {
    if (!searchResult?.authId) return;
    try {
      await sendFriendRequest(searchResult.authId);
      setSearchResult(null);
      setSearchUsername("");
      await loadAll();
    } catch (e: any) {
      setSearchError(`${e?.response?.status ?? ""} ${e?.response?.data?.message ?? e.message}`);
    }
  }

  async function openChat(uid: number) {
    const firstMessage = window.prompt("Первое сообщение (можно пропустить):") ?? undefined;
    const chat = await createPrivateChat(uid, firstMessage || undefined);
    nav(`/chats?chat=${chat.id}`);
  }

  return (
      <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        {error && <div style={{ color: "crimson" }}>{error}</div>}

        <section>
          <h3>Добавить в друзья</h3>
          <div style={{ display: "flex", gap: 8, position: "relative" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={searchUsername}
                  onChange={e => handleSearchInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  placeholder="Имя пользователя"
                  autoComplete="off"
              />
              {suggestions.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                    background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6,
                    boxShadow: "0 4px 12px rgba(0,0,0,.12)", maxHeight: 220, overflowY: "auto",
                  }}>
                    {suggestions.map(u => (
                        <div key={u.authId}
                             onClick={() => pickSuggestion(u)}
                             style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer" }}
                             onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")}
                             onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <Avatar url={u.avatarUrl} name={u.username ?? ""} size={24} />
                          <span>{u.username}</span>
                        </div>
                    ))}
                  </div>
              )}
            </div>
            <button onClick={handleSearch}>Найти</button>
          </div>
          {searchError && <div style={{ color: "crimson", marginTop: 4 }}>{searchError}</div>}
          {searchResult && (
              <div style={{ ...row, marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}
                     onClick={() => searchResult.authId && nav(`/profile/${searchResult.authId}`)}>
                  <Avatar url={searchResult.avatarUrl} name={searchResult.username ?? ""} />
                  <span style={{ fontWeight: 500 }}>{searchResult.username}</span>
                </div>
                <button onClick={handleAddFound}>Добавить в друзья</button>
              </div>
          )}
        </section>

        <section>
          <h3>Входящие запросы ({incoming.length})</h3>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {incoming.map(fr => (
                <div key={fr.id} style={row}>
                  {renderUser(fr.requesterId)}
                  <button onClick={async () => { await acceptRequest(fr.id); loadAll(); }}>Принять</button>
                  <button onClick={async () => { await rejectRequest(fr.id); loadAll(); }}>Отклонить</button>
                </div>
            ))}
          </div>
        </section>

        <section>
          <h3>Исходящие запросы ({outgoing.length})</h3>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {outgoing.map(fr => (
                <div key={fr.id} style={row}>
                  {renderUser(fr.addresseeId)}
                  <button onClick={async () => { await cancelRequest(fr.id); loadAll(); }}>Отменить</button>
                </div>
            ))}
          </div>
        </section>

        <section>
          <h3>Друзья ({friends.length})</h3>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {friends.map(fr => {
              const uid = otherIdOf(fr);
              return (
                  <div key={fr.id} style={row}>
                    {renderUser(uid)}
                    <button onClick={() => openChat(uid)}>Написать</button>
                    <button onClick={async () => { await removeFriend(uid); loadAll(); }}>Удалить</button>
                  </div>
              );
            })}
          </div>
        </section>
      </div>
  );
}

const row: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "8px 0", borderBottom: "1px solid #eee",
};
