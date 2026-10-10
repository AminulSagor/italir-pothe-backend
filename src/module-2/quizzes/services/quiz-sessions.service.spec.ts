import { LearningActivityType } from 'src/module-2/daily-challenges/types/daily-challenge.type';

import { QuizAttemptAnswer } from '../entities/quiz-attempt-answer.entity';
import { QuizQuestion } from '../entities/quiz-question.entity';
import { QuizQuestionFormat } from '../types/quiz-question-format.type';
import { QuizSessionsService } from './quiz-sessions.service';

describe('QuizSessionsService daily challenge activities', () => {
  const buildRequests = async (params: {
    questionType: QuizQuestionFormat;
    isCorrect: boolean;
    mediaFileId?: string | null;
    generatedAudioText?: string | null;
  }) => {
    const recordInternalActivity = jest.fn().mockResolvedValue(true);
    const service = Object.create(QuizSessionsService.prototype) as object;
    Object.defineProperty(service, 'dailyChallengesService', {
      value: { recordInternalActivity },
    });

    const requests = (
      service as {
        buildPerQuestionActivityRequests: (input: {
          userId: string;
          sessionId: string;
          questions: QuizQuestion[];
          answers: QuizAttemptAnswer[];
          clientActivityDate?: string;
        }) => Promise<boolean>[];
      }
    ).buildPerQuestionActivityRequests({
      userId: 'user-1',
      sessionId: 'session-1',
      clientActivityDate: '2026-10-11',
      questions: [
        {
          id: 'question-1',
          questionType: params.questionType,
          mediaFileId: params.mediaFileId ?? null,
          generatedAudioText: params.generatedAudioText ?? null,
        } as QuizQuestion,
      ],
      answers: [
        {
          questionId: 'question-1',
          isCorrect: params.isCorrect,
        } as QuizAttemptAnswer,
      ],
    });

    await Promise.all(requests);
    return recordInternalActivity;
  };

  it('counts a correct Listening MCQ with uploaded audio', async () => {
    const recordInternalActivity = await buildRequests({
      questionType: QuizQuestionFormat.LISTENING_MCQ,
      isCorrect: true,
      mediaFileId: 'audio-file-1',
    });

    expect(recordInternalActivity).toHaveBeenCalledWith({
      userId: 'user-1',
      activityType: LearningActivityType.QUIZ_LISTENING_MCQ_CORRECT,
      sourceId: 'quiz-session:session-1:question:question-1',
      value: 1,
      clientActivityDate: '2026-10-11',
      metadata: { dedupeAcrossDates: true },
    });
  });

  it('counts a correct Listening MCQ with generated audio', async () => {
    const recordInternalActivity = await buildRequests({
      questionType: QuizQuestionFormat.LISTENING_MCQ,
      isCorrect: true,
      generatedAudioText: 'Ascolta questa frase',
    });

    expect(recordInternalActivity).toHaveBeenCalledTimes(1);
  });

  it('does not count True/False or incorrect Listening MCQ answers', async () => {
    const trueFalseActivity = await buildRequests({
      questionType: QuizQuestionFormat.TRUE_FALSE,
      isCorrect: true,
      mediaFileId: 'audio-file-1',
    });
    const incorrectListeningActivity = await buildRequests({
      questionType: QuizQuestionFormat.LISTENING_MCQ,
      isCorrect: false,
      mediaFileId: 'audio-file-1',
    });

    expect(trueFalseActivity).not.toHaveBeenCalled();
    expect(incorrectListeningActivity).not.toHaveBeenCalled();
  });
});
