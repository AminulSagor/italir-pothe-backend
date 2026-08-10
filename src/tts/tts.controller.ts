import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';

import { UserRole } from 'src/users/entities/user.entity';

import { GenerateTtsDto } from './dto/generate-tts.dto';
import { TtsService } from './tts.service';
import type { FileRequestUser } from 'src/files/services/files.service';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

@Controller('admin/tts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  @Post('quiz-audio')
  generateQuizAudio(
    @Body() dto: GenerateTtsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ttsService.generateQuizAudio(
      dto.text,
      this.getCurrentUser(request),
    );
  }

  private getCurrentUser(request: AuthenticatedRequest): FileRequestUser {
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
