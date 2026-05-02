export type ActiveSessionInfo = {
  sessionId: string;
  requesterId: string;
  recipientId: string;
  status: string;
  createdAt: string;
};

export type ActiveSessionQuery = {
  findActiveSessionsByParticipant(participantId: string): Promise<ActiveSessionInfo[]>;
};
