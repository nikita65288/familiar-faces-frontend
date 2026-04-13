import { useEffect, useState } from "react";
import { getUserProfile, updateMyProfile, updateMyAvatar } from "@/features/user/api";
import { getUserIdFromToken } from "@/shared/lib/jwt";

export const ProfilePage = () => {
  const myAuthId = Number(getUserIdFromToken() ?? 0);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    firstName: "",
    lastName: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);

  const loadProfile = async () => {
    try {
      console.log("User auth Id: ", myAuthId);
      const data = await getUserProfile(myAuthId);
      setProfile(data);
      setFormData({
        username: data.username || "",
        firstName: data.firstName || "",
        lastName: data.lastName || "",
      });
      setPreviewAvatar(data.avatarUrl || null);
    } catch (error) {
      console.error("Failed to load profile", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (myAuthId) loadProfile();
  }, [myAuthId]);

  const handleSave = async () => {
    try {
      await updateMyProfile(formData);
      if (avatarFile) {
        const formData = new FormData();
        formData.append("avatar", avatarFile);
        await updateMyAvatar(formData);
      }
      setEditMode(false);
      loadProfile(); // refresh
    } catch (error) {
      console.error("Failed to update profile", error);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setPreviewAvatar(URL.createObjectURL(file));
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <h2>My Profile</h2>
      <div style={{ display: "flex", gap: 24, alignItems: "start" }}>
        <div style={{ textAlign: "center" }}>
          {previewAvatar ? (
            <img
              src={previewAvatar}
              alt="Avatar"
              style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: "#ccc",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              No photo
            </div>
          )}
          {editMode && (
            <div style={{ marginTop: 8 }}>
              <input type="file" accept="image/*" onChange={handleAvatarChange} />
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          {!editMode ? (
            <>
              <p>
                <strong>Username:</strong> {profile?.username}
              </p>
              <p>
                <strong>Name:</strong> {profile?.firstName} {profile?.lastName}
              </p>
              <p>
                <strong>Email:</strong> {profile?.email}
              </p>
              <button onClick={() => setEditMode(true)}>Edit Profile</button>
            </>
          ) : (
            <>
              <label>
                Username:
                <input
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </label>
              <label>
                First Name:
                <input
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
              </label>
              <label>
                Last Name:
                <input
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </label>
              <div style={{ marginTop: 16 }}>
                <button onClick={handleSave}>Save</button>
                <button onClick={() => setEditMode(false)} style={{ marginLeft: 8 }}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};