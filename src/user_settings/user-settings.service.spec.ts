import { BadRequestException } from '@nestjs/common';

import { UserRole } from '../users/entities/user.entity';
import { UserDeletionSource } from '../users/entities/deleted-user-audit.entity';
import { UserSettingsService } from './user-settings.service';

describe('UserSettingsService account deletion confirmation', () => {
  const deleteAccount = jest.fn().mockResolvedValue({
    message: 'User account deleted successfully.',
  });
  const userRepository = {
    findOne: jest.fn(),
  };
  const service = new UserSettingsService(
    userRepository as never,
    {} as never,
    {} as never,
    { deleteAccount } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows an authenticated nameless account to confirm with DELETE', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-id',
      fullName: '',
      role: UserRole.USER,
    });

    await service.deleteAccount('user-id', { confirmation: 'DELETE' });

    expect(deleteAccount).toHaveBeenCalledWith({
      targetUserId: 'user-id',
      deletedByUserId: 'user-id',
      source: UserDeletionSource.SELF_SERVICE,
      expectedRole: UserRole.USER,
    });
  });

  it('rejects deletion when neither confirmation method matches', async () => {
    userRepository.findOne.mockResolvedValue({
      id: 'user-id',
      fullName: '',
      role: UserRole.USER,
    });

    await expect(
      service.deleteAccount('user-id', { confirmation: 'KEEP' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
