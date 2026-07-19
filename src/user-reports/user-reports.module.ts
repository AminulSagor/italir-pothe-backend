import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportReason } from './entities/report-reason.entity';
import { User } from 'src/users/entities/user.entity';
import { File } from 'src/files/entities/file.entity';
import { ModerationReport } from 'src/moderation/entities/moderation-report.entity';
import { AdminReportReasonsController } from './admin-report-reasons.controller';
import { FilesModule } from 'src/files/files.module';
import { ReportVisualEvidence } from 'src/moderation/entities/report-visual-evidence.entity';
import { UserReport } from './entities/user-report.entity';
import { UserReportsController } from './user-reports.controller';
import { UserReportsService } from './user-reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserReport,
      ReportReason,
      User,
      File,
      ModerationReport,
      ReportVisualEvidence,
    ]),
    FilesModule,
  ],
  controllers: [UserReportsController, AdminReportReasonsController],
  providers: [UserReportsService],
  exports: [UserReportsService],
})
export class UserReportsModule {}
