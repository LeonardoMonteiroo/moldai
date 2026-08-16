export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}
