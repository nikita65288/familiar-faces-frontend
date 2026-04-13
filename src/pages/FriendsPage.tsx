import { useEffect, useState } from "react";
import {
  getFriends,
  getIncomingRequests,
  getOutgoingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
} from "@/features/friends/api";

type Friend = {
  id: number;
  authId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
};

type RequestItem = {
  friendshipId: number;
  sender: Friend;
  recipient: Friend;
  createdAt: string;
};

export const FriendsPage = () => {
  //const myAuthId = Number(getUserIdFromToken() ?? 0);
  const [activeTab, setActiveTab] = useState<"friends" | "incoming" | "outgoing">("friends");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<RequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<RequestItem[]>([]);
  const [searchAuthId, setSearchAuthId] = useState("");
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [friendsRes, incomingRes, outgoingRes] = await Promise.all([
        getFriends(),
        getIncomingRequests(),
        getOutgoingRequests(),
      ]);
      // Если ответ — массив, берём его; иначе пытаемся взять поле content
      setFriends(Array.isArray(friendsRes) ? friendsRes : (friendsRes?.content || []));
      setIncoming(Array.isArray(incomingRes) ? incomingRes : (incomingRes?.content || []));
      setOutgoing(Array.isArray(outgoingRes) ? outgoingRes : (outgoingRes?.content || []));
    } catch (error) {
      console.error("Failed to load friends data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSendRequest = async () => {
    if (!searchAuthId.trim()) return;
    try {
      await sendFriendRequest(Number(searchAuthId));
      setSearchAuthId("");
      loadData(); // обновить исходящие
    } catch (error) {
      alert("Failed to send request");
    }
  };

  const handleAccept = async (friendshipId: number) => {
    await acceptFriendRequest(friendshipId);
    loadData();
  };

  const handleReject = async (friendshipId: number) => {
    await rejectFriendRequest(friendshipId);
    loadData();
  };

  const handleCancel = async (friendshipId: number) => {
    await cancelFriendRequest(friendshipId);
    loadData();
  };

  const handleRemoveFriend = async (friendAuthId: number) => {
    if (window.confirm("Remove this friend?")) {
      await removeFriend(friendAuthId);
      loadData();
    }
  };

  const renderFriendItem = (friend: Friend) => (
    <div
      key={friend.authId}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid #eee",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img
          src={friend.avatarUrl || "/default-avatar.png"}
          alt=""
          style={{ width: 40, height: 40, borderRadius: "50%" }}
        />
        <span>
          {friend.firstName} {friend.lastName} (@{friend.username})
        </span>
      </div>
      <button onClick={() => handleRemoveFriend(friend.authId)}>Remove</button>
    </div>
  );

  const renderRequestItem = (
    item: RequestItem,
    type: "incoming" | "outgoing"
  ) => {
    const user = type === "incoming" ? item.sender : item.recipient;
    return (
      <div
        key={item.friendshipId}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 0",
          borderBottom: "1px solid #eee",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src={user.avatarUrl || "/default-avatar.png"}
            alt=""
            style={{ width: 40, height: 40, borderRadius: "50%" }}
          />
          <span>
            {user.firstName} {user.lastName} (@{user.username})
          </span>
        </div>
        <div>
          {type === "incoming" ? (
            <>
              <button onClick={() => handleAccept(item.friendshipId)}>Accept</button>
              <button onClick={() => handleReject(item.friendshipId)} style={{ marginLeft: 8 }}>
                Reject
              </button>
            </>
          ) : (
            <button onClick={() => handleCancel(item.friendshipId)}>Cancel</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Friends</h2>

      <div style={{ marginBottom: 20 }}>
        <input
          type="number"
          placeholder="Enter user AuthID"
          value={searchAuthId}
          onChange={(e) => setSearchAuthId(e.target.value)}
        />
        <button onClick={handleSendRequest} style={{ marginLeft: 8 }}>
          Send Friend Request
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, borderBottom: "1px solid #ccc", marginBottom: 16 }}>
        <button
          onClick={() => setActiveTab("friends")}
          style={{
            fontWeight: activeTab === "friends" ? "bold" : "normal",
            border: "none",
            background: "none",
            padding: "8px 0",
          }}
        >
          My Friends ({friends.length})
        </button>
        <button
          onClick={() => setActiveTab("incoming")}
          style={{
            fontWeight: activeTab === "incoming" ? "bold" : "normal",
            border: "none",
            background: "none",
            padding: "8px 0",
          }}
        >
          Incoming ({incoming.length})
        </button>
        <button
          onClick={() => setActiveTab("outgoing")}
          style={{
            fontWeight: activeTab === "outgoing" ? "bold" : "normal",
            border: "none",
            background: "none",
            padding: "8px 0",
          }}
        >
          Outgoing ({outgoing.length})
        </button>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <>
          {activeTab === "friends" && (
            <div>
              {friends.length === 0 ? (
                <p>No friends yet.</p>
              ) : (
                friends.map(renderFriendItem)
              )}
            </div>
          )}
          {activeTab === "incoming" && (
            <div>
              {incoming.length === 0 ? (
                <p>No incoming requests.</p>
              ) : (
                incoming.map((item) => renderRequestItem(item, "incoming"))
              )}
            </div>
          )}
          {activeTab === "outgoing" && (
            <div>
              {outgoing.length === 0 ? (
                <p>No outgoing requests.</p>
              ) : (
                outgoing.map((item) => renderRequestItem(item, "outgoing"))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};