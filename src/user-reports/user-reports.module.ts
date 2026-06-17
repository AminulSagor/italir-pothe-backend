import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserReport } from './entities/user-report.entity';
import { ReportReason } from './entities/report-reason.entity';
import { User } from 'src/users/entities/user.entity';
import { File } from 'src/files/entities/file.entity';
import { UserReportsController } from './user-reports.controller';
import { UserReportsService } from './user-reports.service';
import { FilesModule } from 'src/files/files.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserReport, ReportReason, User, File]), FilesModule],
  controllers: [UserReportsController],
  providers: [UserReportsService],
  exports: [UserReportsService],
})
export class UserReportsModule {}
