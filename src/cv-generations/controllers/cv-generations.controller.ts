import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { FileRequestUser } from 'src/files/services/files.service';

import { CreateCvGenerationDto } from '../dto/create-cv-generation.dto';
import { RegenerateCvGenerationDto } from '../dto/regenerate-cv-generation.dto';
import { CvGenerationsService } from '../services/cv-generations.service';

@Controller('cv-generations')
@UseGuards(JwtAuthGuard)
export class CvGenerationsController {
  constructor(private readonly cvGenerationsService: CvGenerationsService) {}

  @Post()
  async createGeneration(
    @Body() dto: CreateCvGenerationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.cvGenerationsService.create(dto, this.getCurrentUser(request));
  }

  @Get()
  async getMyGenerations(
    @Req() request: AuthenticatedRequest,

    @Query('page', new DefaultValuePipe(1), ParseIntPipe)
    page: number,

    @Query('limit', new DefaultValuePipe(10), ParseIntPipe)
    limit: number,
  ) {
    const currentUser = this.getCurrentUser(request);

    return this.cvGenerationsService.findAll(currentUser.id, page, limit);
  }

  @Get(':id')
  async getGeneration(
    @Param('id', new ParseUUIDPipe())
    id: string,

    @Req() request: AuthenticatedRequest,
  ) {
    const currentUser = this.getCurrentUser(request);

    return this.cvGenerationsService.findOne(id, currentUser.id);
  }

  @Post(':id/regenerate')
  async regenerate(
    @Param('id', new ParseUUIDPipe())
    id: string,

    @Body()
    dto: RegenerateCvGenerationDto,

    @Req() request: AuthenticatedRequest,
  ) {
    return this.cvGenerationsService.regenerate(
      id,
      dto,
      this.getCurrentUser(request),
    );
  }

  @Delete(':id')
  async deleteGeneration(
    @Param('id', new ParseUUIDPipe())
    id: string,

    @Req() request: AuthenticatedRequest,
  ) {
    return this.cvGenerationsService.delete(id, this.getCurrentUser(request));
  }

  private getCurrentUser(request: AuthenticatedRequest): FileRequestUser {
    const id = request.user?.id ?? request.user?.sub;

    const role = request.user?.role;

    if (!id || !role) {
      throw new UnauthorizedException('Authenticated user not found.');
    }

    return {
      id,
      role,
    };
  }
}
