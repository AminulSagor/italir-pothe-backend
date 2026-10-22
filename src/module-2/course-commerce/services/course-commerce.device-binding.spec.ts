import { EntityManager } from 'typeorm';

import { CourseDeviceAuthorization } from '../../../course-device-access/entities/course-device-authorization.entity';
import { CourseDeviceRequest } from '../../../course-device-access/entities/course-device-request.entity';
import {
  CourseDeviceAuthorizationStatus,
  CourseDeviceRequestStatus,
} from '../../../course-device-access/enums/course-device-access.enums';
import { CourseCommerceService } from './course-commerce.service';

describe('CourseCommerceService fresh-purchase device reset', () => {
  it('removes pending requests and revokes stale bindings for the course', async () => {
    const deleteRequests = jest.fn().mockResolvedValue({ affected: 1 });
    const updateAuthorizations = jest.fn().mockResolvedValue({ affected: 2 });
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === CourseDeviceRequest) {
          return { delete: deleteRequests };
        }
        if (entity === CourseDeviceAuthorization) {
          return { update: updateAuthorizations };
        }
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    const service = Object.create(
      CourseCommerceService.prototype,
    ) as CourseCommerceService;
    const revokedAt = new Date('2026-10-22T00:00:00.000Z');

    await (
      service as unknown as {
        resetDeviceBindingsForFreshPurchase(
          manager: EntityManager,
          params: {
            userId: string;
            courseId: string;
            revokedAt: Date;
          },
        ): Promise<void>;
      }
    ).resetDeviceBindingsForFreshPurchase(manager, {
      userId: 'user-id',
      courseId: 'course-id',
      revokedAt,
    });

    expect(deleteRequests).toHaveBeenCalledWith({
      userId: 'user-id',
      courseId: 'course-id',
      status: CourseDeviceRequestStatus.PENDING,
    });
    expect(updateAuthorizations).toHaveBeenCalledWith(
      {
        userId: 'user-id',
        courseId: 'course-id',
      },
      {
        status: CourseDeviceAuthorizationStatus.REVOKED,
        revokedAt,
        accessTokenHash: null,
        accessTokenExpiresAt: null,
      },
    );
  });
});
