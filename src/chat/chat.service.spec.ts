import { ChatService } from './chat.service';
import { MessageModerationBlockedException } from './moderation/message-moderation.exception';

describe('ChatService proactive moderation', () => {
  const createHarness = (decision: Record<string, unknown>) => {
    const messageRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'message-1', ...value })),
    };
    const attachmentRepo = { create: jest.fn(), save: jest.fn() };
    const conversationRepo = { update: jest.fn().mockResolvedValue(undefined) };
    const participantRepo = {};
    const deliveryJobRepo = {};
    const moderationService = {
      moderate: jest.fn().mockResolvedValue(decision),
    };
    const service = new ChatService(
      messageRepo as any,
      attachmentRepo as any,
      conversationRepo as any,
      participantRepo as any,
      deliveryJobRepo as any,
      moderationService as any,
    );
    return { service, messageRepo, moderationService };
  };

  it('does not persist a blocked message', async () => {
    const { service, messageRepo } = createHarness({
      action: 'block',
      confidence: 0.98,
      categories: ['threat'],
    });

    await expect(
      service.createMessage({
        conversationId: 'conversation-1',
        senderId: 'sender-1',
        content: 'threatening content',
      }),
    ).rejects.toBeInstanceOf(MessageModerationBlockedException);
    expect(messageRepo.save).not.toHaveBeenCalled();
  });

  it('persists warning decisions and includes a sender warning', async () => {
    const { service, messageRepo } = createHarness({
      action: 'warn',
      confidence: 0.95,
      categories: ['harassment'],
    });

    const saved = await service.createMessage({
      conversationId: 'conversation-1',
      senderId: 'sender-1',
      content: 'abusive content',
    });

    expect(messageRepo.save).toHaveBeenCalled();
    expect(saved.moderationWarning).toMatchObject({
      code: 'MESSAGE_ALLOWED_WITH_WARNING',
      categories: ['harassment'],
    });
  });
});
