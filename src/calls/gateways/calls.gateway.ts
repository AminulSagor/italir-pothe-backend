import { HttpException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { InitiateCallDto } from '../dto/initiate-call.dto';
import { CallOrchestratorService } from '../services/call-orchestrator.service';
import { CallRealtimeService } from '../services/call-realtime.service';

interface CallIdPayload {
  callId: string;
}

@WebSocketGateway({
  namespace: 'calls',
  cors: true,
  transports: ['websocket', 'polling'],
})
export class CallsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(CallsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly callOrchestratorService: CallOrchestratorService,
    private readonly callRealtimeService: CallRealtimeService,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  afterInit(server: Server): void {
    this.callRealtimeService.setServer(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn('Call socket rejected because JWT token is missing');

        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify<{
        sub?: string;
        id?: string;
      }>(token);

      const userId = payload.sub ?? payload.id;

      if (!userId) {
        client.disconnect(true);
        return;
      }

      const user = await this.userRepository.findOne({
        where: {
          id: userId,
        },
      });

      if (!user || user.isBanned) {
        client.disconnect(true);
        return;
      }

      client.data.userId = user.id;

      await client.join(this.callRealtimeService.userRoom(user.id));

      this.callRealtimeService.register(user.id, client.id);

      client.emit('call:connected', {
        userId: user.id,
        socketId: client.id,
      });

      this.logger.log(
        `Call socket connected user=${user.id} socket=${client.id}`,
      );
    } catch (error) {
      this.logger.warn(
        `Call socket authentication failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = this.callRealtimeService.unregister(client.id);

    if (userId) {
      this.logger.log(
        `Call socket disconnected user=${userId} socket=${client.id}`,
      );
    }
  }

  @SubscribeMessage('call:initiate')
  async initiateCall(
    @ConnectedSocket()
    client: Socket,

    @MessageBody()
    dto: InitiateCallDto,
  ) {
    const userId = client.data.userId as string | undefined;

    if (!userId) {
      return this.unauthorizedResponse();
    }

    try {
      const data = await this.callOrchestratorService.initiate(userId, dto);

      return {
        ok: true,
        data,
      };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  @SubscribeMessage('call:incoming:ack')
  async acknowledgeIncomingCall(
    @ConnectedSocket()
    client: Socket,

    @MessageBody()
    payload: CallIdPayload,
  ) {
    const userId = client.data.userId as string | undefined;

    if (!userId) {
      return this.unauthorizedResponse();
    }

    if (!this.isValidCallId(payload?.callId)) {
      return this.invalidCallIdResponse();
    }

    try {
      const callId = payload.callId.trim();

      await this.callOrchestratorService.acknowledgeIncoming(userId, callId);

      this.logger.log(
        `Incoming call acknowledged call=${callId} receiver=${userId}`,
      );

      return {
        ok: true,
        data: {
          callId,
          acknowledged: true,
        },
      };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  @SubscribeMessage('call:answer')
  async answerCall(
    @ConnectedSocket()
    client: Socket,

    @MessageBody()
    payload: CallIdPayload,
  ) {
    const userId = client.data.userId as string | undefined;

    if (!userId) {
      return this.unauthorizedResponse();
    }

    if (!this.isValidCallId(payload?.callId)) {
      return this.invalidCallIdResponse();
    }

    try {
      const data = await this.callOrchestratorService.answer(
        userId,
        payload.callId,
      );

      this.logger.log(`Call answered call=${payload.callId} user=${userId}`);

      return {
        ok: true,
        data,
      };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  @SubscribeMessage('call:reject')
  async rejectCall(
    @ConnectedSocket()
    client: Socket,

    @MessageBody()
    payload: CallIdPayload,
  ) {
    const userId = client.data.userId as string | undefined;

    if (!userId) {
      return this.unauthorizedResponse();
    }

    if (!this.isValidCallId(payload?.callId)) {
      return this.invalidCallIdResponse();
    }

    try {
      const data = await this.callOrchestratorService.reject(
        userId,
        payload.callId,
      );

      this.logger.log(`Call rejected call=${payload.callId} user=${userId}`);

      return {
        ok: true,
        data,
      };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  @SubscribeMessage('call:cancel')
  async cancelCall(
    @ConnectedSocket()
    client: Socket,

    @MessageBody()
    payload: CallIdPayload,
  ) {
    const userId = client.data.userId as string | undefined;

    if (!userId) {
      return this.unauthorizedResponse();
    }

    if (!this.isValidCallId(payload?.callId)) {
      return this.invalidCallIdResponse();
    }

    try {
      const data = await this.callOrchestratorService.cancel(
        userId,
        payload.callId,
      );

      this.logger.log(`Call cancelled call=${payload.callId} user=${userId}`);

      return {
        ok: true,
        data,
      };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  @SubscribeMessage('call:end')
  async endCall(
    @ConnectedSocket()
    client: Socket,

    @MessageBody()
    payload: CallIdPayload,
  ) {
    const userId = client.data.userId as string | undefined;

    if (!userId) {
      return this.unauthorizedResponse();
    }

    if (!this.isValidCallId(payload?.callId)) {
      return this.invalidCallIdResponse();
    }

    try {
      const data = await this.callOrchestratorService.end(
        userId,
        payload.callId,
      );

      this.logger.log(`Call ended call=${payload.callId} user=${userId}`);

      return {
        ok: true,
        data,
      };
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  private extractToken(client: Socket): string | null {
    const rawToken =
      client.handshake.auth?.token ?? client.handshake.query?.token;

    if (typeof rawToken !== 'string' || rawToken.trim().length === 0) {
      return null;
    }

    return rawToken.startsWith('Bearer ')
      ? rawToken.slice(7).trim()
      : rawToken.trim();
  }

  private isValidCallId(callId: unknown): callId is string {
    return typeof callId === 'string' && callId.trim().length > 0;
  }

  private unauthorizedResponse() {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Call socket is not authenticated',
      },
    };
  }

  private invalidCallIdResponse() {
    return {
      ok: false,
      error: {
        code: 'INVALID_CALL_ID',
        message: 'A valid callId is required',
      },
    };
  }

  private errorResponse(error: unknown) {
    return {
      ok: false,
      error: this.formatError(error),
    };
  }

  private formatError(error: unknown): {
    code: string;
    message: string;
  } {
    if (error instanceof HttpException) {
      const response = error.getResponse();

      if (typeof response === 'string') {
        return {
          code: 'CALL_ERROR',
          message: response,
        };
      }

      const body = response as {
        code?: string;
        message?: string | string[];
      };

      return {
        code: body.code ?? 'CALL_ERROR',
        message: Array.isArray(body.message)
          ? body.message.join(', ')
          : (body.message ?? error.message),
      };
    }

    return {
      code: 'INTERNAL_SERVER_ERROR',
      message: error instanceof Error ? error.message : 'Unexpected call error',
    };
  }
}
