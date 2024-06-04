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
