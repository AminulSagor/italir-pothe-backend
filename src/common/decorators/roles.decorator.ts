import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';

// A constant key to store and retrieve the metadata
export const ROLES_KEY = 'roles';

// The decorator function
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
