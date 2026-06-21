import { ChatController } from './chat.controller';

describe('ChatController.markConversationRead', () => {
  let controller: any;
  let mocks: any;

  beforeEach(() => {
    mocks = {
      chatService: {},
      chatGateway: { server: { to: () => ({ emit: jest.fn() }) }, sendToUser: jest.fn() },
      conversationRepo: { findOne: jest.fn() },
      directRepo: {},
      participantRepo: { findOne: jest.fn(), save: jest.fn(), find: jest.fn() },
      messageRepo: { findOne: jest.fn() },
    };

    controller = new ChatController(
      mocks.chatService,
      mocks.chatGateway,
      mocks.conversationRepo,
      mocks.directRepo,
      mocks.participantRepo,
      mocks.messageRepo,
    );
  });

  it('updates when incoming read is newer', async () => {
    const me = { id: 'user1' };
    const participant = { conversationId: 'conv1', userId: 'user1', lastReadSequenceNo: 1, unreadCount: 2 };
    mocks.participantRepo.findOne.mockResolvedValue(participant);
    mocks.messageRepo.findOne.mockResolvedValue({ id: 'm5', conversationId: 'conv1', sequenceNo: 5 });
    mocks.participantRepo.save.mockResolvedValue(true);
    mocks.participantRepo.find.mockResolvedValue([{ userId: 'user1' }, { userId: 'user2' }]);

    const res = await controller.markConversationRead({ user: me }, 'conv1', { lastReadMessageId: 'm5' });
    expect(mocks.participantRepo.save).toHaveBeenCalled();
    expect(res).toEqual({ unreadCount: 0, isHighlighted: false });
  });

  it('is idempotent when incoming not newer', async () => {
    const me = { id: 'user1' };
    const participant = { conversationId: 'conv1', userId: 'user1', lastReadSequenceNo: 10, unreadCount: 0 };
    mocks.participantRepo.findOne.mockResolvedValue(participant);
    mocks.conversationRepo.findOne.mockResolvedValue({ lastMessage: { sequenceNo: 12, senderId: 'user2' } });

    const res = await controller.markConversationRead({ user: me }, 'conv1', { lastReadMessageId: 'm5' });
    expect(mocks.participantRepo.save).not.toHaveBeenCalled();
    expect(res).toHaveProperty('unreadCount');
    expect(res).toHaveProperty('isHighlighted');
  });
});
