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
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/users/entities/user.entity';
import {
  AdminEnrollmentQueryDto,
  CreateCourseProviderProductDto,
  GrantExternalCourseAccessDto,
  RefundCourseOrderDto,
  RevokeExternalCourseAccessDto,
  UpdateCourseProviderProductDto,
} from '../dto/admin-course-commerce.dto';
import { AdminCourseCommerceService } from '../services/admin-course-commerce.service';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

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
  async deleteProviderProduct(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,

    @Param('mappingId', new ParseUUIDPipe({ version: '4' }))
    mappingId: string,
  ) {
    return this.adminCourseCommerceService.deleteProviderProduct(
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

  @Post('courses/:courseId/external-access')
  async grantExternalCourseAccess(
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
    @Body() dto: GrantExternalCourseAccessDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminCourseCommerceService.grantExternalCourseAccess({
      courseId,
      adminUserId: this.getAdminId(request),
      dto,
    });
  }

  @Post('course-external-access/:grantId/revoke')
  async revokeExternalCourseAccess(
    @Param('grantId', new ParseUUIDPipe({ version: '4' })) grantId: string,
    @Body() dto: RevokeExternalCourseAccessDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminCourseCommerceService.revokeExternalCourseAccess({
      grantId,
      adminUserId: this.getAdminId(request),
      reason: dto.reason,
    });
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

  @Post('course-purchases/:orderId/refund')
  async refundGooglePlayOrder(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
    @Body() dto: RefundCourseOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminCourseCommerceService.refundGooglePlayOrder({
      orderId,
      adminUserId: this.getAdminId(request),
      reason: dto.reason,
    });
  }

  private getAdminId(request: AuthenticatedRequest): string {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated admin user not found.');
    }

    return id;
  }
}
