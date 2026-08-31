import { ConfigService } from '@nestjs/config';
import { MessageKeywordScannerService } from './message-keyword-scanner.service';

describe('MessageKeywordScannerService', () => {
  it('does not flag ordinary messages', () => {
    const scanner = new MessageKeywordScannerService(new ConfigService({}));

    expect(scanner.scan('Can we study together tomorrow?')).toEqual({
      suspicious: false,
      categories: [],
      matchedTerms: [],
    });
  });

  it('normalizes punctuation and simple obfuscation', () => {
    const scanner = new MessageKeywordScannerService(new ConfigService({}));

    const result = scanner.scan('I will k1ll-you');

    expect(result.suspicious).toBe(true);
    expect(result.categories).toContain('threat');
  });

  it('uses configured category terms instead of defaults', () => {
    const scanner = new MessageKeywordScannerService(
      new ConfigService({ CHAT_MODERATION_KEYWORDS_PROFANITY: 'customword' }),
    );

    expect(scanner.scan('customword').categories).toContain('profanity');
    expect(scanner.scan('shit').categories).not.toContain('profanity');
  });

  it('keeps defaults when an environment value is empty', () => {
    const scanner = new MessageKeywordScannerService(
      new ConfigService({ CHAT_MODERATION_KEYWORDS_THREAT: '' }),
    );

    expect(scanner.scan('I will kill you').categories).toContain('threat');
  });
});
