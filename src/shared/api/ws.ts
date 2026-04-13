import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";

let stompClient: Client | null = null;

export const switchChat = async (chatId: number, onEvent: (event: any) => void) => {
    // Отключаем существующее соединение, если есть
    if (stompClient) {
        await stompClient.deactivate();
        stompClient = null;
    }

    const socket = new SockJS("http://localhost:8080/ws");
    stompClient = new Client({
        webSocketFactory: () => socket as any,
        reconnectDelay: 5000,
        debug: () => {},
        onConnect: () => {
            console.log(`WS CONNECTED for chat ${chatId}`);

            stompClient?.subscribe(`/topic/chats.${chatId}`, (message) => {
                onEvent({ type: "NEW_MESSAGE", payload: JSON.parse(message.body) });
            });

            stompClient?.subscribe(`/topic/chats.${chatId}.delete`, (message) => {
                onEvent({ type: "DELETE_MESSAGE", payload: Number(message.body) });
            });

            stompClient?.subscribe(`/topic/chats.${chatId}.read`, (message) => {
                const payload = JSON.parse(message.body);
                onEvent({ type: "READ_MESSAGES", payload });
            });
        },
        onStompError: (frame) => console.error("WS STOMP ERROR:", frame),
        onWebSocketError: (event) => console.error("WS SOCKET ERROR:", event),
    });
    stompClient.activate();
};

export const disconnectWebSocket = async () => {
    if (stompClient) {
        await stompClient.deactivate();
        stompClient = null;
    }
};