import { VocabularyMasteryStatus } from '../entities/user-vocabulary-progress.entity';
import {
  VocabularyReviewMode,
  VocabularyReviewSessionStatus,
} from '../entities/vocabulary-review-session.entity';

export interface VocabularyFlashcardItem {
  id: string;
  italianWord: string;
  englishMeaning: string;
  englishExample: string | null;
  aiPronunciationFileId: string | null;
  masteryStatus: VocabularyMasteryStatus;
}

export interface VocabularyFlashcardListResponse {
  lessonId: string;
  totalCards: number;
  cards: VocabularyFlashcardItem[];
}

export interface VocabularyReviewSessionResponse {
  id: string;
  lessonId: string;
  mode: VocabularyReviewMode;
  status: VocabularyReviewSessionStatus;
  totalCards: number;
  knownCount: number;
  weakCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface VocabularyReviewSummaryResponse {
  sessionId: string;
  lessonId: string;
  totalReviewed: number;
  knownCount: number;
  weakCount: number;
  weakWords: VocabularyFlashcardItem[];
  allKnown: boolean;
}
