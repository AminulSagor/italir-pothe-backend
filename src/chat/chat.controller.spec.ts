import { ChatController } from './chat.controller';

describe('ChatController.markConversationRead', () => {
  let controller: any;
  let mocks: any;

  beforeEach(() => {
    mocks = {
      chatService: {
        getConversationParticipantIds: jest.fn(),
        createMessage: jest.fn(),
      },
      chatGateway: {
        server: { to: () => ({ emit: jest.fn() }) },
        sendToUser: jest.fn(),
      },
      conversationRepo: { findOne: jest.fn() },
      directRepo: {},
      participantRepo: { findOne: jest.fn(), save: jest.fn(), find: jest.fn() },
      messageRepo: { findOne: jest.fn() },
      callRepo: {},
      userRepo: { count: jest.fn() },
    };

    controller = new ChatController(
      mocks.chatService,
      mocks.chatGateway,
      mocks.conversationRepo,
      mocks.directRepo,
      mocks.participantRepo,
      mocks.messageRepo,
      mocks.callRepo,
      mocks.userRepo,
    );
  });

  it('updates when incoming read is newer', async () => {
    const me = { id: 'user1' };
    const participant = {
      conversationId: 'conv1',
      userId: 'user1',
      lastReadSequenceNo: 1,
      unreadCount: 2,
    };
    mocks.participantRepo.findOne.mockResolvedValue(participant);
    mocks.messageRepo.findOne.mockResolvedValue({
      id: 'm5',
      conversationId: 'conv1',
      sequenceNo: 5,
    });
    mocks.participantRepo.save.mockResolvedValue(true);
    mocks.participantRepo.find.mockResolvedValue([
      { userId: 'user1' },
      { userId: 'user2' },
    ]);

    const res = await controller.markConversationRead({ user: me }, 'conv1', {
      lastReadMessageId: 'm5',
    });
    expect(mocks.participantRepo.save).toHaveBeenCalled();
    expect(res).toEqual({ unreadCount: 0, isHighlighted: false });
  });

  it('is idempotent when incoming not newer', async () => {
    const me = { id: 'user1' };
    const participant = {
      conversationId: 'conv1',
      userId: 'user1',
      lastReadSequenceNo: 10,
      unreadCount: 0,
    };
    mocks.participantRepo.findOne.mockResolvedValue(participant);
    mocks.messageRepo.findOne.mockResolvedValue({
      id: 'm5',
      conversationId: 'conv1',
      sequenceNo: 5,
    });
    mocks.conversationRepo.findOne.mockResolvedValue({
      lastMessage: { sequenceNo: 12, senderId: 'user2' },
    });

    const res = await controller.markConversationRead({ user: me }, 'conv1', {
      lastReadMessageId: 'm5',
    });
    expect(mocks.participantRepo.save).not.toHaveBeenCalled();
    expect(res).toHaveProperty('unreadCount');
    expect(res).toHaveProperty('isHighlighted');
  });

  it('does not persist a message when the other account is unavailable', async () => {
    mocks.participantRepo.findOne.mockResolvedValue({
      conversationId: 'conv1',
      userId: 'user1',
    });
    mocks.chatService.getConversationParticipantIds.mockResolvedValue([
      'user1',
      'deleted-user',
    ]);
    mocks.userRepo.count.mockResolvedValue(0);

    const result = await controller.sendMessage(
      { user: { id: 'user1' } },
      'conv1',
      { content: 'hello' },
    );

    expect(result).toEqual({
      error: 'This account is no longer available.',
      code: 'USER_UNAVAILABLE',
    });
    expect(mocks.chatService.createMessage).not.toHaveBeenCalled();
  });
});
