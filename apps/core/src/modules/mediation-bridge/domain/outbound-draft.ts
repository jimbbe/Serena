export type OutboundDraft = {
  toParticipantId: string;
  text: string;
  includesSerenaIntroduction: boolean;
  attribution: {
    fromParticipantId: string;
    fromDisplayName: string;
  };
};