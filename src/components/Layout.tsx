import { Link, Outlet } from "react-router-dom";

export const Layout = () => {
  return (
    <div>
      <nav
        style={{
          display: "flex",
          gap: 20,
          padding: "12px 24px",
          borderBottom: "1px solid #ddd",
          background: "#f9f9f9",
        }}
      >
        <Link to="/chat">Chats</Link>
        <Link to="/friends">Friends</Link>
        <Link to="/profile">Profile</Link>
        <button
          onClick={() => {
            localStorage.removeItem("token");
            window.location.href = "/";
          }}
          style={{ marginLeft: "auto" }}
        >
          Logout
        </button>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
};