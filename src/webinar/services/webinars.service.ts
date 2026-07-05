import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';

import { File, FileUploadStatus } from 'src/files/entities/file.entity';
import { S3Service } from 'src/files/services/s3.service';
import { UserRole } from 'src/users/entities/user.entity';
import {
  CreateWebinarDto,
  PaginationQueryDto,
  SendWebinarChatMessageDto,
  UpdateWebinarDto,
} from '../dto/webinar.dto';
import { WebinarAudienceCourse } from '../entities/webinar-audience-course.entity';
import { WebinarChatMessage } from '../entities/webinar-chat-message.entity';
import {
  WebinarParticipant,
  WebinarParticipantSpeakingPermission,
} from '../entities/webinar-participant.entity';
import {
  WebinarSpeakerRequest,
  WebinarSpeakerRequestPermission,
} from '../entities/webinar-speaker-request.entity';
import { Webinar, WebinarStatus } from '../entities/webinar.entity';
import { WebinarGateway } from '../gateways/webinar.gateway';
import { AgoraLiveRole, AgoraTokenService } from './agora-token.service';
import { WebinarAudienceService } from './webinar-audience.service';
import { WebinarNotificationService } from './webinar-notification.service';

type WebinarUserRaw = {
  userId: string;
  fullName: string;
  role: UserRole;
  profilePhotoStorageKey: string | null;
  agoraUid?: number | string | null;
  joinedAt?: Date | string | null;
  leftAt?: Date | string | null;
  speakingPermission:
    | WebinarParticipantSpeakingPermission
    | WebinarSpeakerRequestPermission
    | null;
};

type PaginationMeta = {
  page: number;
  limit: number;
  totalPages: number;
  totalItems: number;
};

type WebinarChatMessageRaw = {
  id: string;
  webinarId: string;
  senderUserId: string;
  senderFullName: string;
  senderRole: UserRole;
  senderProfilePhotoStorageKey: string | null;
  message: string;
  isHost: boolean;
  createdAt: Date | string;
};

@Injectable()
export class WebinarsService {
  constructor(
    @InjectRepository(Webinar)
    private readonly webinarRepository: Repository<Webinar>,

    @InjectRepository(WebinarAudienceCourse)
    private readonly webinarAudienceCourseRepository: Repository<WebinarAudienceCourse>,

    @InjectRepository(WebinarParticipant)
    private readonly webinarParticipantRepository: Repository<WebinarParticipant>,

    @InjectRepository(WebinarSpeakerRequest)
    private readonly webinarSpeakerRequestRepository: Repository<WebinarSpeakerRequest>,

    @InjectRepository(WebinarChatMessage)
    private readonly webinarChatMessageRepository: Repository<WebinarChatMessage>,

    private readonly s3Service: S3Service,
    private readonly agoraTokenService: AgoraTokenService,
    private readonly webinarGateway: WebinarGateway,
    private readonly webinarAudienceService: WebinarAudienceService,
    private readonly webinarNotificationService: WebinarNotificationService,
  ) {}

  async createWebinar(dto: CreateWebinarDto, adminId: string) {
    const webinar = this.webinarRepository.create({
      title: dto.title.trim(),
      scheduledAt: this.parseIsoDateTime(dto.dateTime),
      hostTeacherName: dto.hostTeacherName.trim(),
      thumbnailImageUrl: this.normalizeNullableString(dto.thumbnailImageUrl),
      sendNotification: dto.sendNotification ?? false,
      status: dto.status ?? WebinarStatus.DRAFT,
      createdByAdminId: adminId,
      updatedByAdminId: null,
      agoraChannelName: null,
      liveStartedAt: null,
      liveEndedAt: null,
    });

    const savedWebinar = await this.webinarRepository.save(webinar);

    await this.syncAudienceCourses(savedWebinar.id, dto.courseIds);

    if (
      savedWebinar.status === WebinarStatus.SCHEDULED &&
      savedWebinar.sendNotification
    ) {
      await this.webinarNotificationService.notifyScheduled(
        savedWebinar.id,
        adminId,
      );
    }

    return {
      message: 'Webinar created successfully.',
      webinar: await this.buildWebinarResponse(savedWebinar.id),
    };
  }

  async updateWebinar(id: string, dto: UpdateWebinarDto, adminId: string) {
    const webinar = await this.findWebinarEntityById(id);
    const wasScheduled = webinar.status === WebinarStatus.SCHEDULED;
    const wasNotificationEnabled = webinar.sendNotification;

    if (dto.title !== undefined) {
      webinar.title = dto.title.trim();
    }

    if (dto.dateTime !== undefined) {
      webinar.scheduledAt = this.parseIsoDateTime(dto.dateTime);
    }

    if (dto.hostTeacherName !== undefined) {
      webinar.hostTeacherName = dto.hostTeacherName.trim();
    }

    if (dto.thumbnailImageUrl !== undefined) {
      webinar.thumbnailImageUrl = this.normalizeNullableString(
        dto.thumbnailImageUrl,
      );
    }

    if (dto.sendNotification !== undefined) {
      webinar.sendNotification = dto.sendNotification;
    }

    if (dto.status !== undefined) {
      webinar.status = dto.status;
    }

    webinar.updatedByAdminId = adminId;

    await this.webinarRepository.save(webinar);

    if (dto.courseIds !== undefined) {
      await this.syncAudienceCourses(webinar.id, dto.courseIds);
    }

    if (
      webinar.status === WebinarStatus.SCHEDULED &&
      webinar.sendNotification &&
      (!wasScheduled || !wasNotificationEnabled)
    ) {
      await this.webinarNotificationService.notifyScheduled(webinar.id, adminId);
    }

    return {
      message: 'Webinar updated successfully.',
      webinar: await this.buildWebinarResponse(webinar.id),
    };
  }

  async startWebinar(id: string, adminId: string) {
    const webinar = await this.findWebinarEntityById(id);

    webinar.status = WebinarStatus.LIVE;
    webinar.updatedByAdminId = adminId;
    webinar.agoraChannelName = this.getAgoraChannelName(webinar);
    webinar.liveStartedAt = new Date();
    webinar.liveEndedAt = null;

    await this.webinarRepository.save(webinar);

    const webinarResponse = await this.buildWebinarResponse(webinar.id);

    this.webinarGateway.emitWebinarStarted(webinar.id, {
      webinar: webinarResponse,
    });

    await this.webinarNotificationService.notifyStarted(webinar.id, adminId);

    return {
      message: 'Webinar started successfully.',
      webinar: webinarResponse,
    };
  }

  async endWebinar(id: string, adminId: string) {
    const webinar = await this.findWebinarEntityById(id);

    webinar.status = WebinarStatus.COMPLETED;
    webinar.updatedByAdminId = adminId;
    webinar.liveEndedAt = new Date();

    await this.webinarRepository.save(webinar);

    const webinarResponse = await this.buildWebinarResponse(webinar.id);

    this.webinarGateway.emitWebinarEnded(webinar.id, {
      webinar: webinarResponse,
    });

    return {
      message: 'Webinar ended successfully.',
      webinar: webinarResponse,
    };
  }

  async getHostToken(webinarId: string, adminId: string) {
    const webinar = await this.findLiveWebinarById(webinarId);
    const uid = this.createAgoraUid(webinar.id, adminId);

    return this.buildAgoraTokenResponse({
      webinar,
      uid,
      role: AgoraLiveRole.PUBLISHER,
    });
  }

  async getScreenShareToken(webinarId: string, adminId: string) {
    const webinar = await this.findLiveWebinarById(webinarId);
    const uid = this.createAgoraUid(webinar.id, `${adminId}:screen-share`);

    return this.buildAgoraTokenResponse({
      webinar,
      uid,
      role: AgoraLiveRole.PUBLISHER,
    });
  }

  async joinWebinar(webinarId: string, userId: string) {
    const webinar = await this.findLiveWebinarById(webinarId);
    await this.assertUserCanAccessWebinar(webinar.id, userId);
    const participant = await this.upsertJoinedParticipant(webinar.id, userId);
    const participantResponse = await this.findParticipantResponse(
      webinar.id,
      userId,
    );

    this.webinarGateway.emitParticipantListUpdated(webinar.id, {
      action: 'joined',
      participant: participantResponse,
    });

    return {
      message: 'Webinar joined successfully.',
      token: this.buildAgoraTokenResponse({
        webinar,
        uid: participant.agoraUid!,
        role: AgoraLiveRole.SUBSCRIBER,
      }),
      participant: participantResponse,
    };
  }

  async leaveWebinar(webinarId: string, userId: string) {
    await this.findWebinarEntityById(webinarId);

    const participant = await this.webinarParticipantRepository.findOne({
      where: {
        webinarId,
        userId,
      },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    participant.leftAt = new Date();
    await this.webinarParticipantRepository.save(participant);

    const participantResponse = await this.findParticipantResponse(
      webinarId,
      userId,
    );

    this.webinarGateway.emitParticipantListUpdated(webinarId, {
      action: 'left',
      participant: participantResponse,
    });

    return {
      message: 'Webinar left successfully.',
      participant: participantResponse,
    };
  }

  async leaveStage(webinarId: string, userId: string) {
    await this.findLiveWebinarById(webinarId);

    const participant = await this.webinarParticipantRepository.findOne({
      where: {
        webinarId,
        userId,
      },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    participant.speakingPermission = null;
    await this.webinarParticipantRepository.save(participant);

    const speakerRequest = await this.webinarSpeakerRequestRepository.findOne({
      where: {
        webinarId,
        userId,
      },
    });

    if (speakerRequest) {
      speakerRequest.speakingPermission = WebinarSpeakerRequestPermission.REJECTED;
      speakerRequest.respondedAt = new Date();
      await this.webinarSpeakerRequestRepository.save(speakerRequest);
    }

    const participantResponse = await this.findParticipantResponse(
      webinarId,
      userId,
    );

    this.webinarGateway.emitParticipantListUpdated(webinarId, {
      action: 'left_stage',
      participant: participantResponse,
    });

    return {
      message: 'Stage left successfully.',
      participant: participantResponse,
    };
  }

  async requestToSpeak(webinarId: string, userId: string) {
    await this.findLiveWebinarById(webinarId);

    const participant = await this.webinarParticipantRepository.findOne({
      where: {
        webinarId,
        userId,
      },
    });

    if (!participant) {
      throw new BadRequestException('Please join the webinar first.');
    }

    if (
      participant.speakingPermission ===
      WebinarParticipantSpeakingPermission.GRANTED
    ) {
      throw new BadRequestException('Speaker permission is already granted.');
    }

    let speakerRequest = await this.webinarSpeakerRequestRepository.findOne({
      where: {
        webinarId,
        userId,
      },
    });

    if (!speakerRequest) {
      speakerRequest = this.webinarSpeakerRequestRepository.create({
        webinarId,
        userId,
      });
    }

    speakerRequest.speakingPermission = WebinarSpeakerRequestPermission.REQUESTED;
    speakerRequest.respondedByAdminId = null;
    speakerRequest.respondedAt = null;

    await this.webinarSpeakerRequestRepository.save(speakerRequest);

    participant.speakingPermission = WebinarParticipantSpeakingPermission.REQUESTED;
    await this.webinarParticipantRepository.save(participant);

    const speakerRequestResponse = await this.findSpeakerRequestResponse(
      webinarId,
      userId,
    );

    this.webinarGateway.emitSpeakerRequestCreated(webinarId, {
      speakerRequest: speakerRequestResponse,
    });

    return {
      message: 'Speaker request submitted successfully.',
      speakerRequest: speakerRequestResponse,
    };
  }

  async getSpeakerToken(webinarId: string, userId: string) {
    const webinar = await this.findLiveWebinarById(webinarId);

    const participant = await this.webinarParticipantRepository.findOne({
      where: {
        webinarId,
        userId,
      },
    });

    if (!participant) {
      throw new BadRequestException('Please join the webinar first.');
    }

    if (
      participant.speakingPermission !==
      WebinarParticipantSpeakingPermission.GRANTED
    ) {
      throw new BadRequestException('Speaker permission has not been granted.');
    }

    if (!participant.agoraUid) {
      participant.agoraUid = await this.getAvailableAgoraUid(webinarId, userId);
      await this.webinarParticipantRepository.save(participant);
    }

    return {
      message: 'Speaker token generated successfully.',
      token: this.buildAgoraTokenResponse({
        webinar,
        uid: participant.agoraUid,
        role: AgoraLiveRole.PUBLISHER,
      }),
    };
  }

  async getParticipantsList(webinarId: string, query: PaginationQueryDto) {
    await this.findWebinarEntityById(webinarId);

    const pagination = this.normalizePagination(query);

    const baseQuery = this.webinarParticipantRepository
      .createQueryBuilder('participant')
      .innerJoin('participant.user', 'participantUser')
      .leftJoin(
        File,
        'profileFile',
        'profileFile.id = participantUser.profilePhotoFileId AND profileFile.uploadStatus = :uploadStatus',
        { uploadStatus: FileUploadStatus.UPLOADED },
      )
      .where('participant.webinarId = :webinarId', { webinarId });

    const totalItems = await baseQuery.clone().getCount();

    const participants = await baseQuery
      .clone()
      .select([
        'participantUser.id AS "userId"',
        'participantUser.fullName AS "fullName"',
        'participantUser.role AS "role"',
        'profileFile.storageKey AS "profilePhotoStorageKey"',
        'participant.agoraUid AS "agoraUid"',
        'participant.joinedAt AS "joinedAt"',
        'participant.leftAt AS "leftAt"',
        'participant.speakingPermission AS "speakingPermission"',
      ])
      .orderBy('participant.joinedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('participant.createdAt', 'DESC')
      .skip((pagination.page - 1) * pagination.limit)
      .take(pagination.limit)
      .getRawMany<WebinarUserRaw>();

    return {
      webinarId,
      participants: participants.map((participant) =>
        this.mapWebinarUserResponse(participant),
      ),
      pagination: this.buildPaginationMeta(totalItems, pagination),
    };
  }

  async getSpeakerRequest(webinarId: string, query: PaginationQueryDto) {
    await this.findWebinarEntityById(webinarId);

    const pagination = this.normalizePagination(query);

    const baseQuery = this.webinarSpeakerRequestRepository
      .createQueryBuilder('speakerRequest')
      .innerJoin('speakerRequest.user', 'requestUser')
      .leftJoin(
        File,
        'profileFile',
        'profileFile.id = requestUser.profilePhotoFileId AND profileFile.uploadStatus = :uploadStatus',
        { uploadStatus: FileUploadStatus.UPLOADED },
      )
      .where('speakerRequest.webinarId = :webinarId', { webinarId })
      .andWhere('speakerRequest.speakingPermission = :speakingPermission', {
        speakingPermission: WebinarSpeakerRequestPermission.REQUESTED,
      });

    const totalItems = await baseQuery.clone().getCount();

    const speakerRequests = await baseQuery
      .clone()
      .select([
        'requestUser.id AS "userId"',
        'requestUser.fullName AS "fullName"',
        'requestUser.role AS "role"',
        'profileFile.storageKey AS "profilePhotoStorageKey"',
        'speakerRequest.speakingPermission AS "speakingPermission"',
      ])
      .orderBy('speakerRequest.createdAt', 'ASC')
      .skip((pagination.page - 1) * pagination.limit)
      .take(pagination.limit)
      .getRawMany<WebinarUserRaw>();

    return {
      webinarId,
      speakerRequests: speakerRequests.map((speakerRequest) =>
        this.mapWebinarUserResponse(speakerRequest),
      ),
      pagination: this.buildPaginationMeta(totalItems, pagination),
    };
  }

  async getNextHomeWebinar() {
    const webinar = await this.webinarRepository.findOne({
      where: { status: WebinarStatus.SCHEDULED },
      order: { scheduledAt: 'ASC', createdAt: 'DESC' },
    });

    if (!webinar) return null;

    return {
      id: webinar.id,
      title: webinar.title,
      dateTime: webinar.scheduledAt,
      hostTeacherName: webinar.hostTeacherName,
    };
  }

  async getUpcomingWebinarsList(
    userId: string,
    query: PaginationQueryDto,
  ) {
    return this.getWebinarsListByStatus({
      status: WebinarStatus.SCHEDULED,
      query,
      userId,
    });
  }

  async getLiveWebinarsList(userId: string, query: PaginationQueryDto) {
    return this.getWebinarsListByStatus({
      status: WebinarStatus.LIVE,
      query,
      userId,
    });
  }

  async getAdminUpcomingWebinarsList(
    adminId: string,
    query: PaginationQueryDto,
  ) {
    return this.getWebinarsListByStatus({
      status: WebinarStatus.SCHEDULED,
      query,
      adminId,
    });
  }

  async getAdminDraftWebinarsList(adminId: string, query: PaginationQueryDto) {
    return this.getWebinarsListByStatus({
      status: WebinarStatus.DRAFT,
      query,
      adminId,
    });
  }

  async getAdminLiveWebinarsList(adminId: string, query: PaginationQueryDto) {
    return this.getWebinarsListByStatus({
      status: WebinarStatus.LIVE,
      query,
      adminId,
    });
  }

  async approveSpeakerRequest(webinarId: string, userId: string, adminId: string) {
    return this.updateSpeakerRequestPermission({
      webinarId,
      userId,
      adminId,
      speakerRequestPermission: WebinarSpeakerRequestPermission.GRANTED,
      participantPermission: WebinarParticipantSpeakingPermission.GRANTED,
      successMessage: 'Speaker permission approved successfully.',
    });
  }

  async rejectSpeakerRequest(webinarId: string, userId: string, adminId: string) {
    return this.updateSpeakerRequestPermission({
      webinarId,
      userId,
      adminId,
      speakerRequestPermission: WebinarSpeakerRequestPermission.REJECTED,
      participantPermission: WebinarParticipantSpeakingPermission.REJECTED,
      successMessage: 'Speaker permission rejected successfully.',
    });
  }

  async getChatMessages(webinarId: string, query: PaginationQueryDto) {
    await this.findLiveWebinarById(webinarId);

    const pagination = this.normalizePagination(query);
    const baseQuery = this.webinarChatMessageRepository
      .createQueryBuilder('chatMessage')
      .innerJoin('chatMessage.sender', 'senderUser')
      .leftJoin(
        File,
        'profileFile',
        'profileFile.id = senderUser.profilePhotoFileId AND profileFile.uploadStatus = :uploadStatus',
        { uploadStatus: FileUploadStatus.UPLOADED },
      )
      .where('chatMessage.webinarId = :webinarId', { webinarId });

    const totalItems = await baseQuery.clone().getCount();

    const chatMessages = await baseQuery
      .clone()
      .select([
        'chatMessage.id AS "id"',
        'chatMessage.webinarId AS "webinarId"',
        'chatMessage.senderUserId AS "senderUserId"',
        'senderUser.fullName AS "senderFullName"',
        'senderUser.role AS "senderRole"',
        'profileFile.storageKey AS "senderProfilePhotoStorageKey"',
        'chatMessage.message AS "message"',
        'chatMessage.isHost AS "isHost"',
        'chatMessage.createdAt AS "createdAt"',
      ])
      .orderBy('chatMessage.createdAt', 'DESC')
      .skip((pagination.page - 1) * pagination.limit)
      .take(pagination.limit)
      .getRawMany<WebinarChatMessageRaw>();

    return {
      webinarId,
      chatMessages: chatMessages
        .map((chatMessage) => this.mapChatMessageResponse(chatMessage))
        .reverse(),
      pagination: this.buildPaginationMeta(totalItems, pagination),
    };
  }

  async sendChatMessage(
    webinarId: string,
    userId: string,
    userRole: UserRole | string | undefined,
    dto: SendWebinarChatMessageDto,
  ) {
    const webinar = await this.findLiveWebinarById(webinarId);
    const isHost = userRole === UserRole.ADMIN && webinar.createdByAdminId === userId;

    if (!isHost) {
      const participant = await this.webinarParticipantRepository.findOne({
        where: {
          webinarId,
          userId,
        },
      });

      if (!participant || participant.leftAt) {
        throw new BadRequestException('Please join the live webinar before chatting.');
      }
    }

    const chatMessage = this.webinarChatMessageRepository.create({
      webinarId,
      senderUserId: userId,
      message: dto.message.trim(),
      isHost,
    });

    const savedChatMessage = await this.webinarChatMessageRepository.save(chatMessage);
    const chatMessageResponse = await this.findChatMessageResponse(savedChatMessage.id);

    this.webinarGateway.emitChatMessageCreated(webinarId, {
      chatMessage: chatMessageResponse,
    });

    return {
      message: 'Chat message sent successfully.',
      chatMessage: chatMessageResponse,
    };
  }

  async deleteWebinar(id: string) {
    const webinar = await this.findWebinarEntityById(id);

    await this.webinarRepository.remove(webinar);

    return {
      message: 'Webinar deleted successfully.',
      webinarId: id,
    };
  }

  private async getWebinarsListByStatus(params: {
    status: WebinarStatus;
    query: PaginationQueryDto;
    adminId?: string;
    userId?: string;
  }) {
    const pagination = this.normalizePagination(params.query);

    const where = params.adminId
      ? {
          status: params.status,
          createdByAdminId: params.adminId,
        }
      : {
          status: params.status,
        };

    const [webinars, totalItems] = await this.webinarRepository.findAndCount({
      where,
      relations: ['audienceCourses'],
      order: {
        scheduledAt: 'ASC',
        createdAt: 'DESC',
      },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    });

    const audienceCourseIds = Array.from(
      new Set(
        webinars.flatMap((webinar) =>
          (webinar.audienceCourses ?? []).map(
            (audienceCourse) => audienceCourse.courseId,
          ),
        ),
      ),
    );
    const courseTitleMap =
      await this.webinarAudienceService.getCourseTitleMap(audienceCourseIds);
    const enrolledCourseIds = params.userId
      ? await this.webinarAudienceService.getUserEnrolledCourseIds(
          params.userId,
          audienceCourseIds,
        )
      : new Set<string>();

    return {
      webinars: webinars.map((webinar) => {
        const courseIds = this.getWebinarCourseIds(webinar);

        return this.mapWebinarResponse(webinar, {
          courseTitleMap,
          isEligible: params.userId
            ? this.webinarAudienceService.isEligible(
                courseIds,
                enrolledCourseIds,
              )
            : true,
        });
      }),
      pagination: this.buildPaginationMeta(totalItems, pagination),
    };
  }

  private async updateSpeakerRequestPermission(params: {
    webinarId: string;
    userId: string;
    adminId: string;
    speakerRequestPermission: WebinarSpeakerRequestPermission;
    participantPermission: WebinarParticipantSpeakingPermission;
    successMessage: string;
  }) {
    await this.findWebinarEntityById(params.webinarId);

    const speakerRequest = await this.webinarSpeakerRequestRepository.findOne({
      where: {
        webinarId: params.webinarId,
        userId: params.userId,
      },
    });

    if (!speakerRequest) {
      throw new NotFoundException('Speaker request not found');
    }

    speakerRequest.speakingPermission = params.speakerRequestPermission;
    speakerRequest.respondedByAdminId = params.adminId;
    speakerRequest.respondedAt = new Date();
    await this.webinarSpeakerRequestRepository.save(speakerRequest);

    await this.upsertParticipantSpeakingPermission(
      params.webinarId,
      params.userId,
      params.participantPermission,
    );

    const participantResponse = await this.findParticipantResponse(
      params.webinarId,
      params.userId,
    );

    if (
      params.speakerRequestPermission === WebinarSpeakerRequestPermission.GRANTED
    ) {
      this.webinarGateway.emitSpeakerRequestApproved(params.webinarId, {
        participant: participantResponse,
      });
    } else {
      this.webinarGateway.emitSpeakerRequestRejected(params.webinarId, {
        participant: participantResponse,
      });
    }

    return {
      message: params.successMessage,
      participant: participantResponse,
    };
  }

  private async upsertJoinedParticipant(
    webinarId: string,
    userId: string,
  ): Promise<WebinarParticipant> {
    let participant = await this.webinarParticipantRepository.findOne({
      where: {
        webinarId,
        userId,
      },
    });

    if (!participant) {
      participant = this.webinarParticipantRepository.create({
        webinarId,
        userId,
        speakingPermission: null,
      });
    }

    if (!participant.agoraUid) {
      participant.agoraUid = await this.getAvailableAgoraUid(webinarId, userId);
    }

    participant.joinedAt = new Date();
    participant.leftAt = null;

    return this.webinarParticipantRepository.save(participant);
  }

  private async upsertParticipantSpeakingPermission(
    webinarId: string,
    userId: string,
    speakingPermission: WebinarParticipantSpeakingPermission,
  ): Promise<void> {
    let participant = await this.webinarParticipantRepository.findOne({
      where: {
        webinarId,
        userId,
      },
    });

    if (!participant) {
      participant = this.webinarParticipantRepository.create({
        webinarId,
        userId,
        agoraUid: await this.getAvailableAgoraUid(webinarId, userId),
        joinedAt: new Date(),
        leftAt: null,
      });
    }

    participant.speakingPermission = speakingPermission;

    await this.webinarParticipantRepository.save(participant);
  }

  private async findParticipantResponse(webinarId: string, userId: string) {
    const participant = await this.webinarParticipantRepository
      .createQueryBuilder('participant')
      .innerJoin('participant.user', 'participantUser')
      .leftJoin(
        File,
        'profileFile',
        'profileFile.id = participantUser.profilePhotoFileId AND profileFile.uploadStatus = :uploadStatus',
        { uploadStatus: FileUploadStatus.UPLOADED },
      )
      .where('participant.webinarId = :webinarId', { webinarId })
      .andWhere('participant.userId = :userId', { userId })
      .select([
        'participantUser.id AS "userId"',
        'participantUser.fullName AS "fullName"',
        'participantUser.role AS "role"',
        'profileFile.storageKey AS "profilePhotoStorageKey"',
        'participant.agoraUid AS "agoraUid"',
        'participant.joinedAt AS "joinedAt"',
        'participant.leftAt AS "leftAt"',
        'participant.speakingPermission AS "speakingPermission"',
      ])
      .getRawOne<WebinarUserRaw>();

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    return this.mapWebinarUserResponse(participant);
  }

  private async findSpeakerRequestResponse(webinarId: string, userId: string) {
    const speakerRequest = await this.webinarSpeakerRequestRepository
      .createQueryBuilder('speakerRequest')
      .innerJoin('speakerRequest.user', 'requestUser')
      .leftJoin(
        File,
        'profileFile',
        'profileFile.id = requestUser.profilePhotoFileId AND profileFile.uploadStatus = :uploadStatus',
        { uploadStatus: FileUploadStatus.UPLOADED },
      )
      .where('speakerRequest.webinarId = :webinarId', { webinarId })
      .andWhere('speakerRequest.userId = :userId', { userId })
      .select([
        'requestUser.id AS "userId"',
        'requestUser.fullName AS "fullName"',
        'requestUser.role AS "role"',
        'profileFile.storageKey AS "profilePhotoStorageKey"',
        'speakerRequest.speakingPermission AS "speakingPermission"',
      ])
      .getRawOne<WebinarUserRaw>();

    if (!speakerRequest) {
      throw new NotFoundException('Speaker request not found');
    }

    return this.mapWebinarUserResponse(speakerRequest);
  }

  private async findChatMessageResponse(chatMessageId: string) {
    const chatMessage = await this.webinarChatMessageRepository
      .createQueryBuilder('chatMessage')
      .innerJoin('chatMessage.sender', 'senderUser')
      .leftJoin(
        File,
        'profileFile',
        'profileFile.id = senderUser.profilePhotoFileId AND profileFile.uploadStatus = :uploadStatus',
        { uploadStatus: FileUploadStatus.UPLOADED },
      )
      .where('chatMessage.id = :chatMessageId', { chatMessageId })
      .select([
        'chatMessage.id AS "id"',
        'chatMessage.webinarId AS "webinarId"',
        'chatMessage.senderUserId AS "senderUserId"',
        'senderUser.fullName AS "senderFullName"',
        'senderUser.role AS "senderRole"',
        'profileFile.storageKey AS "senderProfilePhotoStorageKey"',
        'chatMessage.message AS "message"',
        'chatMessage.isHost AS "isHost"',
        'chatMessage.createdAt AS "createdAt"',
      ])
      .getRawOne<WebinarChatMessageRaw>();

    if (!chatMessage) {
      throw new NotFoundException('Chat message not found');
    }

    return this.mapChatMessageResponse(chatMessage);
  }

  private async findWebinarEntityById(id: string): Promise<Webinar> {
    const webinar = await this.webinarRepository.findOne({
      where: {
        id,
      },
    });

    if (!webinar) {
      throw new NotFoundException('Webinar not found');
    }

    return webinar;
  }

  private async findLiveWebinarById(id: string): Promise<Webinar> {
    const webinar = await this.findWebinarEntityById(id);

    if (webinar.status !== WebinarStatus.LIVE) {
      throw new BadRequestException('Webinar is not live.');
    }

    if (!webinar.agoraChannelName) {
      webinar.agoraChannelName = this.getAgoraChannelName(webinar);
      await this.webinarRepository.save(webinar);
    }

    return webinar;
  }

  private async buildWebinarResponse(id: string) {
    const webinar = await this.webinarRepository.findOne({
      where: {
        id,
      },
      relations: ['audienceCourses'],
    });

    if (!webinar) {
      throw new NotFoundException('Webinar not found');
    }

    const courseIds = this.getWebinarCourseIds(webinar);
    const courseTitleMap =
      await this.webinarAudienceService.getCourseTitleMap(courseIds);

    return this.mapWebinarResponse(webinar, {
      courseTitleMap,
      isEligible: true,
    });
  }

  private mapWebinarResponse(
    webinar: Webinar,
    options: {
      courseTitleMap: ReadonlyMap<string, string>;
      isEligible: boolean;
    },
  ) {
    const courseIds = this.getWebinarCourseIds(webinar);
    const courseNames = courseIds
      .map((courseId) => options.courseTitleMap.get(courseId))
      .filter((courseName): courseName is string => Boolean(courseName));

    return {
      id: webinar.id,
      title: webinar.title,
      dateTime: webinar.scheduledAt.toISOString(),
      hostTeacherName: webinar.hostTeacherName,
      thumbnailImageUrl: webinar.thumbnailImageUrl,
      sendNotification: webinar.sendNotification,
      status: webinar.status,
      agoraChannelName: webinar.agoraChannelName,
      liveStartedAt: webinar.liveStartedAt,
      liveEndedAt: webinar.liveEndedAt,
      audienceSettings: {
        isForAllUsers: courseIds.length === 0,
        courseIds,
        courseNames,
      },
      isEligible: options.isEligible,
      createdByAdminId: webinar.createdByAdminId,
      updatedByAdminId: webinar.updatedByAdminId,
      createdAt: webinar.createdAt,
      updatedAt: webinar.updatedAt,
    };
  }

  private async syncAudienceCourses(
    webinarId: string,
    courseIds?: string[] | null,
  ): Promise<void> {
    const normalizedCourseIds = this.normalizeCourseIds(courseIds);
    await this.webinarAudienceService.validateCourseIds(normalizedCourseIds);

    await this.webinarAudienceCourseRepository.delete({ webinarId });

    if (normalizedCourseIds.length === 0) {
      return;
    }

    const audienceCourses = normalizedCourseIds.map((courseId) =>
      this.webinarAudienceCourseRepository.create({
        webinarId,
        courseId,
      }),
    );

    await this.webinarAudienceCourseRepository.save(audienceCourses);
  }

  private normalizeCourseIds(courseIds?: string[] | null): string[] {
    if (!courseIds) {
      return [];
    }

    const normalizedCourseIds = courseIds
      .map((courseId) => courseId.trim())
      .filter((courseId) => courseId.length > 0);

    if (normalizedCourseIds.length !== courseIds.length) {
      throw new BadRequestException('Course id cannot be empty.');
    }

    return [...new Set(normalizedCourseIds)];
  }

  private getWebinarCourseIds(webinar: Webinar): string[] {
    return (webinar.audienceCourses ?? [])
      .map((audienceCourse) => audienceCourse.courseId)
      .sort((firstCourseId, secondCourseId) =>
        firstCourseId.localeCompare(secondCourseId),
      );
  }

  private async assertUserCanAccessWebinar(
    webinarId: string,
    userId: string,
  ): Promise<void> {
    const audienceCourses =
      await this.webinarAudienceCourseRepository.find({
        where: { webinarId },
      });
    const courseIds = audienceCourses.map(
      (audienceCourse) => audienceCourse.courseId,
    );

    if (courseIds.length === 0) {
      return;
    }

    const enrolledCourseIds =
      await this.webinarAudienceService.getUserEnrolledCourseIds(
        userId,
        courseIds,
      );

    if (
      this.webinarAudienceService.isEligible(courseIds, enrolledCourseIds)
    ) {
      return;
    }

    const courseTitleMap =
      await this.webinarAudienceService.getCourseTitleMap(courseIds);
    const courseNames = courseIds
      .map((courseId) => courseTitleMap.get(courseId))
      .filter((courseName): courseName is string => Boolean(courseName));

    throw new ForbiddenException(
      courseNames.length > 0
        ? `This webinar is available only to users enrolled in: ${courseNames.join(', ')}.`
        : 'This webinar is available only to selected course members.',
    );
  }

  private normalizeNullableString(value?: string | null): string | null {
    const normalizedValue = value?.trim();

    return normalizedValue && normalizedValue.length > 0 ? normalizedValue : null;
  }

  private parseIsoDateTime(dateTime: string): Date {
    const date = new Date(dateTime.trim());

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid webinar date time.');
    }

    return date;
  }

  private normalizePagination(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    return {
      page,
      limit,
    };
  }

  private buildPaginationMeta(
    totalItems: number,
    pagination: { page: number; limit: number },
  ): PaginationMeta {
    return {
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(totalItems / pagination.limit),
      totalItems,
    };
  }

  private mapChatMessageResponse(chatMessage: WebinarChatMessageRaw) {
    return {
      id: chatMessage.id,
      webinarId: chatMessage.webinarId,
      senderUserId: chatMessage.senderUserId,
      senderFullName: chatMessage.senderFullName,
      senderRole: chatMessage.senderRole,
      senderProfilePhoto: chatMessage.senderProfilePhotoStorageKey
        ? this.s3Service.createPublicUrl(chatMessage.senderProfilePhotoStorageKey)
        : null,
      message: chatMessage.message,
      isHost: chatMessage.isHost,
      createdAt: chatMessage.createdAt,
    };
  }

  private mapWebinarUserResponse(webinarUser: WebinarUserRaw) {
    return {
      userId: webinarUser.userId,
      fullName: webinarUser.fullName,
      profilePhoto: webinarUser.profilePhotoStorageKey
        ? this.s3Service.createPublicUrl(webinarUser.profilePhotoStorageKey)
        : null,
      role: webinarUser.role,
      agoraUid:
        webinarUser.agoraUid === null || webinarUser.agoraUid === undefined
          ? null
          : Number(webinarUser.agoraUid),
      joinedAt: webinarUser.joinedAt ?? null,
      leftAt: webinarUser.leftAt ?? null,
      speakingPermission: webinarUser.speakingPermission,
    };
  }

  private buildAgoraTokenResponse(params: {
    webinar: Webinar;
    uid: number;
    role: AgoraLiveRole;
  }) {
    return this.agoraTokenService.buildRtcToken({
      channelName: this.getAgoraChannelName(params.webinar),
      uid: params.uid,
      role: params.role,
    });
  }

  private getAgoraChannelName(webinar: Webinar): string {
    return webinar.agoraChannelName ?? `webinar_${webinar.id}`;
  }

  private async getAvailableAgoraUid(
    webinarId: string,
    userId: string,
  ): Promise<number> {
    const baseUid = this.createAgoraUid(webinarId, userId);
    let uid = baseUid;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const existingParticipant = await this.webinarParticipantRepository.findOne({
        where: {
          webinarId,
          agoraUid: uid,
        },
      });

      if (!existingParticipant || existingParticipant.userId === userId) {
        return uid;
      }

      uid = this.nextAgoraUid(baseUid, attempt + 1);
    }

    throw new BadRequestException('Could not generate a unique Agora uid.');
  }

  private createAgoraUid(webinarId: string, userId: string): number {
    const hash = createHash('sha256')
      .update(`${webinarId}:${userId}`)
      .digest();
    const value = hash.readUInt32BE(0);

    return (value % 2147483646) + 1;
  }

  private nextAgoraUid(baseUid: number, attempt: number): number {
    return ((baseUid + attempt) % 2147483646) + 1;
  }
}
