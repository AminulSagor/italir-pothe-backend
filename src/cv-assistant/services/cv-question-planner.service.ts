import { Injectable } from '@nestjs/common';

import {
  CvAssistantConversationMode,
  CvAssistantEditMode,
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

export type CvFieldMergeMode = 'replace' | 'append' | 'remove';

export type CvExtractedValueType = 'text' | 'list' | 'object' | 'object_list';

export type CvExtractedValue =
  | string
  | string[]
  | Record<string, unknown>
  | Record<string, unknown>[]
  | null;

export interface CvExtractedField {
  key: string;

  value: CvExtractedValue;

  confidence: number;

  mergeMode: CvFieldMergeMode;

  /*
   * Optional temporarily so this planner remains compatible
   * until cv-assistant-openai.service.ts is also updated.
   */
  valueType?: CvExtractedValueType;
}

export type CvPhotoDecision =
  | 'unresolved'
  | 'uploaded'
  | 'without_photo'
  | 'not_applicable';

export interface CvPendingSuggestion {
  key: string;
  targetField: string | null;
  text: string;
}

export interface CvAssistantPlanningState {
  pendingSuggestions: CvPendingSuggestion[];

  confirmedSuggestions: string[];

  rejectedSuggestions: string[];

  missingRequiredFields: string[];

  missingTemplateSections: string[];

  declinedOptionalSections: string[];

  unresolvedOptionalSections: string[];

  photoDecision: CvPhotoDecision;

  qualityIssues: string[];

  canGenerate: boolean;
}

export interface CvAssistantPlanningContext {
  event: 'start' | 'answer' | 'attachment' | 'mode_change';

  conversationMode: CvAssistantConversationMode;

  hasTemplate: boolean;

  templateAnalysis: CvTemplateAnalysis | null;

  collectedCvData: Record<string, unknown>;

  currentQuestion: CvDynamicQuestion | null;

  latestUserAnswer: string | null;

  recentMessages: Array<{
    role: string;
    text: string;
  }>;

  hasProfilePhoto: boolean;

  referenceImageCount: number;

  /*
   * Null during normal CV creation.
   * facts_only updates factual information while
   * preserving the existing design.
   * design_and_facts updates facts first and then
   * collects a design instruction.
   */
  editMode: CvAssistantEditMode | null;

  /*
   * The completed generation from which this edit
   * session was created.
   */
  sourceGenerationId: string | null;

  /*
   * Required only for design_and_facts mode after
   * factual editing has been completed.
   */
  pendingDesignInstruction: string | null;

  /*
   * Calculated by this planner before the context
   * is sent to OpenAI.
   */
  planningState?: CvAssistantPlanningState;
}

export interface CvAssistantTurnPlan {
  answerAccepted: boolean;

  answerFeedback: string;

  answerJustification: string;

  extractedFields: CvExtractedField[];

  nextQuestion: CvDynamicQuestion | null;

  readyToGenerate: boolean;

  progress: number;

  planningState?: CvAssistantPlanningState;
}

@Injectable()
export class CvQuestionPlannerService {
  constructor(private readonly openAiService: CvAssistantOpenAiService) {}

  async planTurn(
    context: CvAssistantPlanningContext,
  ): Promise<CvAssistantTurnPlan> {
    const initialPlanningState = this.buildPlanningState(
      context,
      context.collectedCvData,
    );

    const enrichedContext: CvAssistantPlanningContext = {
      ...context,
      planningState: initialPlanningState,
    };

    const aiPlan = await this.openAiService.planAssistantTurn(enrichedContext);

    /*
     * Apply the newest extraction temporarily so that
     * readiness is calculated against the latest answer.
     */
    const projectedCvData = this.applyExtractedFields(
      context.collectedCvData,
      aiPlan.extractedFields,
    );

    const projectedContext: CvAssistantPlanningContext = {
      ...enrichedContext,
      collectedCvData: projectedCvData,
      currentQuestion: aiPlan.nextQuestion,
    };

    const finalPlanningState = this.buildPlanningState(
      projectedContext,
      projectedCvData,
    );

    const safelyReady =
      aiPlan.readyToGenerate === true &&
      aiPlan.nextQuestion === null &&
      finalPlanningState.canGenerate === true;

    const nextQuestion = safelyReady
      ? null
      : (aiPlan.nextQuestion ??
        this.buildFallbackQuestion(finalPlanningState, projectedContext));

    return {
      ...aiPlan,

      nextQuestion,

      readyToGenerate: safelyReady && nextQuestion === null,

      progress:
        safelyReady && nextQuestion === null
          ? 100
          : Math.max(0, Math.min(99, aiPlan.progress)),

      planningState: finalPlanningState,
    };
  }

  applyExtractedFields(
    existingData: Record<string, unknown>,
    extractedFields: CvExtractedField[],
  ): Record<string, unknown> {
    const updatedData = this.cloneRecord(existingData);

    for (const field of extractedFields) {
      const originalKey = field.key.trim();

      if (!originalKey || field.confidence < 70) {
        continue;
      }

      const key = this.normalizeDataFieldKey(originalKey);

      const normalizedValue = this.normalizeExtractedValue(field.value);

      const mergeMode =
        key === 'skills' &&
        ['technicalSkills', 'softSkills'].includes(originalKey) &&
        field.mergeMode === 'replace'
          ? 'append'
          : field.mergeMode;

      if (mergeMode === 'remove') {
        this.applyRemoveOperation(
          updatedData,
          key,
          normalizedValue,
          field.valueType,
        );

        continue;
      }

      if (
        normalizedValue === null ||
        !this.hasMeaningfulValue(normalizedValue)
      ) {
        continue;
      }

      if (mergeMode === 'append') {
        this.applyAppendOperation(updatedData, key, normalizedValue);

        continue;
      }

      this.applyReplaceOperation(
        updatedData,
        key,
        normalizedValue,
        field.valueType,
      );
    }

    return updatedData;
  }
  private applyReplaceOperation(
    data: Record<string, unknown>,
    key: string,
    value: Exclude<CvExtractedValue, null>,
    valueType?: CvExtractedValueType,
  ): void {
    if (this.isStructuredArrayField(key)) {
      const incomingItems = Array.isArray(value)
        ? value.filter((item): item is Record<string, unknown> =>
            this.isRecord(item),
          )
        : this.isRecord(value)
          ? [value]
          : [];

      if (incomingItems.length === 0) {
        return;
      }

      const existingItems = this.readRecordArray(data[key]);

      /*
       * A targeted structured edit must contain itemIndex.
       *
       * Example:
       * Change the second experience:
       * itemIndex: 1
       *
       * Only valid indexed items are processed. Unindexed
       * objects in the same operation are ignored so they
       * cannot accidentally replace or append information.
       */
      const indexedItems = incomingItems.filter(
        (item) => this.readItemIndex(item) !== null,
      );

      if (indexedItems.length > 0) {
        const nextItems = existingItems.map((item) => this.cloneRecord(item));

        let changed = false;

        for (const incomingItem of indexedItems) {
          const itemIndex = this.readItemIndex(incomingItem);

          const cleanValue = this.stripOperationMetadata(incomingItem);

          if (
            itemIndex === null ||
            itemIndex < 0 ||
            itemIndex >= nextItems.length ||
            !this.hasMeaningfulValue(cleanValue)
          ) {
            continue;
          }

          /*
           * Merge only the changed properties into the selected
           * entry. Preserve every unrelated property.
           */
          nextItems[itemIndex] = {
            ...nextItems[itemIndex],
            ...cleanValue,
          };

          changed = true;
        }

        if (changed) {
          data[key] = nextItems;
        }

        return;
      }

      const cleanItems = incomingItems
        .map((item) => this.stripOperationMetadata(item))
        .filter((item) => this.hasMeaningfulValue(item));

      if (cleanItems.length === 0) {
        return;
      }

      /*
       * There is no existing data, so creating the first entry
       * cannot delete anything.
       */
      if (existingItems.length === 0) {
        data[key] = cleanItems;

        return;
      }

      /*
       * When only one entry exists, one incoming object can be
       * safely merged into it without deleting another entry.
       */
      if (
        existingItems.length === 1 &&
        cleanItems.length === 1 &&
        valueType !== 'object_list'
      ) {
        data[key] = [
          {
            ...existingItems[0],
            ...cleanItems[0],
          },
        ];

        return;
      }

      /*
       * Replacing the whole structured section is permitted
       * only when OpenAI explicitly declares object_list and
       * supplies an array.
       *
       * A single object without itemIndex can never replace a
       * multi-entry experiences, education, projects,
       * certifications, languages, or references array.
       */
      const isExplicitWholeSectionReplacement =
        valueType === 'object_list' && Array.isArray(value);

      if (isExplicitWholeSectionReplacement) {
        data[key] = cleanItems;
      }

      /*
       * Otherwise the operation is ambiguous, so preserve all
       * existing data instead of guessing.
       */
      return;
    }

    if (this.isRecord(value)) {
      const itemIndex = this.readItemIndex(value);

      const cleanValue = this.stripOperationMetadata(value);

      if (itemIndex !== null) {
        const existingValue = data[key];

        if (
          Array.isArray(existingValue) &&
          itemIndex >= 0 &&
          itemIndex < existingValue.length
        ) {
          const existingItems = [...existingValue];

          const existingItem = existingItems[itemIndex];

          existingItems[itemIndex] = this.isRecord(existingItem)
            ? {
                ...existingItem,
                ...cleanValue,
              }
            : cleanValue;

          data[key] = existingItems;
        }

        /*
         * Never replace the entire field when an invalid
         * itemIndex was supplied.
         */
        return;
      }

      data[key] = cleanValue;

      return;
    }

    data[key] = this.cloneValue(value);
  }

  private applyAppendOperation(
    data: Record<string, unknown>,
    key: string,
    value: Exclude<CvExtractedValue, null>,
  ): void {
    const existingValue = data[key];

    if (typeof value === 'string') {
      const normalizedValue = value.trim();

      if (!normalizedValue) {
        return;
      }

      if (typeof existingValue === 'string' && existingValue.trim()) {
        const existingText = existingValue.trim();

        if (
          !existingText.toLowerCase().includes(normalizedValue.toLowerCase())
        ) {
          data[key] = `${existingText}\n\n${normalizedValue}`;
        }

        return;
      }

      if (Array.isArray(existingValue)) {
        const existingStrings = this.normalizeStringArray(existingValue);

        data[key] = this.mergeUniqueStrings(existingStrings, [normalizedValue]);

        return;
      }

      data[key] = normalizedValue;

      return;
    }

    if (Array.isArray(value)) {
      const stringValues = value.filter(
        (item): item is string => typeof item === 'string',
      );

      if (stringValues.length === value.length) {
        const existingStrings = Array.isArray(existingValue)
          ? this.normalizeStringArray(existingValue)
          : typeof existingValue === 'string'
            ? [existingValue.trim()].filter(Boolean)
            : [];

        data[key] = this.mergeUniqueStrings(
          existingStrings,
          this.normalizeStringArray(stringValues),
        );

        return;
      }

      const objectValues = value
        .filter((item): item is Record<string, unknown> => this.isRecord(item))
        /*
         * An item with itemIndex is an update operation,
         * not a new entry.
         */
        .filter((item) => this.readItemIndex(item) === null)
        .map((item) => this.stripOperationMetadata(item))
        .filter((item) => this.hasMeaningfulValue(item));

      const existingObjects = this.readRecordArray(existingValue);

      data[key] = this.mergeUniqueObjects(existingObjects, objectValues);

      return;
    }

    if (this.isRecord(value)) {
      /*
       * append must only create a new entry.
       * Indexed objects belong to replace/update operations.
       */
      if (this.readItemIndex(value) !== null) {
        return;
      }

      const cleanValue = this.stripOperationMetadata(value);

      if (!this.hasMeaningfulValue(cleanValue)) {
        return;
      }

      if (this.isStructuredArrayField(key) || Array.isArray(existingValue)) {
        const existingObjects = this.readRecordArray(existingValue);

        data[key] = this.mergeUniqueObjects(existingObjects, [cleanValue]);

        return;
      }

      if (this.isRecord(existingValue)) {
        data[key] = {
          ...existingValue,
          ...cleanValue,
        };

        return;
      }

      data[key] = cleanValue;
    }
  }

  private applyRemoveOperation(
    data: Record<string, unknown>,
    key: string,
    value: CvExtractedValue,
    valueType?: CvExtractedValueType,
  ): void {
    const existingValue = data[key];

    /*
     * An empty removal value explicitly means remove the
     * complete field or structured section.
     */
    if (!this.hasMeaningfulValue(value)) {
      const isExplicitStructuredSectionRemoval =
        this.isStructuredArrayField(key) &&
        valueType === 'object_list' &&
        Array.isArray(value);

      /*
       * Allow deletion of an entire structured section only
       * when OpenAI explicitly sends object_list with an empty
       * array and mergeMode remove.
       */
      if (isExplicitStructuredSectionRemoval) {
        delete data[key];

        return;
      }

      /*
       * Malformed empty values must never accidentally remove
       * an array or structured section.
       */
      if (this.isStructuredArrayField(key) || Array.isArray(existingValue)) {
        return;
      }

      delete data[key];

      return;
    }

    if (Array.isArray(existingValue)) {
      /*
       * Remove specific string-list items, such as skills,
       * interests, or achievements.
       */
      if (existingValue.every((item) => typeof item === 'string')) {
        const removals = Array.isArray(value)
          ? value.filter((item): item is string => typeof item === 'string')
          : typeof value === 'string'
            ? [value]
            : [];

        const removalSet = new Set(
          removals.map((item) => item.trim().toLowerCase()).filter(Boolean),
        );

        /*
         * A malformed removal value must not clear the list.
         */
        if (removalSet.size === 0) {
          return;
        }

        const existingStrings = existingValue
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim());

        const remaining = existingStrings.filter(
          (item) => item && !removalSet.has(item.toLowerCase()),
        );

        if (remaining.length === existingStrings.length) {
          return;
        }

        if (remaining.length > 0) {
          data[key] = remaining;
        } else {
          delete data[key];
        }

        return;
      }

      /*
       * Structured entries can be removed by itemIndex or by
       * reliable identifying properties.
       */
      const selectors = Array.isArray(value)
        ? value.filter((item): item is Record<string, unknown> =>
            this.isRecord(item),
          )
        : this.isRecord(value)
          ? [value]
          : [];

      /*
       * Previously an invalid selector could delete the whole
       * structured section. Now it performs no operation.
       */
      if (selectors.length === 0) {
        return;
      }

      let remaining = [...existingValue];

      let changed = false;

      /*
       * Remove indexed entries from highest to lowest so one
       * removal cannot shift the next target.
       */
      const indexes = [
        ...new Set(
          selectors
            .map((selector) => this.readItemIndex(selector))
            .filter((index): index is number => index !== null),
        ),
      ].sort((a, b) => b - a);

      for (const index of indexes) {
        if (index >= 0 && index < remaining.length) {
          remaining.splice(index, 1);

          changed = true;
        }
      }

      /*
       * Also support removal by exact identifying fields.
       *
       * Example:
       * {
       *   company: "ABC Ltd",
       *   jobTitle: "Developer"
       * }
       */
      const valueSelectors = selectors
        .filter((selector) => this.readItemIndex(selector) === null)
        .map((selector) => this.stripOperationMetadata(selector))
        .filter((selector) => this.hasMeaningfulValue(selector));

      if (valueSelectors.length > 0) {
        const filteredItems = remaining.filter((item) => {
          if (!this.isRecord(item)) {
            return true;
          }

          return !valueSelectors.some((selector) =>
            this.recordMatchesSelector(item, selector),
          );
        });

        if (filteredItems.length !== remaining.length) {
          changed = true;
        }

        remaining = filteredItems;
      }

      /*
       * Invalid indexes or unmatched selectors must not delete
       * or change existing information.
       */
      if (!changed) {
        return;
      }

      if (remaining.length > 0) {
        data[key] = remaining;
      } else {
        delete data[key];
      }

      return;
    }

    /*
     * Removing a normal scalar or standalone object removes
     * that complete field.
     */
    delete data[key];
  }

  private buildPlanningState(
    context: CvAssistantPlanningContext,
    cvData: Record<string, unknown>,
  ): CvAssistantPlanningState {
    const resolvedSuggestions = this.readStringList(
      cvData.assistantResolvedSuggestions,
    );

    const rejectedSuggestions = this.readStringList(
      cvData.assistantRejectedSuggestions,
    );

    const confirmedSuggestions = resolvedSuggestions.filter(
      (key) => !rejectedSuggestions.includes(key),
    );

    const declinedOptionalSections = this.readStringList(
      cvData.assistantDeclinedSections,
    ).map((section) => this.normalizeSectionKey(section));

    const pendingSuggestions = this.getPendingSuggestions(
      context.currentQuestion,
      resolvedSuggestions,
    );

    const photoDecision = this.resolvePhotoDecision(context, cvData);

    const missingRequiredFields = context.hasTemplate
      ? []
      : this.getMissingScratchRequiredFields(cvData);

    const missingTemplateSections = context.hasTemplate
      ? this.getMissingTemplateSections(
          context,
          cvData,
          declinedOptionalSections,
          photoDecision,
        )
      : [];

    /*
     * Existing edit sessions must not reopen unrelated
     * optional sections from the original questionnaire.
     */
    const unresolvedOptionalSections = context.editMode
      ? []
      : this.getUnresolvedOptionalSections(
          context,
          cvData,
          declinedOptionalSections,
          photoDecision,
        );

    const qualityIssues = this.getQualityIssues({
      context,
      cvData,
      pendingSuggestions,
      missingRequiredFields,
      missingTemplateSections,
      unresolvedOptionalSections,
      photoDecision,
    });

    const editFlowReady = this.isEditFlowReady(context, cvData);

    return {
      pendingSuggestions,

      confirmedSuggestions,

      rejectedSuggestions,

      missingRequiredFields,

      missingTemplateSections,

      declinedOptionalSections,

      unresolvedOptionalSections,

      photoDecision,

      qualityIssues,

      canGenerate:
        pendingSuggestions.length === 0 &&
        missingRequiredFields.length === 0 &&
        missingTemplateSections.length === 0 &&
        unresolvedOptionalSections.length === 0 &&
        qualityIssues.length === 0 &&
        photoDecision !== 'unresolved' &&
        editFlowReady,
    };
  }

  private getPendingSuggestions(
    currentQuestion: CvDynamicQuestion | null,
    resolvedSuggestions: string[],
  ): CvPendingSuggestion[] {
    if (!currentQuestion) {
      return [];
    }

    const key = currentQuestion.key.trim();

    if (
      !key.toLowerCase().startsWith('confirm') ||
      resolvedSuggestions.includes(key)
    ) {
      return [];
    }

    return [
      {
        key,

        targetField: this.getSuggestionTargetField(key),

        text: currentQuestion.text.trim(),
      },
    ];
  }

  private getSuggestionTargetField(confirmationKey: string): string | null {
    const normalized = confirmationKey.toLowerCase();

    if (normalized.includes('professionalsummary')) {
      return 'summary';
    }

    if (normalized.includes('professionaltitle')) {
      return 'professionalTitle';
    }

    if (normalized.includes('education')) {
      return 'education';
    }

    if (normalized.includes('workexperience')) {
      return 'experiences';
    }

    if (normalized.includes('skills')) {
      return 'skills';
    }

    if (normalized.includes('project')) {
      return 'projects';
    }

    if (normalized.includes('abbreviation')) {
      return null;
    }

    return null;
  }

  private getMissingScratchRequiredFields(
    cvData: Record<string, unknown>,
  ): string[] {
    const missing: string[] = [];

    if (!this.hasMeaningfulValue(cvData.fullName)) {
      missing.push('fullName');
    }

    if (!this.hasMeaningfulValue(cvData.email)) {
      missing.push('email');
    }

    if (!this.hasMeaningfulValue(cvData.phone)) {
      missing.push('phone');
    }

    if (!this.hasMeaningfulValue(cvData.location)) {
      missing.push('location');
    }

    if (
      !this.hasAnyMeaningfulValue(cvData, ['professionalTitle', 'targetJob'])
    ) {
      missing.push('professionalTitleOrTargetJob');
    }

    if (!this.hasMeaningfulValue(cvData.education)) {
      missing.push('education');
    }

    if (
      !this.hasAnyMeaningfulValue(cvData, [
        'skills',
        'technicalSkills',
        'softSkills',
      ])
    ) {
      missing.push('skills');
    }

    const hasBackground =
      this.hasAnyMeaningfulValue(cvData, [
        'experiences',
        'workExperience',
        'projects',
        'training',
        'volunteering',
        'relevantCoursework',
      ]) || this.hasMeaningfulValue(cvData.professionalBackgroundStatus);

    if (!hasBackground) {
      missing.push('professionalBackground');
    }

    return missing;
  }

  private getMissingTemplateSections(
    context: CvAssistantPlanningContext,
    cvData: Record<string, unknown>,
    declinedSections: string[],
    photoDecision: CvPhotoDecision,
  ): string[] {
    const template = context.templateAnalysis;

    if (!template) {
      return ['templateAnalysis'];
    }

    const detectedSections = [
      ...new Set(
        template.detectedSections
          .map((section) => this.normalizeSectionKey(section))
          .filter(Boolean),
      ),
    ];

    if (detectedSections.length === 0) {
      return ['templateSections'];
    }

    return detectedSections.filter((section) => {
      if (section === 'profilePhoto') {
        return photoDecision === 'unresolved';
      }

      if (
        declinedSections.includes(section) &&
        this.canDeclineTemplateSection(section, cvData)
      ) {
        return false;
      }

      return !this.isSectionComplete(section, cvData);
    });
  }

  private getUnresolvedOptionalSections(
    context: CvAssistantPlanningContext,
    cvData: Record<string, unknown>,
    declinedSections: string[],
    photoDecision: CvPhotoDecision,
  ): string[] {
    const optionalSections = context.hasTemplate
      ? this.getTemplateOptionalSections(context)
      : [
          'professionalSummary',
          'projects',
          'certifications',
          'languages',
          'achievements',
          'linkedinUrl',
          'portfolioUrl',
          'interests',
          'references',
          'designPreferences',
          'colorTheme',
        ];

    const unresolved = optionalSections.filter(
      (section) =>
        !this.isSectionComplete(section, cvData) &&
        !declinedSections.includes(section),
    );

    const shouldResolvePhoto =
      !context.hasTemplate ||
      context.templateAnalysis?.hasProfilePhotoArea === true;

    if (shouldResolvePhoto && photoDecision === 'unresolved') {
      unresolved.push('profilePhoto');
    }

    return [...new Set(unresolved)];
  }

  private getTemplateOptionalSections(
    context: CvAssistantPlanningContext,
  ): string[] {
    const optionalSections = new Set([
      'professionalSummary',
      'languages',
      'projects',
      'certifications',
      'training',
      'achievements',
      'publications',
      'volunteering',
      'interests',
      'references',
    ]);

    return (context.templateAnalysis?.detectedSections ?? [])
      .map((section) => this.normalizeSectionKey(section))
      .filter((section) => optionalSections.has(section));
  }

  private resolvePhotoDecision(
    context: CvAssistantPlanningContext,
    cvData: Record<string, unknown>,
  ): CvPhotoDecision {
    if (context.hasProfilePhoto) {
      return 'uploaded';
    }

    const storedDecision = this.readText(cvData.photoPreference);

    if (storedDecision === 'uploaded' || storedDecision === 'without_photo') {
      return storedDecision;
    }

    if (
      context.hasTemplate &&
      context.templateAnalysis &&
      !context.templateAnalysis.hasProfilePhotoArea
    ) {
      return 'not_applicable';
    }

    /*
     * An edit session inherits the already-resolved photo
     * decision from the completed source CV.
     */
    if (context.editMode) {
      return 'without_photo';
    }

    return 'unresolved';
  }

  private getQualityIssues(params: {
    context: CvAssistantPlanningContext;

    cvData: Record<string, unknown>;

    pendingSuggestions: CvPendingSuggestion[];

    missingRequiredFields: string[];

    missingTemplateSections: string[];

    unresolvedOptionalSections: string[];

    photoDecision: CvPhotoDecision;
  }): string[] {
    const {
      context,
      cvData,
      pendingSuggestions,
      missingRequiredFields,
      missingTemplateSections,
      unresolvedOptionalSections,
      photoDecision,
    } = params;

    const issues: string[] = [];

    for (const field of missingRequiredFields) {
      issues.push(`Missing required information: ${field}.`);
    }

    for (const section of missingTemplateSections) {
      issues.push(`The template section "${section}" is incomplete.`);
    }

    for (const section of unresolvedOptionalSections) {
      issues.push(
        `The optional section "${section}" must be provided or explicitly declined.`,
      );
    }

    if (pendingSuggestions.length > 0) {
      issues.push(
        'An AI suggestion is still awaiting Accept, Edit, or Reject.',
      );
    }

    if (photoDecision === 'unresolved') {
      issues.push('The profile-photo decision is unresolved.');
    }

    if (context.editMode && !context.sourceGenerationId) {
      issues.push('The source CV generation is missing.');
    }

    if (context.editMode) {
      const editFactsStatus = this.readText(cvData.editFactsStatus);

      if (editFactsStatus !== 'completed') {
        issues.push('The factual-edit step has not been marked complete.');
      }

      if (
        context.editMode === CvAssistantEditMode.DESIGN_AND_FACTS &&
        !this.resolvePendingDesignInstruction(context, cvData)
      ) {
        issues.push('A design instruction is required.');
      }
    }

    const email = this.readText(cvData.email);

    if (email && !this.looksLikeEmail(email)) {
      issues.push('The email address format appears invalid.');
    }

    const phone = this.readText(cvData.phone);

    if (phone && !this.looksLikePhone(phone)) {
      issues.push('The phone number appears incomplete or invalid.');
    }

    issues.push(...this.getEducationQualityIssues(cvData));

    issues.push(...this.getExperienceQualityIssues(cvData));

    issues.push(...this.getProjectQualityIssues(cvData));

    issues.push(...this.getCertificationQualityIssues(cvData));

    issues.push(...this.getLanguageQualityIssues(cvData));

    issues.push(...this.getReferenceQualityIssues(cvData));

    const fullContent = JSON.stringify(cvData);

    if (fullContent.length > 15_000) {
      issues.push(
        'The CV content is too long and should be shortened before generation.',
      );
    }

    if (context.hasTemplate && !context.templateAnalysis) {
      issues.push('The selected template has not been analyzed.');
    }

    return [...new Set(issues.map((issue) => issue.trim()).filter(Boolean))];
  }

  private getEducationQualityIssues(cvData: Record<string, unknown>): string[] {
    const value = cvData.education;

    if (!this.hasMeaningfulValue(value)) {
      return [];
    }

    const issues: string[] = [];

    const entries = this.readRecordArray(value);

    if (entries.length > 0) {
      entries.forEach((entry, index) => {
        const degree = this.readText(entry.degree);

        const institution = this.readText(entry.institution);

        const startDate = this.readText(entry.startDate);

        const endDate = this.readText(entry.endDate);

        if (!degree || !institution) {
          issues.push(
            `Education entry ${index + 1} needs both a degree and an institution.`,
          );
        }

        if (!startDate && !endDate) {
          issues.push(
            `Education entry ${index + 1} needs study dates or a graduation year.`,
          );
        }

        const educationText = this.flattenText(entry);

        if (
          educationText &&
          this.containsUnconfirmedEducationAbbreviation(educationText, cvData)
        ) {
          issues.push(
            `Education entry ${index + 1} contains an abbreviation that must be expanded and confirmed.`,
          );
        }
      });

      return issues;
    }

    const legacyEducation = this.flattenText(value);

    if (legacyEducation && legacyEducation.length < 20) {
      issues.push(
        'Education information is not detailed enough for a professional CV.',
      );
    }

    if (
      legacyEducation &&
      this.containsUnconfirmedEducationAbbreviation(legacyEducation, cvData)
    ) {
      issues.push('An education abbreviation must be expanded and confirmed.');
    }

    return issues;
  }

  private getExperienceQualityIssues(
    cvData: Record<string, unknown>,
  ): string[] {
    const value = this.hasMeaningfulValue(cvData.experiences)
      ? cvData.experiences
      : cvData.workExperience;

    if (!this.hasMeaningfulValue(value)) {
      return [];
    }

    const entries = this.readRecordArray(value);

    if (entries.length > 0) {
      const issues: string[] = [];

      entries.forEach((entry, index) => {
        if (!this.looksLikeProfessionalExperienceEntry(entry)) {
          issues.push(
            `Work-experience entry ${index + 1} needs a job title, company, dates, and factual responsibilities or achievements.`,
          );
        }
      });

      return issues;
    }

    const legacyExperience = this.flattenText(value);

    if (
      legacyExperience &&
      !this.looksLikeProfessionalExperience(legacyExperience)
    ) {
      return [
        'Work experience needs a title, company, dates or duration, and factual responsibilities.',
      ];
    }

    return [];
  }

  private getProjectQualityIssues(cvData: Record<string, unknown>): string[] {
    const value = cvData.projects;

    if (!this.hasMeaningfulValue(value)) {
      return [];
    }

    const entries = this.readRecordArray(value);

    if (entries.length === 0) {
      return ['Projects must use a valid structured format.'];
    }

    const issues: string[] = [];

    entries.forEach((entry, index) => {
      const name = this.readText(entry.name);

      const role = this.readText(entry.role);

      const description = this.readText(entry.description);

      const technologies = this.readStringList(entry.technologies);

      const url = this.readOptionalString(entry.url);

      if (!name) {
        issues.push(`Project entry ${index + 1} needs a project name.`);
      }

      if (!role && !description && technologies.length === 0) {
        issues.push(
          `Project entry ${index + 1} needs a role, description, or technologies.`,
        );
      }

      if (url && !this.looksLikeHttpUrl(url)) {
        issues.push(`Project entry ${index + 1} contains an invalid URL.`);
      }
    });

    return issues;
  }

  private getCertificationQualityIssues(
    cvData: Record<string, unknown>,
  ): string[] {
    const value = cvData.certifications;

    if (!this.hasMeaningfulValue(value)) {
      return [];
    }

    const entries = this.readRecordArray(value);

    if (entries.length === 0) {
      return ['Certifications must use a valid structured format.'];
    }

    const issues: string[] = [];

    entries.forEach((entry, index) => {
      const name = this.readText(entry.name);

      const credentialUrl = this.readOptionalString(entry.credentialUrl);

      if (!name) {
        issues.push(
          `Certification entry ${index + 1} needs a certification name.`,
        );
      }

      if (credentialUrl && !this.looksLikeHttpUrl(credentialUrl)) {
        issues.push(
          `Certification entry ${index + 1} contains an invalid credential URL.`,
        );
      }
    });

    return issues;
  }

  private getLanguageQualityIssues(cvData: Record<string, unknown>): string[] {
    const value = cvData.languages;

    if (!this.hasMeaningfulValue(value)) {
      return [];
    }

    const entries = this.readRecordArray(value);

    if (entries.length === 0) {
      return ['Languages must use a valid structured format.'];
    }

    const issues: string[] = [];

    entries.forEach((entry, index) => {
      const name = this.readText(entry.name);

      if (!name) {
        issues.push(`Language entry ${index + 1} needs a language name.`);
      }
    });

    return issues;
  }

  private getReferenceQualityIssues(cvData: Record<string, unknown>): string[] {
    const value = cvData.references;

    if (!this.hasMeaningfulValue(value)) {
      return [];
    }

    const entries = this.readRecordArray(value);

    if (entries.length === 0) {
      return ['References must use a valid structured format.'];
    }

    const issues: string[] = [];

    entries.forEach((entry, index) => {
      const name = this.readText(entry.name);

      const email = this.readOptionalString(entry.email);

      const phone = this.readOptionalString(entry.phone);

      if (!name) {
        issues.push(`Reference entry ${index + 1} needs the person's name.`);
      }

      if (email && !this.looksLikeEmail(email)) {
        issues.push(
          `Reference entry ${index + 1} contains an invalid email address.`,
        );
      }

      if (phone && !this.looksLikePhone(phone)) {
        issues.push(
          `Reference entry ${index + 1} contains an invalid phone number.`,
        );
      }
    });

    return issues;
  }

  private buildFallbackQuestion(
    state: CvAssistantPlanningState,
    context: CvAssistantPlanningContext,
  ): CvDynamicQuestion | null {
    if (state.pendingSuggestions.length > 0) {
      return context.currentQuestion;
    }

    if (context.editMode) {
      return this.buildEditFallbackQuestion(state, context);
    }

    const missingRequired = state.missingRequiredFields[0];

    if (missingRequired) {
      return this.buildRequiredQuestion(missingRequired);
    }

    const missingTemplateSection = state.missingTemplateSections[0];

    if (missingTemplateSection) {
      return {
        key: `complete_${missingTemplateSection}`,

        text: `Please provide complete professional information for the "${missingTemplateSection}" section shown in the selected template.`,

        type: CvAssistantQuestionType.LONG_TEXT,

        optional: false,
      };
    }

    const unresolvedOptional = state.unresolvedOptionalSections[0];

    if (unresolvedOptional === 'profilePhoto') {
      return {
        key: 'confirmPhotoPreference',

        text: 'Would you like to upload a professional profile photo, or continue without a photo?',

        type: CvAssistantQuestionType.CHOICE,

        optional: true,
      };
    }

    if (unresolvedOptional) {
      return {
        key: `resolveOptional_${unresolvedOptional}`,

        text: `Would you like to include ${this.getFriendlySectionName(
          unresolvedOptional,
        )}? Provide the information or reply "No" to continue without it.`,

        type: CvAssistantQuestionType.LONG_TEXT,

        optional: true,
      };
    }

    const qualityIssue = state.qualityIssues[0];

    if (qualityIssue) {
      return {
        key: 'resolveCvQualityIssue',

        text: `${qualityIssue} Please provide the missing or corrected information.`,

        type: CvAssistantQuestionType.LONG_TEXT,

        optional: false,
      };
    }

    return null;
  }

  private buildEditFallbackQuestion(
    state: CvAssistantPlanningState,
    context: CvAssistantPlanningContext,
  ): CvDynamicQuestion | null {
    const editFactsStatus = this.readText(
      context.collectedCvData.editFactsStatus,
    );

    if (editFactsStatus !== 'completed') {
      if (context.event === 'start') {
        return {
          key: 'editFactsRequest',

          text: 'Your existing CV information is loaded. What information would you like to change?',

          type: CvAssistantQuestionType.LONG_TEXT,

          optional: false,
        };
      }

      return {
        key: 'confirmFactualEditsComplete',

        text: 'The requested information has been updated. Would you like to change anything else? Reply "Done" or describe another factual change.',

        type: CvAssistantQuestionType.CHOICE,

        optional: false,
      };
    }

    if (
      context.editMode === CvAssistantEditMode.DESIGN_AND_FACTS &&
      !this.resolvePendingDesignInstruction(context, context.collectedCvData)
    ) {
      return {
        key: 'editDesignInstruction',

        text: 'Your CV information is updated. Now describe how you want the design to change, such as colors, typography, spacing, columns, layout, or overall visual style.',

        type: CvAssistantQuestionType.LONG_TEXT,

        optional: false,
      };
    }

    const missingRequired = state.missingRequiredFields[0];

    if (missingRequired) {
      return {
        key: `editRequired_${missingRequired}`,

        text: `The edited CV is missing required information for "${missingRequired}". Please provide the corrected information.`,

        type: CvAssistantQuestionType.LONG_TEXT,

        optional: false,
      };
    }

    const missingTemplateSection = state.missingTemplateSections[0];

    if (missingTemplateSection) {
      return {
        key: `editTemplate_${missingTemplateSection}`,

        text: `The edited CV left the template section "${missingTemplateSection}" incomplete. Please provide the information needed to complete that section.`,

        type: CvAssistantQuestionType.LONG_TEXT,

        optional: false,
      };
    }

    const qualityIssue = state.qualityIssues.find(
      (issue) =>
        !issue.includes('factual-edit step') &&
        !issue.includes('design instruction'),
    );

    if (qualityIssue) {
      return {
        key: 'resolveEditedCvQualityIssue',

        text: `${qualityIssue} Please provide the missing or corrected information for this edit.`,

        type: CvAssistantQuestionType.LONG_TEXT,

        optional: false,
      };
    }

    return null;
  }

  private buildRequiredQuestion(field: string): CvDynamicQuestion {
    const questions: Record<string, CvDynamicQuestion> = {
      fullName: {
        key: 'fullName',

        text: 'What is your full professional name?',

        type: CvAssistantQuestionType.TEXT,

        optional: false,
      },

      email: {
        key: 'email',

        text: 'What email address should appear on your CV?',

        type: CvAssistantQuestionType.EMAIL,

        optional: false,
      },

      phone: {
        key: 'phone',

        text: 'What phone number should appear on your CV?',

        type: CvAssistantQuestionType.PHONE,

        optional: false,
      },

      location: {
        key: 'location',

        text: 'What city and country should appear as your location?',

        type: CvAssistantQuestionType.TEXT,

        optional: false,
      },

      professionalTitleOrTargetJob: {
        key: 'professionalTitle',

        text: 'What professional title or target role should appear on your CV?',

        type: CvAssistantQuestionType.TEXT,

        optional: false,
      },

      education: {
        key: 'education',

        text: 'Please provide your full degree name, institution name, and study dates.',

        type: CvAssistantQuestionType.LONG_TEXT,

        optional: false,
      },

      skills: {
        key: 'skills',

        text: 'Please list the professional and technical skills you want included.',

        type: CvAssistantQuestionType.LIST,

        optional: false,
      },

      professionalBackground: {
        key: 'professionalBackground',

        text: 'Please describe your work experience, internship, projects, training, volunteering, or confirm that you are a fresher.',

        type: CvAssistantQuestionType.LONG_TEXT,

        optional: false,
      },
    };

    return (
      questions[field] ?? {
        key: field,

        text: `Please provide the required information for ${field}.`,

        type: CvAssistantQuestionType.LONG_TEXT,

        optional: false,
      }
    );
  }

  private isSectionComplete(
    section: string,
    cvData: Record<string, unknown>,
  ): boolean {
    const normalized = this.normalizeSectionKey(section);

    const sectionFields: Record<string, string[]> = {
      identity: ['fullName'],

      professionalTitle: ['professionalTitle', 'targetJob'],

      contact: ['email', 'phone', 'location'],

      professionalSummary: ['summary', 'professionalSummary'],

      workExperience: ['experiences', 'workExperience'],

      education: ['education'],

      skills: ['skills', 'technicalSkills', 'softSkills'],

      technicalSkills: ['skills', 'technicalSkills'],

      softSkills: ['skills', 'softSkills'],

      languages: ['languages'],

      projects: ['projects'],

      certifications: ['certifications'],

      training: ['training'],

      achievements: ['achievements'],

      publications: ['publications'],

      volunteering: ['volunteering'],

      interests: ['interests'],

      references: ['references'],

      linkedinUrl: ['linkedinUrl'],

      portfolioUrl: ['portfolioUrl'],

      designPreferences: ['designPreferences'],

      colorTheme: ['colorTheme'],
    };

    const fields = sectionFields[normalized] ?? [normalized];

    if (normalized === 'contact') {
      return fields.every((field) => this.hasMeaningfulValue(cvData[field]));
    }

    return fields.some((field) => this.hasMeaningfulValue(cvData[field]));
  }

  private canDeclineTemplateSection(
    section: string,
    cvData: Record<string, unknown>,
  ): boolean {
    const optionalSections = new Set([
      'professionalSummary',
      'languages',
      'projects',
      'certifications',
      'training',
      'achievements',
      'publications',
      'volunteering',
      'interests',
      'references',
      'profilePhoto',
    ]);

    if (optionalSections.has(section)) {
      return true;
    }

    if (section === 'workExperience') {
      const status = this.readText(cvData.professionalBackgroundStatus);

      return ['fresher', 'student', 'no_formal_experience'].includes(status);
    }

    return false;
  }

  private normalizeSectionKey(section: string): string {
    const normalized = section
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');

    const aliases: Record<string, string> = {
      profile: 'professionalSummary',
      'about me': 'professionalSummary',
      about: 'professionalSummary',
      objective: 'professionalSummary',
      summary: 'professionalSummary',
      'professional summary': 'professionalSummary',

      employment: 'workExperience',
      experience: 'workExperience',
      experiences: 'workExperience',
      'work experience': 'workExperience',
      'work history': 'workExperience',
      career: 'workExperience',

      education: 'education',
      qualifications: 'education',
      'academic background': 'education',

      expertise: 'skills',
      competencies: 'skills',
      skill: 'skills',
      skills: 'skills',

      language: 'languages',
      languages: 'languages',
      'language proficiency': 'languages',

      project: 'projects',
      projects: 'projects',

      certification: 'certifications',
      certifications: 'certifications',

      course: 'training',
      courses: 'training',
      workshop: 'training',
      workshops: 'training',
      training: 'training',

      award: 'achievements',
      awards: 'achievements',
      honor: 'achievements',
      honors: 'achievements',
      achievements: 'achievements',

      volunteer: 'volunteering',
      volunteering: 'volunteering',

      publication: 'publications',
      publications: 'publications',

      interest: 'interests',
      interests: 'interests',

      reference: 'references',
      references: 'references',

      photo: 'profilePhoto',
      'profile photo': 'profilePhoto',
      profilephoto: 'profilePhoto',

      header: 'identity',
      identity: 'identity',
      name: 'identity',

      contact: 'contact',
      'contact information': 'contact',
      'contact details': 'contact',

      title: 'professionalTitle',
      'professional title': 'professionalTitle',
    };

    return aliases[normalized] ?? section.trim();
  }

  private normalizeDataFieldKey(key: string): string {
    const aliases: Record<string, string> = {
      professionalSummary: 'summary',
      workExperience: 'experiences',
      targetJob: 'professionalTitle',
      technicalSkills: 'skills',
      softSkills: 'skills',
    };

    return aliases[key] ?? key;
  }

  private containsUnconfirmedEducationAbbreviation(
    education: string,
    cvData: Record<string, unknown>,
  ): boolean {
    const confirmed = this.readStringList(
      cvData.assistantConfirmedAbbreviations,
    )
      .join(' ')
      .toLowerCase();

    const knownAbbreviations = ['AIUB', 'CSE'];

    return knownAbbreviations.some(
      (abbreviation) =>
        new RegExp(`\\b${abbreviation}\\b`, 'i').test(education) &&
        !confirmed.includes(abbreviation.toLowerCase()),
    );
  }

  private looksLikeProfessionalExperienceEntry(
    entry: Record<string, unknown>,
  ): boolean {
    const jobTitle = this.readText(entry.jobTitle);

    const company = this.readText(entry.company);

    const startDate = this.readText(entry.startDate);

    const endDate = this.readText(entry.endDate);

    const isCurrent = entry.isCurrent === true;

    const description = this.readText(entry.description);

    const achievements = this.readStringList(entry.achievements);

    const hasDates = Boolean(startDate && (endDate || isCurrent));

    const hasWorkDetails = description.length >= 20 || achievements.length > 0;

    return Boolean(jobTitle && company && hasDates && hasWorkDetails);
  }

  private looksLikeProfessionalExperience(value: string): boolean {
    const normalized = value.toLowerCase();

    const hasDuration =
      /\b(19|20)\d{2}\b/.test(normalized) ||
      /\b(month|months|year|years|present|current)\b/.test(normalized);

    const hasWorkDetail =
      /\b(developed|built|implemented|integrated|designed|maintained|tested|collaborated|managed|created|supported|worked on|responsible for)\b/.test(
        normalized,
      );

    return value.trim().length >= 50 && hasDuration && hasWorkDetail;
  }

  private looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }
  private looksLikeHttpUrl(value: string): boolean {
    try {
      const parsedUrl = new URL(value.trim());

      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private looksLikePhone(value: string): boolean {
    const digits = value.replace(/\D/g, '');

    return digits.length >= 7;
  }

  private isEditFlowReady(
    context: CvAssistantPlanningContext,
    cvData: Record<string, unknown>,
  ): boolean {
    if (!context.editMode) {
      return true;
    }

    if (!context.sourceGenerationId) {
      return false;
    }

    if (this.readText(cvData.editFactsStatus) !== 'completed') {
      return false;
    }

    if (context.editMode === CvAssistantEditMode.DESIGN_AND_FACTS) {
      return Boolean(this.resolvePendingDesignInstruction(context, cvData));
    }

    return true;
  }

  private resolvePendingDesignInstruction(
    context: CvAssistantPlanningContext,
    cvData: Record<string, unknown>,
  ): string | null {
    const contextValue = this.readOptionalString(
      context.pendingDesignInstruction,
    );

    if (contextValue) {
      return contextValue;
    }

    return this.readOptionalString(cvData.pendingDesignInstruction);
  }

  private isStructuredArrayField(key: string): boolean {
    return new Set([
      'experiences',
      'education',
      'languages',
      'certifications',
      'projects',
      'references',
    ]).has(key);
  }

  private normalizeExtractedValue(value: CvExtractedValue): CvExtractedValue {
    if (value === null) {
      return null;
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    if (Array.isArray(value)) {
      const stringItems = value.filter(
        (item): item is string => typeof item === 'string',
      );

      if (stringItems.length === value.length) {
        return this.normalizeStringArray(stringItems);
      }

      return value
        .filter((item): item is Record<string, unknown> => this.isRecord(item))
        .map((item) => this.cloneRecord(item));
    }

    if (this.isRecord(value)) {
      return this.cloneRecord(value);
    }

    return null;
  }

  private stripOperationMetadata(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    const clonedValue = this.cloneRecord(value);

    delete clonedValue.itemIndex;

    return clonedValue;
  }

  private readItemIndex(value: Record<string, unknown>): number | null {
    const itemIndex = value.itemIndex;

    return typeof itemIndex === 'number' &&
      Number.isInteger(itemIndex) &&
      itemIndex >= 0
      ? itemIndex
      : null;
  }

  private recordMatchesSelector(
    record: Record<string, unknown>,
    selector: Record<string, unknown>,
  ): boolean {
    const selectorEntries = Object.entries(selector).filter(([, value]) =>
      this.hasMeaningfulValue(value),
    );

    if (selectorEntries.length === 0) {
      return false;
    }

    return selectorEntries.every(([key, expectedValue]) => {
      const actualValue = record[key];

      if (
        typeof expectedValue === 'string' &&
        typeof actualValue === 'string'
      ) {
        return (
          actualValue.trim().toLowerCase() ===
          expectedValue.trim().toLowerCase()
        );
      }

      return JSON.stringify(actualValue) === JSON.stringify(expectedValue);
    });
  }

  private mergeUniqueStrings(existing: string[], incoming: string[]): string[] {
    const result: string[] = [];

    const seen = new Set<string>();

    for (const item of [...existing, ...incoming]) {
      const normalized = item.trim();

      const comparisonKey = normalized.toLowerCase();

      if (!normalized || seen.has(comparisonKey)) {
        continue;
      }

      seen.add(comparisonKey);

      result.push(normalized);
    }

    return result;
  }

  private mergeUniqueObjects(
    existing: Record<string, unknown>[],
    incoming: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    const result = existing.map((item) => this.cloneRecord(item));

    const seen = new Set(
      result.map((item) => JSON.stringify(this.sortRecord(item))),
    );

    for (const item of incoming) {
      const clonedItem = this.cloneRecord(item);

      const comparisonKey = JSON.stringify(this.sortRecord(clonedItem));

      if (seen.has(comparisonKey)) {
        continue;
      }

      seen.add(comparisonKey);

      result.push(clonedItem);
    }

    return result;
  }

  private sortRecord(value: Record<string, unknown>): Record<string, unknown> {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = value[key];

        return result;
      }, {});
  }

  private hasAnyMeaningfulValue(
    data: Record<string, unknown>,
    keys: string[],
  ): boolean {
    return keys.some((key) => this.hasMeaningfulValue(data[key]));
  }

  private hasMeaningfulValue(value: unknown): boolean {
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.some((item) => this.hasMeaningfulValue(item));
    }

    if (value && typeof value === 'object') {
      return Object.keys(value).length > 0;
    }

    return value === true || typeof value === 'number';
  }

  private readStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return this.normalizeStringArray(value);
  }

  private normalizeStringArray(values: unknown[]): string[] {
    return [
      ...new Set(
        values
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  }

  private readRecordArray(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is Record<string, unknown> => this.isRecord(item))
      .map((item) => this.cloneRecord(item));
  }

  private readText(value: unknown): string {
    return this.flattenText(value).toLowerCase();
  }

  private readOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    return value.trim() || null;
  }

  private flattenText(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => this.flattenText(item))
        .filter(Boolean)
        .join('\n');
    }

    if (this.isRecord(value)) {
      return Object.values(value)
        .map((item) => this.flattenText(item))
        .filter(Boolean)
        .join('\n');
    }

    return '';
  }

  private cloneRecord(value: unknown): Record<string, unknown> {
    if (!this.isRecord(value)) {
      return {};
    }

    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private cloneValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private getFriendlySectionName(section: string): string {
    const names: Record<string, string> = {
      professionalSummary: 'a professional summary',

      projects: 'projects',

      certifications: 'certifications',

      languages: 'languages',

      achievements: 'achievements',

      linkedinUrl: 'a LinkedIn profile',

      portfolioUrl: 'a portfolio link',

      interests: 'interests',

      references: 'references',

      designPreferences: 'design preferences',

      colorTheme: 'a preferred color theme',
    };

    return names[section] ?? section;
  }

  evaluatePlanningState(
    context: CvAssistantPlanningContext,
  ): CvAssistantPlanningState {
    return this.buildPlanningState(context, context.collectedCvData);
  }
}
