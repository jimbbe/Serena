export type SessionResolution =
  | { type: "existing_session"; sessionId: string }
  | { type: "new_session_possible" }
  | { type: "no_active_session" }
  | { type: "ambiguous_active_sessions"; activeSessionIds: string[] };
