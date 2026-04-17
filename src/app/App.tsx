import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import ProfilePage from "@/pages/ProfilePage";
import FriendsPage from "@/pages/FriendsPage";
import ChatPage from "@/pages/ChatPage";
import { getAuthToken } from "@/shared/lib/authStorage";
import { initTheme } from "@/shared/lib/theme";

initTheme();

function Protected({ children }: { children: React.ReactNode }) {
    return getAuthToken() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route element={<Protected><Layout /></Protected>}>
                    <Route path="/chats" element={<ChatPage />} />
                    <Route path="/friends" element={<FriendsPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/profile/:authId" element={<ProfilePage />} />
                </Route>
                <Route path="*" element={<Navigate to="/chats" replace />} />
            </Routes>
        </BrowserRouter>
    );
}