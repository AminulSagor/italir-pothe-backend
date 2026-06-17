import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

export const validateUserId = (userId: string): void => {
    if (!userId) {
        throw new BadRequestException('User id is required');
    }

    if (!isUUID(userId)) {
        throw new BadRequestException('Invalid user id');
    }
};