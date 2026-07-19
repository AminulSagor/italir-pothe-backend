import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportReason } from './entities/report-reason.entity';
import { User } from 'src/users/entities/user.entity';
import { File } from 'src/files/entities/file.entity';
import { ModerationReport } from 'src/moderation/entities/moderation-report.entity';
import { FilesModule } from 'src/files/files.module';
import { ReportVisualEvidence } from 'src/moderation/entities/report-visual-evidence.entity';
import { UserReport } from './entities/user-report.entity';
import { UserReportsService } from './user-reports.service';
import { AdminReportReasonsController } from 'src/user-reports/admin-report-reasons.controller';
import { UserReportsController } from './user-reports.controller';

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
