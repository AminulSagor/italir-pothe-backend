import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { CvAssistantQuestionType } from '../enums/cv-assistant.enum';
import type {
  CvAssistantPlanningContext,
  CvAssistantTurnPlan,
  CvTemplateAnalysis,
} from './cv-question-planner.service';

const CvTemplateAnalysisSchema = z.object({
  layoutStyle: z.string(),
  colorPalette: z.array(z.string()),
  detectedSections: z.array(z.string()),
  sectionOrder: z.array(z.string()),
  hasProfilePhotoArea: z.boolean(),
  notes: z.string(),
});

const DynamicQuestionSchema = z.object({
  key: z.string(),
  text: z.string(),
  type: z.enum([
    'text',
    'long_text',
    'email',
    'phone',
    'url',
    'list',
    'choice',
  ]),
  optional: z.boolean(),
});

const ExtractedFieldSchema = z.object({
  key: z.string(),
  valueType: z.enum(['text', 'list']),
  textValue: z.string(),
  listValue: z.array(z.string()),
  confidence: z.number().int().min(0).max(100),
  mergeMode: z.enum(['replace', 'append']),
});

const CvAssistantTurnSchema = z.object({
  answerAccepted: z.boolean(),
  answerFeedback: z.string(),
  answerJustification: z.string(),
  extractedFields: z.array(ExtractedFieldSchema),
  nextQuestion: DynamicQuestionSchema.nullable(),
  readyToGenerate: z.boolean(),
  progress: z.number().int().min(0).max(100),
});

@Injectable()
export class CvAssistantOpenAiService {
  private readonly logger = new Logger(CvAssistantOpenAiService.name);

  private readonly openai: OpenAI | null;

  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();

    this.model =
      this.configService.get<string>('OPENAI_CV_ASSISTANT_MODEL')?.trim() || '';

    const configuredTimeout = Number(
      this.configService.get<string>('OPENAI_CV_ASSISTANT_TIMEOUT_MS') ??
        90_000,
    );

    const timeout =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 90_000;

    this.openai = apiKey
      ? new OpenAI({
          apiKey,
          timeout,
          maxRetries: 2,
        })
      : null;
  }

  async analyzeTemplate(imageUrl: string): Promise<CvTemplateAnalysis> {
    const openai = this.getClient();
    const model = this.getModel();
    const normalizedImageUrl = imageUrl.trim();

    if (!normalizedImageUrl) {
      throw new ServiceUnavailableException(
        'The CV template image URL is missing.',
      );
    }

    try {
      const response = await openai.responses.parse({
        model,

        input: [
          {
            role: 'system',
            content: `
You are a specialist CV-template analyst.

Examine the supplied CV-template image and describe only its visual and structural properties.

Return:
- Overall layout style.
- Main color palette.
- Visible CV sections.
- Section order.
- Whether a profile-photo area exists.
- Short layout notes useful for building the final CV.

Rules:
- Never copy sample names, email addresses, phone numbers, employers, dates,
  qualifications, or any other sample personal information.
- Never treat template sample content as the user's information.
- Keep section names concise.
- Return only the structured result.
            `.trim(),
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Analyze this CV template image.',
              },
              {
                type: 'input_image',
                image_url: normalizedImageUrl,
                detail: 'high',
              },
            ],
          },
        ],

        text: {
          format: zodTextFormat(
            CvTemplateAnalysisSchema,
            'cv_template_analysis',
          ),
        },
      });

      const parsed = response.output_parsed;

      if (!parsed) {
        throw new Error('OpenAI returned an empty CV-template analysis.');
      }

      return {
        layoutStyle: parsed.layoutStyle.trim() || 'professional',

        colorPalette: this.normalizeStringArray(parsed.colorPalette),

        detectedSections: this.normalizeStringArray(parsed.detectedSections),

        sectionOrder: this.normalizeStringArray(parsed.sectionOrder),

        hasProfilePhotoArea: parsed.hasProfilePhotoArea,

        notes: parsed.notes.trim(),
      };
    } catch (error) {
      this.logFailure('CV template analysis', error);

      throw new ServiceUnavailableException(
        'The CV template could not be analyzed.',
      );
    }
  }

  async planAssistantTurn(
    context: CvAssistantPlanningContext,
  ): Promise<CvAssistantTurnPlan> {
    const openai = this.getClient();
    const model = this.getModel();

    try {
      const response = await openai.responses.parse({
        model,

        input: [
          {
            role: 'system',
            content: `
You are a specialist CV-building assistant. Collect accurate information for a professional CV through a natural conversation.

CORE OUTPUT TASK
- Evaluate the latest interaction.
- Extract every reliable CV fact supplied by the user.
- Give a short acknowledgement or clarification.
- Briefly explain why the information is useful or what is still unclear.
- Decide what to ask next.
- Follow the conversationMode exactly.

CONVERSATION MODES
The input contains conversationMode: "one_by_one" or "all_at_once".

When conversationMode is "one_by_one":
- Ask exactly one focused question.
- nextQuestion.text must contain one primary question only.
- Select the most valuable question dynamically; do not use a rigid order.

When conversationMode is "all_at_once":
- Ask all remaining relevant CV questions in one message.
- Return one nextQuestion object with key "batchCvDetails", type "long_text",
  optional false, and a clearly numbered list in nextQuestion.text.
- Tell the user they may answer with the same numbers.
- Exclude information already collected.
- After a batch answer, extract all fields and ask only the remaining important
  questions together. Do not repeat answered questions.

CONTROL INSTRUCTIONS
When event is "mode_change":
- The user's message is a control command, not CV content.
- extractedFields must be empty.
- Briefly acknowledge the selected mode.
- Immediately ask according to the current conversationMode.

ANSWER HANDLING
- The user may supply many facts in one message. Extract all reliable facts.
- Never invent names, employers, dates, degrees, institutions, skills,
  achievements, contact details, addresses, URLs, references, or results.
- If an answer is useful but partially incomplete, accept and save the reliable
  part, then ask only for important missing details.
- If an answer is wholly unclear or irrelevant, set answerAccepted false and ask
  a focused clarification according to the active mode.
- answerFeedback and answerJustification must be concise and user-facing.
- Never reveal hidden reasoning or chain-of-thought.

FIELD EXTRACTION
Prefer stable camelCase keys where suitable:
fullName, professionalTitle, targetJob, email, phone, location,
professionalSummary, linkedinUrl, portfolioUrl, workExperience, education,
skills, technicalSkills, softSkills, languages, certifications, training,
projects, achievements, publications, volunteering, interests, references,
designPreferences, colorTheme.

For each extracted field:
- valueType "list" for short multiple values such as skills and interests.
- valueType "text" for names, contact details, summaries, experience,
  education, projects, and other detailed content.
- confidence 90-100 for explicit facts; 70-89 for reliable facts requiring light
  normalization; below 70 for uncertain facts.
- mergeMode "replace" for corrections or single-value fields.
- mergeMode "append" for a new job, degree, project, certification, or list item
  that should be added to existing information.
- Preserve factual meaning and the user's supplied details.
- A negative answer such as "I do not have LinkedIn" is not a URL and must not
  be stored as one.

TEMPLATE AND ASSETS
- In template mode, prioritize detected template sections but ask additional
  questions when they materially improve the CV.
- Never copy sample template content.
- In scratch mode, ask about profession, target role, and design preferences
  when useful.
- Profile photos are optional.
- Do not claim to have visually inspected uploaded reference images in this
  planning turn; only their count is supplied here.

SKIP EVENT
- Never criticize a skipped question.
- Do not extract information from a skip.
- In one_by_one mode, move to the next valuable question.
- In all_at_once mode, treat the current remaining batch as skipped, set
  nextQuestion null, and set readyToGenerate true.

READINESS AND PROGRESS
- The user may press Generate CV at any time.
- Set readyToGenerate true when the available information can produce a useful
  CV, even if optional details remain.
- Estimate progress from practical completeness, usually considering identity,
  contact details, professional direction, experience/background, education,
  and skills. Adjust for the candidate and template.
- If no meaningful question remains, set nextQuestion null and
  readyToGenerate true.

EVENTS
- start: welcome briefly and ask according to conversationMode. There is no
  answer to extract.
- answer: evaluate the latest answer and continue according to mode.
- skip: acknowledge and continue as specified above.
- attachment: acknowledge the asset briefly and continue according to mode.
- mode_change: acknowledge the selected mode and immediately present the next
  one-by-one question or all-at-once batch.

Return only the structured response.
            `.trim(),
          },
          {
            role: 'user',
            content: this.buildPlanningInput(context),
          },
        ],

        text: {
          format: zodTextFormat(CvAssistantTurnSchema, 'cv_assistant_turn'),
        },
      });

      const parsed = response.output_parsed;

      if (!parsed) {
        throw new Error('OpenAI returned an empty CV-assistant turn.');
      }

      return {
        answerAccepted: parsed.answerAccepted,

        answerFeedback: parsed.answerFeedback.trim(),

        answerJustification: parsed.answerJustification.trim(),

        extractedFields: parsed.extractedFields
          .map((field) => {
            const value =
              field.valueType === 'list'
                ? this.normalizeStringArray(field.listValue)
                : field.textValue.trim();

            return {
              key: field.key.trim(),

              value,

              confidence: field.confidence,

              mergeMode: field.mergeMode,
            };
          })
          .filter((field) => {
            if (!field.key) {
              return false;
            }

            return Array.isArray(field.value)
              ? field.value.length > 0
              : field.value.length > 0;
          }),

        nextQuestion: parsed.nextQuestion
          ? {
              key: parsed.nextQuestion.key.trim(),

              text: parsed.nextQuestion.text.trim(),

              type: this.mapQuestionType(parsed.nextQuestion.type),

              optional: parsed.nextQuestion.optional,
            }
          : null,

        readyToGenerate: parsed.readyToGenerate,

        progress: Math.max(0, Math.min(100, parsed.progress)),
      };
    } catch (error) {
      this.logFailure('Dynamic CV question planning', error);

      throw new ServiceUnavailableException(
        'The CV assistant could not prepare the next question.',
      );
    }
  }

  private buildPlanningInput(context: CvAssistantPlanningContext): string {
    return JSON.stringify(
      {
        event: context.event,

        conversationMode: context.conversationMode,

        cvCreationMode: context.hasTemplate ? 'template' : 'scratch',

        templateAnalysis: context.templateAnalysis,

        collectedCvData: context.collectedCvData,

        skippedQuestionKeys: context.skippedQuestionKeys,

        currentQuestion: context.currentQuestion,

        latestUserAnswer: context.latestUserAnswer,

        recentMessages: context.recentMessages.slice(-12),

        attachments: {
          hasProfilePhoto: context.hasProfilePhoto,

          referenceImageCount: context.referenceImageCount,
        },
      },
      null,
      2,
    );
  }

  private mapQuestionType(
    value: 'text' | 'long_text' | 'email' | 'phone' | 'url' | 'list' | 'choice',
  ): CvAssistantQuestionType {
    switch (value) {
      case 'long_text':
        return CvAssistantQuestionType.LONG_TEXT;

      case 'email':
        return CvAssistantQuestionType.EMAIL;

      case 'phone':
        return CvAssistantQuestionType.PHONE;

      case 'url':
        return CvAssistantQuestionType.URL;

      case 'list':
        return CvAssistantQuestionType.LIST;

      case 'choice':
        return CvAssistantQuestionType.CHOICE;

      case 'text':
      default:
        return CvAssistantQuestionType.TEXT;
    }
  }

  private normalizeStringArray(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private getClient(): OpenAI {
    if (!this.openai) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is not configured.',
      );
    }

    return this.openai;
  }

  private getModel(): string {
    if (!this.model) {
      throw new ServiceUnavailableException(
        'OPENAI_CV_ASSISTANT_MODEL is not configured.',
      );
    }

    return this.model;
  }

  private logFailure(operation: string, error: unknown): void {
    if (error instanceof Error) {
      this.logger.error(`${operation} failed: ${error.name}: ${error.message}`);

      return;
    }

    this.logger.error(`${operation} failed with an unknown error.`);
  }
}
