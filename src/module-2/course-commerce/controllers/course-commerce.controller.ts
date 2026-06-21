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

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import {
  ConfirmGooglePlayDemoDto,
  ConfirmStripeDemoDto,
  CourseQuoteQueryDto,
  CreateCoursePurchaseOrderDto,
  MyEnrollmentQueryDto,
  PurchaseHistoryQueryDto,
} from '../dto/course-commerce.dto';
import { CourseCommerceService } from '../services/course-commerce.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class CourseCommerceController {
  constructor(private readonly courseCommerceService: CourseCommerceService) {}

  @Get('course-purchases/courses/:courseId/quote')
  async getQuote(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,
    @Query() query: CourseQuoteQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.courseCommerceService.getQuote(
      this.getUserId(request),
      courseId,
      query,
    );
  }

  @Post('course-purchases/orders')
  async createOrder(
    @Body() dto: CreateCoursePurchaseOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.courseCommerceService.createOrder(this.getUserId(request), dto);
  }

  @Post('course-purchases/orders/:orderId/google-play/demo-confirm')
  async confirmGooglePlayDemo(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
    @Body() dto: ConfirmGooglePlayDemoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.courseCommerceService.confirmGooglePlayDemo({
      userId: this.getUserId(request),
      orderId,
      dto,
    });
  }

  @Post('course-purchases/orders/:orderId/stripe/demo-confirm')
  async confirmStripeDemo(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
    @Body() dto: ConfirmStripeDemoDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.courseCommerceService.confirmStripeDemo({
      userId: this.getUserId(request),
      orderId,
      dto,
    });
  }

  @Get('course-purchases/orders/:orderId')
  async findOrderById(
    @Param('orderId', new ParseUUIDPipe({ version: '4' }))
    orderId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.courseCommerceService.findOrderById(
      this.getUserId(request),
      orderId,
    );
  }

  @Get('course-purchases/history')
  async findPurchaseHistory(
    @Query() query: PurchaseHistoryQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.courseCommerceService.findPurchaseHistory(
      this.getUserId(request),
      query,
    );
  }

  @Get('course-enrollments/me')
  async findMyEnrollments(
    @Query() query: MyEnrollmentQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.courseCommerceService.findMyEnrollments(
      this.getUserId(request),
      query,
    );
  }

  @Get('course-enrollments/courses/:courseId/access')
  async getCourseAccess(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.courseCommerceService.getCourseAccess(
      this.getUserId(request),
      courseId,
    );
  }

  @Post('course-enrollments/courses/:courseId/accessed')
  async recordCourseAccess(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.courseCommerceService.recordCourseAccess(
      this.getUserId(request),
      courseId,
    );
  }

  private getUserId(request: AuthenticatedRequest): string {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found.');
    }

    return id;
  }
}
