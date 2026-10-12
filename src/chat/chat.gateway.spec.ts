import type { Socket } from 'socket.io';

import { ChatGateway } from './chat.gateway';

describe('ChatGateway unavailable participants', () => {
  it('rejects a message before persistence when the other account is gone', async () => {
    const chatService = {
      createMessage: jest.fn(),
    };
    const userRepository = {
      exists: jest.fn().mockResolvedValue(false),
    };
    const conversationRepository = {
      findOne: jest.fn().mockResolvedValue({ type: 'direct' }),
    };
    const directConversationRepository = {
      findOne: jest.fn().mockResolvedValue({
        userOneId: 'current-user',
        userTwoId: 'deleted-user',
      }),
    };
    const participantRepository = {
      exists: jest.fn().mockResolvedValue(true),
    };

    const gateway = new ChatGateway(
      {} as never,
      chatService as never,
      { assertCanMessage: jest.fn() } as never,
      userRepository as never,
      conversationRepository as never,
      directConversationRepository as never,
      participantRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const client = {
      data: {
        user: {
          id: 'current-user',
        },
      },
    } as unknown as Socket;

    const response = await gateway.handleSendMessage(client, {
      conversationId: 'conversation-id',
      content: 'hello',
    });

    expect(response).toEqual({
      error: 'This account is no longer available.',
      code: 'USER_UNAVAILABLE',
    });
    expect(chatService.createMessage).not.toHaveBeenCalled();
  });

  it('rejects a non-participant before inspecting or persisting the conversation', async () => {
    const chatService = {
      createMessage: jest.fn(),
    };
    const conversationRepository = {
      findOne: jest.fn(),
    };
    const gateway = new ChatGateway(
      {} as never,
      chatService as never,
      { assertCanMessage: jest.fn() } as never,
      { exists: jest.fn() } as never,
      conversationRepository as never,
      { findOne: jest.fn() } as never,
      { exists: jest.fn().mockResolvedValue(false) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const client = {
      data: {
        user: {
          id: 'current-user',
        },
      },
    } as unknown as Socket;

    const response = await gateway.handleSendMessage(client, {
      conversationId: 'conversation-id',
      content: 'hello',
    });

    expect(response).toEqual({
      error: 'Not a conversation participant.',
      code: 'NOT_A_PARTICIPANT',
    });
    expect(conversationRepository.findOne).not.toHaveBeenCalled();
    expect(chatService.createMessage).not.toHaveBeenCalled();
  });
});
