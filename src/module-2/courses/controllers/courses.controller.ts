import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import {
  PublicCourseCatalogQueryDto,
  PublicCourseQueryDto,
} from '../dto/course.dto';
import { CoursesService } from '../services/courses.service';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async findMyCourses(
    @Query() query: PublicCourseQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.coursesService.findAllCoursesForUser(
      this.getUserId(request),
      query.provider,
    );
  }

  @Get('me/catalog')
  @UseGuards(JwtAuthGuard)
  async findMyCourseCatalog(
    @Query() query: PublicCourseCatalogQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.coursesService.findCourseCatalogForUser(
      this.getUserId(request),
      query,
    );
  }

  @Get('me/:courseId')
  @UseGuards(JwtAuthGuard)
  async findMyCourseById(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,
    @Query() query: PublicCourseQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.coursesService.findCourseByIdForUser(
      this.getUserId(request),
      courseId,
      query.provider,
    );
  }

  @Get()
  async findAllCourses(@Query() query: PublicCourseQueryDto) {
    return this.coursesService.findAllCourses(query.provider);
  }

  @Get('catalog')
  async findCourseCatalog(@Query() query: PublicCourseCatalogQueryDto) {
    return this.coursesService.findCourseCatalog(query);
  }

  @Get(':courseId')
  async findCourseById(
    @Param('courseId', new ParseUUIDPipe({ version: '4' }))
    courseId: string,
    @Query() query: PublicCourseQueryDto,
  ) {
    return this.coursesService.findCourseById(courseId, query.provider);
  }

  private getUserId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return id;
  }
}
