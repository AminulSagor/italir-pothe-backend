import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FilesModule } from './files/files.module';
import { CoursesModule } from './module-2/courses/courses.module';
import { SyllabusModule } from './module-2/syllabus/syllabus.module';
import { LessonsModule } from './module-2/lessons/lessons.module';
import { QuizzesModule } from './module-2/quizzes/quizzes.module';
import { FinalExamModule } from './module-2/final-exam/final-exam.module';
import { CertificatesModule } from './module-2/certificates/certificates.module';
import { WebinarModule } from './webinar/webinar.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

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
    FilesModule,
    CoursesModule,
    SyllabusModule,
    LessonsModule,
    QuizzesModule,
    FinalExamModule,
    CertificatesModule,
    WebinarModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
