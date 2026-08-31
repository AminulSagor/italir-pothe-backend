import { BadRequestException } from '@nestjs/common';

export class MessageModerationBlockedException extends BadRequestException {
  constructor() {
    super({
      code: 'MESSAGE_BLOCKED_BY_MODERATION',
      message:
        'This message may seriously harm or threaten someone, so it was not sent. Please revise it and try again.',
    });
  }
}
