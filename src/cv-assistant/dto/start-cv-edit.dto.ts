import { IsEnum } from 'class-validator';

import { CvAssistantEditMode } from '../enums/cv-assistant.enum';

export class StartCvEditDto {
  @IsEnum(CvAssistantEditMode)
  editMode: CvAssistantEditMode;
}
