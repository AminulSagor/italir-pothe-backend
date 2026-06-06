import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

const WEBINAR_ROOM_PREFIX = 'webinar';

@WebSocketGateway({
  namespace: 'webinars',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  },
})
export class WebinarGateway {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join_webinar_room')
  async joinWebinarRoom(
    @MessageBody() payload: { webinarId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const webinarId = this.validateWebinarId(payload?.webinarId);
    const roomName = this.getWebinarRoomName(webinarId);

    await client.join(roomName);

    return {
      event: 'join_webinar_room',
      webinarId,
      joined: true,
    };
  }

  @SubscribeMessage('leave_webinar_room')
  async leaveWebinarRoom(
    @MessageBody() payload: { webinarId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const webinarId = this.validateWebinarId(payload?.webinarId);
    const roomName = this.getWebinarRoomName(webinarId);

    await client.leave(roomName);

    return {
      event: 'leave_webinar_room',
      webinarId,
      left: true,
    };
  }

  emitWebinarStarted(webinarId: string, payload: Record<string, unknown>) {
    this.emitToWebinarRoom(webinarId, 'webinar_started', payload);
  }

  emitWebinarEnded(webinarId: string, payload: Record<string, unknown>) {
    this.emitToWebinarRoom(webinarId, 'webinar_ended', payload);
  }

  emitParticipantListUpdated(
    webinarId: string,
    payload: Record<string, unknown>,
  ) {
    this.emitToWebinarRoom(webinarId, 'participants_list_updated', payload);
  }

  emitSpeakerRequestCreated(
    webinarId: string,
    payload: Record<string, unknown>,
  ) {
    this.emitToWebinarRoom(webinarId, 'speaker_request_created', payload);
    this.emitToWebinarRoom(webinarId, 'speaker_requests_list_updated', payload);
  }

  emitSpeakerRequestApproved(
    webinarId: string,
    payload: Record<string, unknown>,
  ) {
    this.emitToWebinarRoom(webinarId, 'speaker_request_approved', payload);
    this.emitToWebinarRoom(webinarId, 'speaker_requests_list_updated', payload);
    this.emitToWebinarRoom(webinarId, 'participants_list_updated', payload);
  }

  emitSpeakerRequestRejected(
    webinarId: string,
    payload: Record<string, unknown>,
  ) {
    this.emitToWebinarRoom(webinarId, 'speaker_request_rejected', payload);
    this.emitToWebinarRoom(webinarId, 'speaker_requests_list_updated', payload);
    this.emitToWebinarRoom(webinarId, 'participants_list_updated', payload);
  }

  emitChatMessageCreated(
    webinarId: string,
    payload: Record<string, unknown>,
  ) {
    this.emitToWebinarRoom(webinarId, 'webinar_chat_message_created', payload);
    this.emitToWebinarRoom(webinarId, 'webinar_chat_messages_updated', payload);
  }

  private emitToWebinarRoom(
    webinarId: string,
    eventName: string,
    payload: Record<string, unknown>,
  ) {
    this.server.to(this.getWebinarRoomName(webinarId)).emit(eventName, {
      webinarId,
      ...payload,
    });
  }

  private getWebinarRoomName(webinarId: string): string {
    return `${WEBINAR_ROOM_PREFIX}:${webinarId}`;
  }

  private validateWebinarId(webinarId?: string): string {
    if (
      !webinarId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        webinarId,
      )
    ) {
      throw new WsException('A valid webinarId is required.');
    }

    return webinarId;
  }
}
