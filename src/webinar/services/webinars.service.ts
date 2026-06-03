import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { File, FileUploadStatus } from 'src/files/entities/file.entity';
import { S3Service } from 'src/files/services/s3.service';
import { UserRole } from 'src/users/entities/user.entity';
import {
  CreateWebinarDto,
  PaginationQueryDto,
  UpdateWebinarDto,
} from '../dto/webinar.dto';
import { WebinarAudienceCourse } from '../entities/webinar-audience-course.entity';
import {
  WebinarParticipant,
  WebinarParticipantSpeakingPermission,
} from '../entities/webinar-participant.entity';
import {
  WebinarSpeakerRequest,
  WebinarSpeakerRequestPermission,
} from '../entities/webinar-speaker-request.entity';
import { Webinar, WebinarStatus } from '../entities/webinar.entity';

type WebinarUserRaw = {
  userId: string;
  role: UserRole;
  profilePhotoStorageKey: string | null;
  speakingPermission:
    | WebinarParticipantSpeakingPermission
    | WebinarSpeakerRequestPermission;
};

type PaginationMeta = {
  page: number;
  limit: number;
  totalPages: number;
  totalItems: number;
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

    private readonly s3Service: S3Service,
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
    });

    const savedWebinar = await this.webinarRepository.save(webinar);

    await this.syncAudienceCourses(savedWebinar.id, dto.courseIds);

    return {
      message: 'Webinar created successfully.',
      webinar: await this.buildWebinarResponse(savedWebinar.id),
    };
  }

  async updateWebinar(id: string, dto: UpdateWebinarDto, adminId: string) {
    const webinar = await this.findWebinarEntityById(id);

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

    return {
      message: 'Webinar updated successfully.',
      webinar: await this.buildWebinarResponse(webinar.id),
    };
  }

  async startWebinar(id: string, adminId: string) {
    return this.updateWebinarStatus(
      id,
      WebinarStatus.LIVE,
      adminId,
      'Webinar started successfully.',
    );
  }

  async endWebinar(id: string, adminId: string) {
    return this.updateWebinarStatus(
      id,
      WebinarStatus.COMPLETED,
      adminId,
      'Webinar ended successfully.',
    );
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
      .where('participant.webinarId = :webinarId', { webinarId })
      .andWhere('participant.speakingPermission IN (:...permissions)', {
        permissions: Object.values(WebinarParticipantSpeakingPermission),
      });

    const totalItems = await baseQuery.clone().getCount();

    const participants = await baseQuery
      .clone()
      .select([
        'participantUser.id AS "userId"',
        'participantUser.role AS "role"',
        'profileFile.storageKey AS "profilePhotoStorageKey"',
        'participant.speakingPermission AS "speakingPermission"',
      ])
      .orderBy('participant.createdAt', 'ASC')
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

  async getUpcomingWebinarsList(query: PaginationQueryDto) {
    return this.getWebinarsListByStatus({
      status: WebinarStatus.SCHEDULED,
      query,
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

  async approveSpeakerRequest(webinarId: string, userId: string) {
    return this.updateSpeakerRequestPermission({
      webinarId,
      userId,
      speakerRequestPermission: WebinarSpeakerRequestPermission.GRANTED,
      participantPermission: WebinarParticipantSpeakingPermission.GRANTED,
      successMessage: 'Speaker permission approved successfully.',
    });
  }

  async rejectSpeakerRequest(webinarId: string, userId: string) {
    return this.updateSpeakerRequestPermission({
      webinarId,
      userId,
      speakerRequestPermission: WebinarSpeakerRequestPermission.REJECTED,
      participantPermission: WebinarParticipantSpeakingPermission.REJECTED,
      successMessage: 'Speaker permission rejected successfully.',
    });
  }

  async deleteWebinar(id: string) {
    const webinar = await this.findWebinarEntityById(id);

    await this.webinarRepository.remove(webinar);

    return {
      message: 'Webinar deleted successfully.',
      webinarId: id,
    };
  }

  private async updateWebinarStatus(
    id: string,
    status: WebinarStatus,
    adminId: string,
    successMessage: string,
  ) {
    const webinar = await this.findWebinarEntityById(id);

    webinar.status = status;
    webinar.updatedByAdminId = adminId;

    await this.webinarRepository.save(webinar);

    return {
      message: successMessage,
      webinar: await this.buildWebinarResponse(webinar.id),
    };
  }

  private async getWebinarsListByStatus(params: {
    status: WebinarStatus;
    query: PaginationQueryDto;
    adminId?: string;
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

    return {
      webinars: webinars.map((webinar) => this.mapWebinarResponse(webinar)),
      pagination: this.buildPaginationMeta(totalItems, pagination),
    };
  }

  private async updateSpeakerRequestPermission(params: {
    webinarId: string;
    userId: string;
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
    await this.webinarSpeakerRequestRepository.save(speakerRequest);

    await this.upsertParticipantSpeakingPermission(
      params.webinarId,
      params.userId,
      params.participantPermission,
    );

    return {
      message: params.successMessage,
      participant: await this.findParticipantResponse(
        params.webinarId,
        params.userId,
      ),
    };
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
        'participantUser.role AS "role"',
        'profileFile.storageKey AS "profilePhotoStorageKey"',
        'participant.speakingPermission AS "speakingPermission"',
      ])
      .getRawOne<WebinarUserRaw>();

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    return this.mapWebinarUserResponse(participant);
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

    return this.mapWebinarResponse(webinar);
  }

  private mapWebinarResponse(webinar: Webinar) {
    const courseIds = (webinar.audienceCourses ?? [])
      .map((audienceCourse) => audienceCourse.courseId)
      .sort((firstCourseId, secondCourseId) =>
        firstCourseId.localeCompare(secondCourseId),
      );

    return {
      id: webinar.id,
      title: webinar.title,
      dateTime: webinar.scheduledAt.toISOString(),
      hostTeacherName: webinar.hostTeacherName,
      thumbnailImageUrl: webinar.thumbnailImageUrl,
      sendNotification: webinar.sendNotification,
      status: webinar.status,
      audienceSettings: {
        isForAllUsers: courseIds.length === 0,
        courseIds,
      },
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

  private mapWebinarUserResponse(webinarUser: WebinarUserRaw) {
    return {
      userId: webinarUser.userId,
      profilePhoto: webinarUser.profilePhotoStorageKey
        ? this.s3Service.createPublicUrl(webinarUser.profilePhotoStorageKey)
        : null,
      role: webinarUser.role,
      speakingPermission: webinarUser.speakingPermission,
    };
  }
}
