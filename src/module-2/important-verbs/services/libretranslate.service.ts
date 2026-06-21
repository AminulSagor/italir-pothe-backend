import { setTimeout as delay } from "node:timers/promises";

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { sha256 } from "../utils/data-source.util";

type LibreTranslateResponse = {
  translatedText?: string | string[];
  detectedLanguage?:
    | {
        confidence?: number;
        language?: string;
      }
    | Array<{
        confidence?: number;
        language?: string;
      }>;
};

type LibreTranslateLanguage = {
  code?: string;
  name?: string;
  targets?: string[];
};

@Injectable()
export class LibreTranslateService {
  private readonly logger = new Logger(LibreTranslateService.name);
  private languagePairVerified = false;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    const enabled =
      this.configService.get<string>("LIBRETRANSLATE_ENABLED") !== "false";
    const endpoint = this.getEndpoint();

    return enabled && Boolean(endpoint);
  }

  /**
   * Namespaces the source hash so an old Azure-generated translation is
   * regenerated once when this provider is introduced. After that, unchanged
   * English source text is skipped on future syncs.
   */
  buildTranslationSourceHash(text: string): string {
    return sha256({
      provider: "libretranslate",
      pipelineVersion:
        this.configService.get<string>("LIBRETRANSLATE_PIPELINE_VERSION") ??
        "v1",
      sourceLanguage: this.getSourceLanguage(),
      targetLanguage: this.getTargetLanguage(),
      text: text.trim(),
    });
  }

  async translateEnglishToBangla(
    texts: string[],
  ): Promise<Array<string | null>> {
    if (!this.isConfigured() || texts.length === 0) {
      return texts.map(() => null);
    }

    await this.verifyLanguagePair();

    const normalizedTexts = texts.map((text) => text.trim());
    const uniqueTexts = [
      ...new Set(normalizedTexts.filter((text) => text.length > 0)),
    ];
    const translatedBySource = new Map<string, string | null>();
    const batches = this.buildBatches(uniqueTexts);
    const requestDelayMs = this.getPositiveInteger(
      "LIBRETRANSLATE_REQUEST_DELAY_MS",
      100,
      0,
    );

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const translated = await this.translateBatch(batch);

      batch.forEach((source, itemIndex) => {
        translatedBySource.set(source, translated[itemIndex] ?? null);
      });

      if (requestDelayMs > 0 && index < batches.length - 1) {
        await delay(requestDelayMs);
      }
    }

    return normalizedTexts.map((text) => {
      if (!text) return null;
      return translatedBySource.get(text) ?? null;
    });
  }

  private async verifyLanguagePair(): Promise<void> {
    if (this.languagePairVerified) return;

    const endpoint = this.getEndpoint();
    const url = new URL(`${endpoint}/languages`);
    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `LibreTranslate language check failed with HTTP ${response.status}: ${body.slice(0, 500)}`,
      );
    }

    const languages = (await response.json()) as LibreTranslateLanguage[];
    const sourceLanguage = this.getSourceLanguage();
    const targetLanguage = this.getTargetLanguage();
    const source = languages.find(
      (language) => language.code === sourceLanguage,
    );
    const targetExists = languages.some(
      (language) => language.code === targetLanguage,
    );

    if (!source || !targetExists) {
      throw new Error(
        `LibreTranslate does not have the required ${sourceLanguage} -> ${targetLanguage} languages loaded. Start it with --load-only ${sourceLanguage},${targetLanguage}.`,
      );
    }

    if (
      Array.isArray(source.targets) &&
      source.targets.length > 0 &&
      !source.targets.includes(targetLanguage)
    ) {
      throw new Error(
        `LibreTranslate does not expose a ${sourceLanguage} -> ${targetLanguage} translation path.`,
      );
    }

    this.languagePairVerified = true;
  }

  private buildBatches(texts: string[]): string[][] {
    const maximumItems = this.getPositiveInteger(
      "LIBRETRANSLATE_BATCH_SIZE",
      20,
      1,
    );
    const maximumCharacters = this.getPositiveInteger(
      "LIBRETRANSLATE_BATCH_MAX_CHARACTERS",
      8000,
      1,
    );
    const batches: string[][] = [];
    let current: string[] = [];
    let currentCharacters = 0;

    for (const text of texts) {
      const nextCharacters = currentCharacters + text.length;

      if (
        current.length >= maximumItems ||
        (current.length > 0 && nextCharacters > maximumCharacters)
      ) {
        batches.push(current);
        current = [];
        currentCharacters = 0;
      }

      current.push(text);
      currentCharacters += text.length;
    }

    if (current.length > 0) {
      batches.push(current);
    }

    return batches;
  }

  private async translateBatch(texts: string[]): Promise<Array<string | null>> {
    if (texts.length === 0) return [];

    try {
      const payload = await this.requestWithRetry(texts);
      const translated = this.extractTranslations(payload, texts.length);

      if (translated) {
        return this.validateTranslations(texts, translated);
      }
    } catch (error) {
      if (texts.length === 1) throw error;

      this.logger.warn(
        `LibreTranslate batch request failed; retrying ${texts.length} items individually. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const results: Array<string | null> = [];

    for (const text of texts) {
      const payload = await this.requestWithRetry([text]);
      const translated = this.extractTranslations(payload, 1);

      if (!translated) {
        results.push(null);
        continue;
      }

      results.push(this.validateTranslations([text], translated)[0] ?? null);
    }

    return results;
  }

  private async requestWithRetry(
    texts: string[],
  ): Promise<LibreTranslateResponse> {
    const maximumAttempts = this.getPositiveInteger(
      "LIBRETRANSLATE_MAX_RETRIES",
      4,
      1,
    );
    const endpoint = this.getEndpoint();
    const url = new URL(`${endpoint}/translate`);
    const apiKey = this.configService
      .get<string>("LIBRETRANSLATE_API_KEY")
      ?.trim();

    const requestBody: Record<string, unknown> = {
      q: texts.length === 1 ? texts[0] : texts,
      source: this.getSourceLanguage(),
      target: this.getTargetLanguage(),
      format: "text",
      alternatives: 0,
    };

    if (apiKey) {
      requestBody.api_key = apiKey;
    }

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          return (await response.json()) as LibreTranslateResponse;
        }

        const body = await response.text();
        const retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;

        if (!retryable || attempt === maximumAttempts) {
          throw new Error(
            `LibreTranslate failed with HTTP ${response.status}: ${body.slice(0, 1000)}`,
          );
        }

        const waitMilliseconds = this.resolveRetryDelay(
          response.headers.get("retry-after"),
          attempt,
        );

        this.logger.warn(
          `LibreTranslate returned HTTP ${response.status}; retrying in ${waitMilliseconds}ms.`,
        );
        await delay(waitMilliseconds);
      } catch (error) {
        if (attempt === maximumAttempts) {
          throw error;
        }

        const waitMilliseconds = 1000 * 2 ** (attempt - 1);
        this.logger.warn(
          `LibreTranslate request failed; retrying in ${waitMilliseconds}ms. ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await delay(waitMilliseconds);
      }
    }

    throw new Error("LibreTranslate retry loop ended unexpectedly.");
  }

  private extractTranslations(
    payload: LibreTranslateResponse,
    expectedCount: number,
  ): string[] | null {
    const value = payload.translatedText;

    if (typeof value === "string") {
      return expectedCount === 1 ? [value] : null;
    }

    if (!Array.isArray(value) || value.length !== expectedCount) {
      return null;
    }

    return value.map((item) => String(item));
  }

  private validateTranslations(
    sourceTexts: string[],
    translatedTexts: string[],
  ): Array<string | null> {
    return sourceTexts.map((source, index) => {
      const translated = translatedTexts[index]?.trim();

      if (!translated || !this.containsBangla(translated)) {
        this.logger.warn(
          `LibreTranslate returned an invalid Bengali translation for "${source.slice(0, 80)}".`,
        );
        return null;
      }

      return translated;
    });
  }

  private async fetchWithTimeout(
    input: URL,
    init: RequestInit,
  ): Promise<Response> {
    const timeoutMs = this.getPositiveInteger(
      "LIBRETRANSLATE_TIMEOUT_MS",
      120000,
      1000,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `LibreTranslate request timed out after ${timeoutMs}ms.`,
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveRetryDelay(
    retryAfterHeader: string | null,
    attempt: number,
  ): number {
    const retryAfterSeconds = Number(retryAfterHeader ?? "");

    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.max(1000, retryAfterSeconds * 1000);
    }

    return 1000 * 2 ** (attempt - 1);
  }

  private getEndpoint(): string {
    return (
      this.configService.get<string>("LIBRETRANSLATE_ENDPOINT") ??
      "http://127.0.0.1:5000"
    )
      .trim()
      .replace(/\/+$/, "");
  }

  private getSourceLanguage(): string {
    return (
      this.configService.get<string>("LIBRETRANSLATE_SOURCE_LANGUAGE") ?? "en"
    ).trim();
  }

  private getTargetLanguage(): string {
    return (
      this.configService.get<string>("LIBRETRANSLATE_TARGET_LANGUAGE") ?? "bn"
    ).trim();
  }

  private getPositiveInteger(
    key: string,
    fallback: number,
    minimum: number,
  ): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    if (!Number.isFinite(value)) return fallback;

    return Math.max(minimum, Math.floor(value));
  }

  private containsBangla(value: string): boolean {
    return /[\u0980-\u09FF]/u.test(value);
  }
}
