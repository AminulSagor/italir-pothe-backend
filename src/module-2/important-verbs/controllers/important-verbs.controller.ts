import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "src/common/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "src/common/interfaces/authenticated-request.interface";
import {
  ImportantVerbDetailQueryDto,
  ImportantVerbListQueryDto,
  ImportantVerbSearchQueryDto,
} from "../dto/important-verb-query.dto";
import { ReviewImportantVerbDto } from "../dto/important-verb-progress.dto";
import { ImportantVerbsService } from "../services/important-verbs.service";

@Controller("important-verbs")
@UseGuards(JwtAuthGuard)
export class ImportantVerbsController {
  constructor(private readonly importantVerbsService: ImportantVerbsService) {}

  @Get()
  async findAll(
    @Query() query: ImportantVerbListQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.importantVerbsService.findAll({
      userId: this.getUserId(request),
      query,
    });
  }

  @Get("search")
  async search(
    @Query() query: ImportantVerbSearchQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.importantVerbsService.search({
      userId: this.getUserId(request),
      query,
    });
  }

  @Get("saved")
  async findSaved(
    @Query() query: ImportantVerbListQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.importantVerbsService.findSaved({
      userId: this.getUserId(request),
      query,
    });
  }

  @Get("progress")
  async getMyProgress(@Req() request: AuthenticatedRequest) {
    return this.importantVerbsService.getMyProgress(this.getUserId(request));
  }

  @Get(":verbId")
  async findById(
    @Param("verbId", new ParseUUIDPipe({ version: "4" }))
    verbId: string,
    @Query() query: ImportantVerbDetailQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.importantVerbsService.findById({
      userId: this.getUserId(request),
      verbId,
      language: query.language,
    });
  }

  @Post(":verbId/save")
  async saveVerb(
    @Param("verbId", new ParseUUIDPipe({ version: "4" }))
    verbId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.importantVerbsService.saveVerb(this.getUserId(request), verbId);
  }

  @Delete(":verbId/save")
  async removeSavedVerb(
    @Param("verbId", new ParseUUIDPipe({ version: "4" }))
    verbId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.importantVerbsService.removeSavedVerb(
      this.getUserId(request),
      verbId,
    );
  }

  @Post(":verbId/reviewed")
  async reviewVerb(
    @Param("verbId", new ParseUUIDPipe({ version: "4" }))
    verbId: string,
    @Body() dto: ReviewImportantVerbDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.importantVerbsService.reviewVerb({
      userId: this.getUserId(request),
      verbId,
      dto,
    });
  }

  private getUserId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException("Authenticated user not found");
    }

    return id;
  }
}
