export const MAX_DISTANCE = 700;

export interface PongMessagePayloadOscillator {
  frequency: number;
  wave: "sine" | "triangle" | "sawtooth" | "square";
  endpoints: ConnectorNode[];
  parent?: string;
  id: string;
  x: number;
  y: number;
}

export interface PongMessagePayloadUser {
  sessionId: string;
  user: string;
  position: Vector | null;
  distances: { [k: string]: number };
  oscillators: { [k: string]: PongMessagePayloadOscillator };
  selection: string[];
}

export interface PongMessagePayload {
  currentSessionId: string;
  users: { [sessionId: string]: PongMessagePayloadUser };
  widgets: { [k: string]: PongMessagePayloadOscillator };
}

export interface PongMessage {
  type: "PONG";
  payload: PongMessagePayload;
}

export interface PingMessage {
  type: "PING";
  beat?: { step: number; change: boolean };
}

export function messageIsPongMessage(
  message: any | PongMessage
): message is PongMessage {
  return message.type === "PONG";
}

export function messageIsPingMessage(
  message: any | PingMessage
): message is PingMessage {
  return message.type === "PING";
}
