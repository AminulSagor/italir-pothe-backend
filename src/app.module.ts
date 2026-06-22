import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PresenceModule } from './presence/presence.module';
import { ChatModule } from './chat/chat.module';
import { UserBlocksModule } from './user-blocks/user-blocks.module';
import { FilesModule } from './files/files.module';
import { CoursesModule } from './module-2/courses/courses.module';
import { SyllabusModule } from './module-2/syllabus/syllabus.module';
import { LessonsModule } from './module-2/lessons/lessons.module';
import { QuizzesModule } from './module-2/quizzes/quizzes.module';
import { FinalExamModule } from './module-2/final-exam/final-exam.module';
import { CertificatesModule } from './module-2/certificates/certificates.module';
import { WebinarModule } from './webinar/webinar.module';
import { ModerationModule } from './moderation/moderation.module';
import { CvBuilderModule } from './cv-builder/cv-builder.module';
import { UserReportsModule } from './user-reports/user-reports.module';
import { ScoringModule } from './module-2/scoring/scoring.module';
import { DailyChallengesModule } from './module-2/daily-challenges/daily-challenges.module';
import { FirebaseModule } from './firebase/firebase.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ProgressModule } from './module-2/progress/progress.module';
import { SurvivalItalianModule } from './module-2/survival-italian/survival-italian.module';
import { SkillBuilderModule } from './module-2/skill-builder/skill-builder.module';
import { ImportantVerbsModule } from './module-2/important-verbs/important-verbs.module';
import { CourseCommerceModule } from './module-2/course-commerce/course-commerce.module';
import { AiTutorModule } from './ai-tutor/ai-tutor.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: Number(configService.get<string>('DB_PORT') ?? 5432),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: configService.get<string>('TYPEORM_SYNC') === 'true',
        migrationsRun: false,
      }),
    }),

    UsersModule,
    AuthModule,
    PresenceModule,
    ChatModule,
    UserBlocksModule,
    FilesModule,
    CoursesModule,
    SyllabusModule,
    LessonsModule,
    QuizzesModule,
    FinalExamModule,
    CertificatesModule,
    WebinarModule,
    ModerationModule,
    CvBuilderModule,
    UserReportsModule,
    ScoringModule,
    DailyChallengesModule,
    FirebaseModule,
    NotificationsModule,
    ProgressModule,
    SurvivalItalianModule,
    SkillBuilderModule,
    ImportantVerbsModule,
    CourseCommerceModule,
    AiTutorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
