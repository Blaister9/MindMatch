import type { Role, UserStatus } from "@mindmatch/shared";

export interface AuthContext {
  userId: string;
  clinicId: string;
  role: Role;
  status: Extract<UserStatus, "active">;
  email: string;
}
