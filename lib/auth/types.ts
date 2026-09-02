export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  emailVerified: Date | null;
  createdAt: Date;
}

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}
