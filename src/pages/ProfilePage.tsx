import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getMyProfile, getUserProfile, updateMyAvatar, updateMyProfile, type UserProfileDto } from "@/features/user/api";
import { uploadFile } from "@/features/media/api";
import { resolveMediaUrl } from "@/shared/lib/media";
import { getUserIdFromToken } from "@/shared/lib/jwt";
import { Avatar } from "@/components/Avatar";

export default function ProfilePage() {
  const { authId } = useParams();
  const myAuthId = getUserIdFromToken();
  const targetId = authId ? Number(authId) : myAuthId;
  const own = targetId === myAuthId;

  const [p, setP] = useState<UserProfileDto | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", bio: "" });
  const [zoom, setZoom] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const profile = own ? await getMyProfile() : await getUserProfile(targetId!);
      setP(profile);
      setForm({
        firstName: profile.firstName ?? "",
        lastName: profile.lastName ?? "",
        bio: profile.bio ?? "",
      });
    })();
  }, [targetId, own]);

  if (!p) return <div>Загрузка…</div>;

  async function save() {
    const updated = await updateMyProfile(form);
    setP(updated); setEdit(false);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    const updated = await updateMyAvatar(url);
    setP(updated);
  }

  return (
      <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Avatar url={p.avatarUrl} name={p.username} size={96} onClick={() => p.avatarUrl && setZoom(true)} />
          <div>
            <h2 style={{ margin: 0 }}>{p.username}</h2>
            {own && p.email && <div style={{ color: "#607d8b" }}>{p.email}</div>}
          </div>
        </div>

        {own && (
            <>
              <input type="file" accept="image/*" hidden ref={fileRef} onChange={onFile} />
              <button onClick={() => fileRef.current?.click()}>Сменить аватар</button>
            </>
        )}

        {!edit ? (
            <>
              <div><b>Имя:</b> {p.firstName ?? "—"}</div>
              <div><b>Фамилия:</b> {p.lastName ?? "—"}</div>
              <div><b>О себе:</b> {p.bio ?? "—"}</div>
              {own && <button onClick={() => setEdit(true)}>Редактировать</button>}
            </>
        ) : (
            <>
              <input placeholder="Имя" value={form.firstName}
                     onChange={e => setForm({ ...form, firstName: e.target.value })} />
              <input placeholder="Фамилия" value={form.lastName}
                     onChange={e => setForm({ ...form, lastName: e.target.value })} />
              <textarea placeholder="О себе" value={form.bio}
                        onChange={e => setForm({ ...form, bio: e.target.value })} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={save}>Сохранить</button>
                <button onClick={() => setEdit(false)}>Отмена</button>
              </div>
            </>
        )}

        {zoom && p.avatarUrl && (
            <div onClick={() => setZoom(false)}
                 style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)",
                   display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
              <img src={resolveMediaUrl(p.avatarUrl)} style={{ maxWidth: "90vw", maxHeight: "90vh" }} />
            </div>
        )}
      </div>
  );
}

