import { ProtectQuizSessionResumeProgress1788076800000 } from './1788076800000-ProtectQuizSessionResumeProgress';

describe('ProtectQuizSessionResumeProgress migration', () => {
  it('repairs duplicates and creates a partial active-session index', async () => {
    const queries: string[] = [];
    const migration = new ProtectQuizSessionResumeProgress1788076800000();

    await migration.up({
      query: async (sql: string) => {
        queries.push(sql);
      },
    } as never);

    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain('UPDATE "quiz_attempt_answers"');
    expect(queries[0]).not.toContain('DELETE');
    expect(queries[1]).toContain('SET "status" = \'cancelled\'');
    expect(queries[2]).toContain(
      'CREATE UNIQUE INDEX "UQ_quiz_sessions_active_user_quiz_lesson"',
    );
    expect(queries[2]).toContain('WHERE "status" = \'in_progress\'');
  });
});
