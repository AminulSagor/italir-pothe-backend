import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { CertificateQueryDto } from '../dto/certificate-query.dto';
import { RevokeCertificateDto } from '../dto/revoke-certificate.dto';
import { Certificate, CertificateStatus } from '../entities/certificate.entity';

export interface IssueCertificatePayload {
  userId: string;
  courseId: string;
  examAttemptId: string;
  pdfFileId?: string | null;
}

@Injectable()
export class CertificatesService {
  constructor(
    @InjectRepository(Certificate)
    private readonly certificateRepository: Repository<Certificate>,
  ) {}

  async issueCertificate(payload: IssueCertificatePayload) {
    const existingCertificate = await this.certificateRepository.findOne({
      where: { examAttemptId: payload.examAttemptId },
    });

    if (existingCertificate) {
      throw new BadRequestException(
        'Certificate already issued for this exam attempt',
      );
    }

    const certificate = this.certificateRepository.create({
      userId: payload.userId,
      courseId: payload.courseId,
      examAttemptId: payload.examAttemptId,
      certificateNumber: this.generateCertificateNumber(),
      pdfFileId: payload.pdfFileId ?? null,
      status: CertificateStatus.ISSUED,
      issuedAt: new Date(),
      revokedAt: null,
    });

    return this.certificateRepository.save(certificate);
  }

  async findAll(query: CertificateQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    const where: FindOptionsWhere<Certificate> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.courseId) {
      where.courseId = query.courseId;
    }

    const queryBuilder = this.certificateRepository
      .createQueryBuilder('certificate')
      .leftJoinAndSelect('certificate.user', 'user')
      .leftJoinAndSelect('certificate.course', 'course')
      .leftJoinAndSelect('certificate.examAttempt', 'examAttempt')
      .leftJoinAndSelect('certificate.pdfFile', 'pdfFile')
      .where(where)
      .orderBy('certificate.issuedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search) {
      queryBuilder.andWhere(
        `(
          LOWER(certificate.certificateNumber) LIKE :search OR
          LOWER(user.fullName) LIKE :search OR
          LOWER(user.email) LIKE :search
        )`,
        {
          search: `%${query.search.toLowerCase()}%`,
        },
      );
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const certificate = await this.certificateRepository.findOne({
      where: { id },
      relations: {
        user: true,
        course: true,
        examAttempt: true,
        pdfFile: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return certificate;
  }

  async findOwnedCertificate(id: string, userId: string) {
    const certificate = await this.findById(id);

    if (certificate.userId !== userId) {
      throw new ForbiddenException(
        'You are not allowed to access this certificate',
      );
    }

    return certificate;
  }

  async findByAttemptId(examAttemptId: string) {
    const certificate = await this.certificateRepository.findOne({
      where: { examAttemptId },
      relations: {
        user: true,
        course: true,
        examAttempt: true,
        pdfFile: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return certificate;
  }

  async findByUser(userId: string) {
    return this.certificateRepository.find({
      where: {
        userId,
        status: CertificateStatus.ISSUED,
      },
      relations: {
        course: true,
        examAttempt: true,
        pdfFile: true,
      },
      order: {
        issuedAt: 'DESC',
      },
    });
  }

  async verifyCertificate(certificateNumber: string) {
    const certificate = await this.certificateRepository.findOne({
      where: { certificateNumber },
      relations: {
        user: true,
        course: true,
        examAttempt: true,
        pdfFile: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return {
      isValid: certificate.status === CertificateStatus.ISSUED,
      certificate,
    };
  }

  async revokeCertificate(id: string, _dto?: RevokeCertificateDto) {
    const certificate = await this.certificateRepository.findOne({
      where: { id },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    if (certificate.status === CertificateStatus.REVOKED) {
      throw new BadRequestException('Certificate already revoked');
    }

    certificate.status = CertificateStatus.REVOKED;
    certificate.revokedAt = new Date();

    return this.certificateRepository.save(certificate);
  }

  private generateCertificateNumber() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();

    return `CERT-${timestamp}-${random}`;
  }
}
