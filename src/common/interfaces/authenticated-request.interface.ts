import type { Request } from 'express';
import type { UserRole } from 'src/users/entities/user.entity';

export interface AuthenticatedRequestUser {
  id?: string;
  sub?: string;
  sessionId?: string;
  deviceId?: string;
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  role?: UserRole | string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedRequestUser;
}
