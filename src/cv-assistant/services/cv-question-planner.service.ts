import { Injectable } from '@nestjs/common';

import {
  CvAssistantConversationMode,
  CvAssistantQuestionType,
} from '../enums/cv-assistant.enum';
import { CvAssistantOpenAiService } from './cv-assistant-openai.service';

export interface CvTemplateAnalysis {
  layoutStyle: string;
  colorPalette: string[];
  detectedSections: string[];
  sectionOrder: string[];
  hasProfilePhotoArea: boolean;
  notes: string;
}

export interface CvDynamicQuestion {
  key: string;
  text: string;
  type: CvAssistantQuestionType;
  optional: boolean;
}

export type CvFieldMergeMode = 'replace' | 'append';

export interface CvExtractedField {
  key: string;
  value: string | string[];
  confidence: number;
  mergeMode: CvFieldMergeMode;
}

export interface CvAssistantPlanningContext {
  event: 'start' | 'answer' | 'skip' | 'attachment' | 'mode_change';

  conversationMode: CvAssistantConversationMode;

  hasTemplate: boolean;

  templateAnalysis: CvTemplateAnalysis | null;

  collectedCvData: Record<string, unknown>;

  skippedQuestionKeys: string[];

  currentQuestion: CvDynamicQuestion | null;

  latestUserAnswer: string | null;

  recentMessages: Array<{
    role: string;
    text: string;
  }>;

  hasProfilePhoto: boolean;

  referenceImageCount: number;
}

export interface CvAssistantTurnPlan {
  answerAccepted: boolean;

  answerFeedback: string;

  answerJustification: string;

  extractedFields: CvExtractedField[];

  nextQuestion: CvDynamicQuestion | null;

  readyToGenerate: boolean;

  progress: number;
}

@Injectable()
export class CvQuestionPlannerService {
  constructor(private readonly openAiService: CvAssistantOpenAiService) {}

  async planTurn(
    context: CvAssistantPlanningContext,
  ): Promise<CvAssistantTurnPlan> {
    return this.openAiService.planAssistantTurn(context);
  }

  applyExtractedFields(
    existingData: Record<string, unknown>,
    extractedFields: CvExtractedField[],
  ): Record<string, unknown> {
    const updatedData: Record<string, unknown> = {
      ...existingData,
    };

    for (const field of extractedFields) {
      const key = field.key.trim();

      if (!key || field.confidence < 70) {
        continue;
      }

      if (Array.isArray(field.value)) {
        const normalizedItems = [
          ...new Set(field.value.map((item) => item.trim()).filter(Boolean)),
        ];

        if (normalizedItems.length === 0) {
          continue;
        }

        if (field.mergeMode === 'append') {
          const existingItems = Array.isArray(updatedData[key])
            ? (updatedData[key] as unknown[])
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter(Boolean)
            : [];

          updatedData[key] = [
            ...new Set([...existingItems, ...normalizedItems]),
          ];
        } else {
          updatedData[key] = normalizedItems;
        }

        continue;
      }

      const normalizedValue = field.value.trim();

      if (!normalizedValue) {
        continue;
      }

      if (
        field.mergeMode === 'append' &&
        typeof updatedData[key] === 'string' &&
        (updatedData[key] as string).trim()
      ) {
        const existingValue = (updatedData[key] as string).trim();

        if (!existingValue.includes(normalizedValue)) {
          updatedData[key] = `${existingValue}\n\n${normalizedValue}`;
        }
      } else {
        updatedData[key] = normalizedValue;
      }
    }

    return updatedData;
  }
}
