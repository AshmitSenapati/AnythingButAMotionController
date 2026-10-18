export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

export type SensorStatus =
  | 'checking'
  | 'available'
  | 'active'
  | 'unavailable'
  | 'denied';

export type ControlMode = 'motion' | 'joystick' | 'hybrid';

export interface MotionReading {
  tilt: number; // degrees left/right (-45 to 45)
  acceleration: number; // degrees forward/backward (-45 to 45)
  normalizedX: number; // -1 to 1
  normalizedY: number; // -1 to 1
  rawX: number;
  rawY: number;
  rawZ: number;
}

export interface ControllerDataPayload {
  tilt: number;
  acceleration: number;
}

export interface RoomState {
  roomCode: string;
  laptopConnected: boolean;
  controllerConnected: boolean;
}

export interface JoinRoomResult {
  success: boolean;
  roomCode?: string;
  state?: RoomState;
  error?: string;
}

export interface LeaveRoomResult {
  success: boolean;
  roomCode?: string;
  state?: RoomState;
  error?: string;
}
