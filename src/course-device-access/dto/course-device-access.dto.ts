import {
  IsBase64,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import {
  CourseDevicePlatform,
  CourseDeviceRequestDecision,
  CourseDeviceRequestStatus,
} from '../enums/course-device-access.enums';

export class CreateCourseDeviceChallengeDto {
  @IsEnum(CourseDevicePlatform)
  platform: CourseDevicePlatform;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  deviceKeyId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  deviceLabel: string;
}

export class VerifyCourseDeviceDto {
  @IsUUID('4')
  challengeId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  deviceKeyId: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  publicKeyPem?: string;

  @ValidateIf((value: VerifyCourseDeviceDto) => !value.assertionBase64)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  attestationToken?: string;

  @ValidateIf((value: VerifyCourseDeviceDto) => !value.attestationToken)
  @IsBase64()
  @MaxLength(20000)
  assertionBase64?: string;

  @IsOptional()
  @IsBase64()
  @MaxLength(2000)
  signatureBase64?: string;
}

export class CreateCourseDeviceRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  deviceKeyId: string;
}

export class AdminCourseDeviceRequestsQueryDto {
  @IsOptional()
  @IsEnum(CourseDeviceRequestStatus)
  status?: CourseDeviceRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}

export class DecideCourseDeviceRequestDto {
  @IsEnum(CourseDeviceRequestDecision)
  decision: CourseDeviceRequestDecision;
}
