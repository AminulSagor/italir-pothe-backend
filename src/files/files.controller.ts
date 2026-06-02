import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import * as authenticatedRequestInterface from 'src/common/interfaces/authenticated-request.interface';
import { FileRequestUser, FilesService } from './services/files.service';
import { CreateSignedUploadUrlDto } from './dto/create-signed-upload-url.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('signed-upload-url')
  async createSignedUploadUrl(@Body() dto: CreateSignedUploadUrlDto) {
    return this.filesService.createSignedUploadUrl(dto);
  }

  @Post('confirm-upload')
  async confirmUpload(
    @Body() dto: ConfirmUploadDto,
    @Req() request: authenticatedRequestInterface.AuthenticatedRequest,
  ) {
    return this.filesService.confirmUpload(dto, this.getCurrentUser(request));
  }

  @Get(':fileId/signed-read-url')
  async createSignedReadUrl(@Param('fileId') fileId: string) {
    return this.filesService.createSignedReadUrl(fileId);
  }

  @Delete(':fileId')
  async archiveFile(
    @Param('fileId') fileId: string,
    @Req() request: authenticatedRequestInterface.AuthenticatedRequest,
  ) {
    return this.filesService.archiveFile(fileId, this.getCurrentUser(request));
  }

  private getCurrentUser(
    request: authenticatedRequestInterface.AuthenticatedRequest,
  ): FileRequestUser {
    const id = request.user?.id ?? request.user?.sub;
    const role = request.user?.role;

    if (!id || !role) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return {
      id,
      role,
    };
  }
}
