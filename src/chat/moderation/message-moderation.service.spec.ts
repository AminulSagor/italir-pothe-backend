import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageKeywordScannerService } from './message-keyword-scanner.service';
import { MessageModerationLlmService } from './message-moderation-llm.service';
import { MessageModerationService } from './message-moderation.service';

describe('MessageModerationService', () => {
  const createService = (
    classify: jest.Mock,
    config: Record<string, string> = {},
  ) => {
    const configService = new ConfigService({
      CHAT_MODERATION_ENABLED: 'true',
      ...config,
    });
    const scanner = new MessageKeywordScannerService(configService);
    const llm = { classify } as unknown as MessageModerationLlmService;
    return new MessageModerationService(scanner, llm, configService);
  };

  it('stays disabled when the rollout flag is false', async () => {
    const classify = jest.fn();
    const service = createService(classify, {
      CHAT_MODERATION_ENABLED: 'false',
    });

    await expect(service.moderate('I will kill you')).resolves.toMatchObject({
      action: 'safe',
      source: 'local',
    });
    expect(classify).not.toHaveBeenCalled();
  });

  it('does not call the LLM for locally safe text', async () => {
    const classify = jest.fn();
    const service = createService(classify);

    await expect(
      service.moderate('Hello, how are you?'),
    ).resolves.toMatchObject({
      action: 'safe',
      source: 'local',
    });
    expect(classify).not.toHaveBeenCalled();
  });

  it('keeps a low-confidence classification safe', async () => {
    const classify = jest.fn().mockResolvedValue({
      action: 'block',
      confidence: 0.7,
      categories: ['threat'],
      reason: 'Ambiguous',
    });
    const service = createService(classify);

    await expect(service.moderate('I will kill you')).resolves.toMatchObject({
      action: 'safe',
      source: 'llm',
    });
  });

  it('returns a high-confidence warning', async () => {
    const classify = jest.fn().mockResolvedValue({
      action: 'warn',
      confidence: 0.96,
      categories: ['harassment'],
      reason: 'Targeted abuse',
    });
    const service = createService(classify);

    await expect(service.moderate('go die')).resolves.toMatchObject({
      action: 'warn',
      confidence: 0.96,
      source: 'llm',
    });
  });

  it('fails open and logs when the LLM times out', async () => {
    const classify = jest.fn().mockRejectedValue(
      Object.assign(new Error('Request timed out'), {
        name: 'APIConnectionTimeoutError',
      }),
    );
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const service = createService(classify);

    await expect(service.moderate('I will kill you')).resolves.toMatchObject({
      action: 'safe',
      source: 'fail_open',
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed open'));
    warn.mockRestore();
  });
});
