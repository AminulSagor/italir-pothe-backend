import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/users/entities/user.entity';
import { AdminEnrollmentQueryDto } from '../dto/admin-course-commerce.dto';
import { AdminCourseCommerceService } from '../services/admin-course-commerce.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCourseCommerceController {
  constructor(
    private readonly adminCourseCommerceService: AdminCourseCommerceService,
  ) {}

  @Get('courses/:courseId/enrollments/summary')
  async getEnrollmentSummary(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,
  ) {
    return this.adminCourseCommerceService.getEnrollmentSummary(courseId);
  }

  @Get('courses/:courseId/enrollments')
  async findCourseEnrollments(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,
    @Query() query: AdminEnrollmentQueryDto,
  ) {
    return this.adminCourseCommerceService.findCourseEnrollments(
      courseId,
      query,
    );
  }

  @Get('course-enrollments/:enrollmentId')
  async findEnrollmentById(
    @Param('enrollmentId', new ParseUUIDPipe({ version: '4' }))
    enrollmentId: string,
  ) {
    return this.adminCourseCommerceService.findEnrollmentById(enrollmentId);
  }

  @Post('course-purchases/:orderId/demo-refund')
  async demoRefund(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
  ) {
    return this.adminCourseCommerceService.demoRefund(orderId);
  }
}
