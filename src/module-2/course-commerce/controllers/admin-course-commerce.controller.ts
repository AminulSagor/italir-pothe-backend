import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/users/entities/user.entity';
import {
  AdminEnrollmentQueryDto,
  CreateCourseProviderProductDto,
  UpdateCourseProviderProductDto,
} from '../dto/admin-course-commerce.dto';
import { AdminCourseCommerceService } from '../services/admin-course-commerce.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCourseCommerceController {
  constructor(
    private readonly adminCourseCommerceService: AdminCourseCommerceService,
  ) {}

  @Post('courses/:courseId/provider-products')
  async createProviderProduct(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,
    @Body() dto: CreateCourseProviderProductDto,
  ) {
    return this.adminCourseCommerceService.createProviderProduct(courseId, dto);
  }

  @Get('courses/:courseId/provider-products')
  async findProviderProducts(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,
  ) {
    return this.adminCourseCommerceService.findProviderProducts(courseId);
  }

  @Patch('courses/:courseId/provider-products/:mappingId')
  async updateProviderProduct(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,
    @Param('mappingId', new ParseUUIDPipe({ version: '4' }))
    mappingId: string,
    @Body() dto: UpdateCourseProviderProductDto,
  ) {
    return this.adminCourseCommerceService.updateProviderProduct(
      courseId,
      mappingId,
      dto,
    );
  }

  @Delete('courses/:courseId/provider-products/:mappingId')
  async deactivateProviderProduct(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,
    @Param('mappingId', new ParseUUIDPipe({ version: '4' }))
    mappingId: string,
  ) {
    return this.adminCourseCommerceService.deactivateProviderProduct(
      courseId,
      mappingId,
    );
  }

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
