"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, PresenceMember, PublicRoom, ServerEvent, SignalData } from "@/lib/types";

type Status = "connecting" | "live" | "reconnecting";

export function useHouseSocket(houseId: string) {
  const [status, setStatus] = useState<Status>("connecting");
  const [presence, setPresence] = useState<PresenceMember[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);
  const [housePatch, setHousePatch] = useState<{ name: string; welcome: string; hasPassword: boolean } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [passwordRoomId, setPasswordRoomId] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const onSignal = useRef<(fromUserId: string, data: SignalData) => void>(() => {});
  const seen = useRef(new Set<string>());

  function remember(message: ChatMessage) {
    if (seen.current.has(message.id)) return;
    seen.current.add(message.id);
    setMessages((current) => [...current, message].slice(-200));
  }

  const send = useCallback((payload: object) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const connect = async () => {
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      try {
        const response = await fetch("/api/realtime/session", { cache: "no-store" });
        if (!response.ok) {
          setNotice("Sign in again to rejoin the house.");
          return;
        }
        const { cookie } = (await response.json()) as { cookie: string };
        if (stopped) return;
        const url = process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://127.0.0.1:3848";
        socket = new WebSocket(`${url}/socket`);
        socketRef.current = socket;
        socket.onopen = () => {
          socket?.send(JSON.stringify({ type: "hello", cookie }));
        };
        socket.onmessage = (event) => {
          const data = JSON.parse(String(event.data)) as ServerEvent;
          if (data.type === "hello") {
            socket?.send(JSON.stringify({ type: "join", houseId }));
          } else if (data.type === "joined") {
            attempt = 0;
            setStatus("live");
            setRoomId(data.roomId);
            setNotice(null);
          } else if (data.type === "entered") {
            setRoomId(data.roomId);
            setPasswordRoomId(null);
            setNotice(null);
          } else if (data.type === "presence") {
            setPresence(data.members);
          } else if (data.type === "structure") {
            setRooms(data.rooms);
            setHousePatch(data.house);
          } else if (data.type === "chat") {
            remember(data.message);
          } else if (data.type === "error") {
            if (data.code === "room-password" || data.code === "wrong-password") {
              setPasswordRoomId(data.roomId ?? null);
            }
            setNotice(data.message);
          } else if (data.type === "removed") {
            setGone(data.reason);
          } else if (data.type === "deleted") {
            setGone("The host closed this house.");
          } else if (data.type === "signal") {
            onSignal.current(data.fromUserId, data.data);
          }
        };
        socket.onclose = () => {
          if (stopped) return;
          attempt += 1;
          const delay = Math.min(4000, 500 * attempt);
          retry = setTimeout(() => void connect(), delay);
        };
      } catch {
        if (stopped) return;
        attempt += 1;
        retry = setTimeout(() => void connect(), 1000);
      }
    };

    void connect();
    const ping = setInterval(() => send({ type: "ping" }), 20000);

    return () => {
      stopped = true;
      clearInterval(ping);
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [houseId, send]);

  return {
    status,
    presence,
    roomId,
    rooms,
    housePatch,
    messages,
    notice,
    setNotice,
    passwordRoomId,
    setPasswordRoomId,
    gone,
    send,
    onSignal,
    remember,
  };
}
