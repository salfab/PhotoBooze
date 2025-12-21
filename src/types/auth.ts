export interface SessionPayload {
  partyId: string;
  uploaderId: string;
  iat: number;
  exp: number;
}

export interface SessionData {
  partyId: string;
  uploaderId: string;
}
