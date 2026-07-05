import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT } from 'google-auth-library';
import { createHash } from 'node:crypto';

import type {
  GooglePlayProductPurchaseV2,
  VerifiedGooglePlayOneTimeProduct,
  VerifyGooglePlayOneTimeProductParams,
} from './google-play-billing.type';

const ANDROID_PUBLISHER_SCOPE =
  'https://www.googleapis.com/auth/androidpublisher';

@Injectable()
export class GooglePlayBillingService implements OnModuleInit {
  private readonly logger = new Logger(GooglePlayBillingService.name);

  private readonly packageName: string;

  private readonly verificationMode: string;

  private authClient: JWT | null = null;

  constructor(private readonly configService: ConfigService) {
    this.packageName =
      this.configService.get<string>('GOOGLE_PLAY_PACKAGE_NAME')?.trim() ?? '';

    this.verificationMode =
      this.configService
        .get<string>('GOOGLE_PLAY_VERIFICATION_MODE')
        ?.trim()
        .toLowerCase() ?? 'development';
  }

  onModuleInit(): void {
    if (this.verificationMode !== 'real') {
      this.logger.warn(
        'Google Play real verification is disabled. ' +
          `Current mode: ${this.verificationMode}`,
      );

      return;
    }

    this.assertProductionConfiguration();

    /*
     * Construct the JWT client during application startup so an invalid
     * credential configuration fails before the first purchase request.
     */
    this.getAuthClient();

    this.logger.log(
      `Google Play verification enabled for ${this.packageName}.`,
    );
  }

  isRealVerificationEnabled(): boolean {
    return this.verificationMode === 'real';
  }

  hashPurchaseToken(purchaseToken: string): string {
    const normalizedToken = purchaseToken.trim();

    if (!normalizedToken) {
      throw new BadRequestException('Google Play purchase token is required.');
    }

    return createHash('sha256').update(normalizedToken).digest('hex');
  }

  /**
   * Retrieves the authoritative purchase state from Google Play.
   *
   * This method must be called before granting an entitlement.
   */
  async verifyOneTimeProduct(
    params: VerifyGooglePlayOneTimeProductParams,
  ): Promise<VerifiedGooglePlayOneTimeProduct> {
    this.assertRealVerificationEnabled();

    const purchaseToken = params.purchaseToken.trim();
    const expectedProductId = params.expectedProductId.trim();

    if (!purchaseToken) {
      throw new BadRequestException('Google Play purchase token is required.');
    }

    if (!expectedProductId) {
      throw new BadRequestException('Google Play product ID is required.');
    }

    const response = await this.googleRequest<GooglePlayProductPurchaseV2>({
      method: 'GET',
      url: this.buildProductV2Url(purchaseToken),
    });

    const purchaseState =
      response.purchaseStateContext?.purchaseState ??
      'PURCHASE_STATE_UNSPECIFIED';

    if (purchaseState === 'PENDING') {
      throw new ConflictException('The Google Play purchase is still pending.');
    }

    if (purchaseState === 'CANCELLED') {
      throw new BadRequestException('The Google Play purchase was cancelled.');
    }

    if (purchaseState !== 'PURCHASED') {
      throw new BadRequestException(
        `Unsupported Google Play purchase state: ${purchaseState}.`,
      );
    }

    const lineItems = response.productLineItem ?? [];

    if (lineItems.length === 0) {
      throw new BadRequestException(
        'Google Play returned no product line item for this purchase.',
      );
    }

    const matchedLineItem = lineItems.find(
      (lineItem) => lineItem.productId === expectedProductId,
    );

    if (!matchedLineItem) {
      throw new BadRequestException(
        'The verified Google Play product does not match the requested product.',
      );
    }

    /*
     * Italir Pothe currently creates one internal order for one store
     * product. Reject a token containing a different product line item.
     */
    const containsUnexpectedProduct = lineItems.some(
      (lineItem) => lineItem.productId !== expectedProductId,
    );

    if (containsUnexpectedProduct) {
      throw new BadRequestException(
        'The Google Play purchase contains an unexpected product.',
      );
    }

    const offerDetails = matchedLineItem.productOfferDetails;

    const purchaseOptionId = offerDetails?.purchaseOptionId ?? null;

    if (
      params.expectedPurchaseOptionId &&
      purchaseOptionId !== params.expectedPurchaseOptionId
    ) {
      throw new BadRequestException(
        'The Google Play purchase option does not match the order.',
      );
    }

    if (
      params.expectedObfuscatedAccountId &&
      response.obfuscatedExternalAccountId &&
      response.obfuscatedExternalAccountId !==
        params.expectedObfuscatedAccountId
    ) {
      throw new BadRequestException(
        'The Google Play purchase belongs to a different application user.',
      );
    }

    if (!response.purchaseCompletionTime) {
      throw new BadRequestException(
        'Google Play did not return a completed purchase time.',
      );
    }

    return {
      provider: 'google_play',

      packageName: this.packageName,

      productId: expectedProductId,

      purchaseOptionId,

      offerId: offerDetails?.offerId ?? null,

      orderId: response.orderId ?? null,

      purchaseTokenHash: this.hashPurchaseToken(purchaseToken),

      purchaseState: 'PURCHASED',

      acknowledgementState:
        response.acknowledgementState ?? 'ACKNOWLEDGEMENT_STATE_UNSPECIFIED',

      consumptionState:
        offerDetails?.consumptionState ?? 'CONSUMPTION_STATE_UNSPECIFIED',

      quantity: offerDetails?.quantity ?? 1,

      refundableQuantity: offerDetails?.refundableQuantity ?? null,

      purchaseCompletionTime: response.purchaseCompletionTime,

      regionCode: response.regionCode ?? null,

      obfuscatedExternalAccountId: response.obfuscatedExternalAccountId ?? null,

      obfuscatedExternalProfileId: response.obfuscatedExternalProfileId ?? null,

      isTestPurchase: response.testPurchaseContext?.fopType === 'TEST',
    };
  }

  /**
   * Use for consumable one-time products:
   * - AI bundles
   * - CV credit packages
   * - finite streak freezes
   */
  async consumeOneTimeProduct(params: {
    productId: string;
    purchaseToken: string;
  }): Promise<{
    consumed: true;
    alreadyConsumed: boolean;
  }> {
    this.assertRealVerificationEnabled();

    const productId = params.productId.trim();
    const purchaseToken = params.purchaseToken.trim();

    if (!productId || !purchaseToken) {
      throw new BadRequestException(
        'Google Play product ID and purchase token are required.',
      );
    }

    const currentPurchase = await this.verifyOneTimeProduct({
      expectedProductId: productId,
      purchaseToken,
    });

    if (currentPurchase.consumptionState === 'CONSUMPTION_STATE_CONSUMED') {
      return {
        consumed: true,
        alreadyConsumed: true,
      };
    }

    try {
      await this.googleRequest<void>({
        method: 'POST',
        url: this.buildConsumeUrl(productId, purchaseToken),
        data: {},
      });

      return {
        consumed: true,
        alreadyConsumed: false,
      };
    } catch (error) {
      /*
       * The first request may have succeeded while the HTTP response was
       * lost. Re-read the authoritative state before reporting failure.
       */
      const refreshedPurchase = await this.verifyOneTimeProduct({
        expectedProductId: productId,
        purchaseToken,
      });

      if (refreshedPurchase.consumptionState === 'CONSUMPTION_STATE_CONSUMED') {
        return {
          consumed: true,
          alreadyConsumed: true,
        };
      }

      throw error;
    }
  }

  /**
   * Use for durable/non-consumable one-time products:
   * - lifetime course purchases
   */
  async acknowledgeOneTimeProduct(params: {
    productId: string;
    purchaseToken: string;
  }): Promise<{
    acknowledged: true;
    alreadyAcknowledged: boolean;
  }> {
    this.assertRealVerificationEnabled();

    const productId = params.productId.trim();
    const purchaseToken = params.purchaseToken.trim();

    if (!productId || !purchaseToken) {
      throw new BadRequestException(
        'Google Play product ID and purchase token are required.',
      );
    }

    const currentPurchase = await this.verifyOneTimeProduct({
      expectedProductId: productId,
      purchaseToken,
    });

    if (
      currentPurchase.acknowledgementState ===
      'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
    ) {
      return {
        acknowledged: true,
        alreadyAcknowledged: true,
      };
    }

    try {
      await this.googleRequest<void>({
        method: 'POST',
        url: this.buildAcknowledgeUrl(productId, purchaseToken),
        data: {},
      });

      return {
        acknowledged: true,
        alreadyAcknowledged: false,
      };
    } catch (error) {
      const refreshedPurchase = await this.verifyOneTimeProduct({
        expectedProductId: productId,
        purchaseToken,
      });

      if (
        refreshedPurchase.acknowledgementState ===
        'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
      ) {
        return {
          acknowledged: true,
          alreadyAcknowledged: true,
        };
      }

      throw error;
    }
  }

  private assertRealVerificationEnabled(): void {
    if (!this.isRealVerificationEnabled()) {
      throw new ServiceUnavailableException(
        'Real Google Play purchase verification is not enabled.',
      );
    }
  }

  private assertProductionConfiguration(): void {
    const clientEmail = this.configService
      .get<string>('GOOGLE_PLAY_CLIENT_EMAIL')
      ?.trim();

    const privateKey = this.configService
      .get<string>('GOOGLE_PLAY_PRIVATE_KEY')
      ?.trim();

    if (!this.packageName) {
      throw new Error('GOOGLE_PLAY_PACKAGE_NAME is required.');
    }

    if (this.packageName !== 'com.shafacode.italir_pothe') {
      throw new Error(
        'GOOGLE_PLAY_PACKAGE_NAME must be com.shafacode.italir_pothe.',
      );
    }

    if (!clientEmail) {
      throw new Error('GOOGLE_PLAY_CLIENT_EMAIL is required.');
    }

    if (!privateKey) {
      throw new Error('GOOGLE_PLAY_PRIVATE_KEY is required.');
    }
  }

  private getAuthClient(): JWT {
    if (this.authClient) {
      return this.authClient;
    }

    this.assertProductionConfiguration();

    const clientEmail = this.configService.getOrThrow<string>(
      'GOOGLE_PLAY_CLIENT_EMAIL',
    );

    const privateKey = this.configService
      .getOrThrow<string>('GOOGLE_PLAY_PRIVATE_KEY')
      .replace(/\\n/g, '\n');

    this.authClient = new JWT({
      email: clientEmail.trim(),
      key: privateKey.trim(),
      scopes: [ANDROID_PUBLISHER_SCOPE],
    });

    return this.authClient;
  }

  private async googleRequest<T>(config: {
    method: 'GET' | 'POST';
    url: string;
    data?: unknown;
  }): Promise<T> {
    try {
      const response = await this.getAuthClient().request<T>({
        method: config.method,
        url: config.url,
        data: config.data,
      });

      return response.data;
    } catch (error) {
      this.throwMappedGoogleError(error);
    }
  }

  private throwMappedGoogleError(error: unknown): never {
    const normalized = this.normalizeGoogleError(error);

    /*
     * Never log purchase tokens or credential values.
     */
    this.logger.error(
      `Google Play API request failed. ` +
        `status=${normalized.status ?? 'unknown'} ` +
        `message=${normalized.message}`,
    );

    if (normalized.status === 400) {
      throw new BadRequestException(
        'Google Play rejected the purchase verification request.',
      );
    }

    if (normalized.status === 401 || normalized.status === 403) {
      throw new ServiceUnavailableException(
        'Google Play API credentials or Play Console permissions are invalid.',
      );
    }

    if (normalized.status === 404) {
      throw new BadRequestException(
        'The Google Play purchase token was not found for this application.',
      );
    }

    if (normalized.status === 409) {
      throw new ConflictException(
        'The Google Play purchase has already been processed.',
      );
    }

    throw new BadGatewayException(
      'Google Play purchase verification is temporarily unavailable.',
    );
  }

  private normalizeGoogleError(error: unknown): {
    status?: number;
    message: string;
  } {
    if (!error || typeof error !== 'object') {
      return {
        message: 'Unknown Google Play API error.',
      };
    }

    const candidate = error as {
      message?: unknown;
      response?: {
        status?: unknown;
        data?: {
          error?: {
            message?: unknown;
          };
        };
      };
    };

    const status =
      typeof candidate.response?.status === 'number'
        ? candidate.response.status
        : undefined;

    const responseMessage = candidate.response?.data?.error?.message;

    const message =
      typeof responseMessage === 'string'
        ? responseMessage
        : typeof candidate.message === 'string'
          ? candidate.message
          : 'Unknown Google Play API error.';

    return {
      status,
      message,
    };
  }

  private buildProductV2Url(purchaseToken: string): string {
    return (
      'https://androidpublisher.googleapis.com/' +
      'androidpublisher/v3/applications/' +
      `${encodeURIComponent(this.packageName)}/` +
      'purchases/productsv2/tokens/' +
      encodeURIComponent(purchaseToken)
    );
  }

  private buildConsumeUrl(productId: string, purchaseToken: string): string {
    return (
      'https://androidpublisher.googleapis.com/' +
      'androidpublisher/v3/applications/' +
      `${encodeURIComponent(this.packageName)}/` +
      'purchases/products/' +
      `${encodeURIComponent(productId)}/tokens/` +
      `${encodeURIComponent(purchaseToken)}:consume`
    );
  }

  private buildAcknowledgeUrl(
    productId: string,
    purchaseToken: string,
  ): string {
    return (
      'https://androidpublisher.googleapis.com/' +
      'androidpublisher/v3/applications/' +
      `${encodeURIComponent(this.packageName)}/` +
      'purchases/products/' +
      `${encodeURIComponent(productId)}/tokens/` +
      `${encodeURIComponent(purchaseToken)}:acknowledge`
    );
  }
}
