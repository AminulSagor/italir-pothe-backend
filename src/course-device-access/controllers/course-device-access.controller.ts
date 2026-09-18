import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { UserRole } from '../../users/entities/user.entity';
import {
  AdminCourseDeviceRequestsQueryDto,
  CreateCourseDeviceChallengeDto,
  CreateCourseDeviceRequestDto,
  DecideCourseDeviceRequestDto,
  VerifyCourseDeviceDto,
} from '../dto/course-device-access.dto';
import { CourseDeviceAccessService } from '../services/course-device-access.service';

@Controller('course-device-access')
@UseGuards(JwtAuthGuard)
export class CourseDeviceAccessController {
  constructor(private readonly service: CourseDeviceAccessService) {}

  @Post('courses/:courseId/challenge')
  createChallenge(
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateCourseDeviceChallengeDto,
  ) {
    return this.service.createChallenge(this.userId(request), courseId, dto);
  }

  @Post('courses/:courseId/verify')
  verify(
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: VerifyCourseDeviceDto,
  ) {
    return this.service.verifyDevice(this.userId(request), courseId, dto);
  }

  @Post('courses/:courseId/requests')
  createRequest(
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateCourseDeviceRequestDto,
  ) {
    return this.service.createRequest(
      this.userId(request),
      courseId,
      dto.deviceKeyId,
    );
  }

  @Get('admin/requests')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findRequests(@Query() query: AdminCourseDeviceRequestsQueryDto) {
    return this.service.findAdminRequests(query);
  }

  @Post('admin/requests/:requestId/decision')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  decide(
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: DecideCourseDeviceRequestDto,
  ) {
    return this.service.decideRequest(this.userId(request), requestId, dto);
  }

  private userId(request: AuthenticatedRequest): string {
    const id = request.user?.id ?? request.user?.sub;
    if (!id) throw new UnauthorizedException('Authenticated user not found.');
    return id;
  }
}
