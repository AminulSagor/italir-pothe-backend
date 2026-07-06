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
import { GoogleAuth } from 'google-auth-library';
import { createHash } from 'node:crypto';

import type {
  GooglePlayProductPurchaseV2,
  GooglePlaySubscriptionPurchaseV2,
  GooglePlayVoidedPurchasesListResponse,
  VerifiedGooglePlayOneTimeProduct,
  VerifiedGooglePlaySubscription,
} from '../types/google-play-billing.type';

const ANDROID_PUBLISHER_SCOPE =
  'https://www.googleapis.com/auth/androidpublisher';

@Injectable()
export class GooglePlayBillingService implements OnModuleInit {
  private readonly logger = new Logger(GooglePlayBillingService.name);

  private readonly packageName: string;

  private readonly verificationMode: string;

  private readonly projectId: string | undefined;

  private auth: GoogleAuth | null = null;

  constructor(private readonly configService: ConfigService) {
    this.packageName =
      this.configService.get<string>('GOOGLE_PLAY_PACKAGE_NAME')?.trim() ?? '';

    this.projectId = this.configService
      .get<string>('GOOGLE_PLAY_PROJECT_ID')
      ?.trim();

    this.verificationMode =
      this.configService
        .get<string>('GOOGLE_PLAY_VERIFICATION_MODE')
        ?.trim()
        .toLowerCase() ?? 'development';
  }

  onModuleInit(): void {
    if (!this.isRealVerificationEnabled()) {
      this.logger.warn(
        `Google Play real verification is disabled. Mode: ${this.verificationMode}`,
      );

      return;
    }

    this.assertConfiguration();

    this.getAuth();

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

  async verifyOneTimeProduct(params: {
    purchaseToken: string;
    expectedProductId: string;
    expectedOfferId?: string | null;
    expectedObfuscatedAccountId?: string | null;
  }): Promise<VerifiedGooglePlayOneTimeProduct> {
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
        'Google Play returned no product line items.',
      );
    }

    const matchedLineItem = lineItems.find(
      (lineItem) => lineItem.productId === expectedProductId,
    );

    if (!matchedLineItem) {
      throw new BadRequestException(
        'The verified Google Play product does not match the ordered product.',
      );
    }

    const containsAnotherProduct = lineItems.some(
      (lineItem) => lineItem.productId !== expectedProductId,
    );

    if (containsAnotherProduct) {
      throw new BadRequestException(
        'The Google Play purchase contains an unexpected product.',
      );
    }

    const offerDetails = matchedLineItem.productOfferDetails;

    if (
      params.expectedOfferId &&
      offerDetails?.offerId !== params.expectedOfferId
    ) {
      throw new BadRequestException(
        'The verified Google Play offer does not match the order.',
      );
    }

    this.assertObfuscatedAccountId({
      expected: params.expectedObfuscatedAccountId ?? null,
      received: response.obfuscatedExternalAccountId ?? null,
    });

    if (!response.purchaseCompletionTime) {
      throw new BadRequestException(
        'Google Play did not return a completed purchase time.',
      );
    }

    return {
      provider: 'google_play',
      packageName: this.packageName,
      productId: expectedProductId,
      purchaseOptionId: offerDetails?.purchaseOptionId ?? null,
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
        url: this.buildProductAcknowledgeUrl(productId, purchaseToken),
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

  async verifySubscription(params: {
    purchaseToken: string;
    expectedProductId: string;
    expectedBasePlanId?: string | null;
    expectedOfferId?: string | null;
    expectedObfuscatedAccountId?: string | null;
  }): Promise<VerifiedGooglePlaySubscription> {
    this.assertRealVerificationEnabled();

    const purchaseToken = params.purchaseToken.trim();
    const expectedProductId = params.expectedProductId.trim();

    if (!purchaseToken) {
      throw new BadRequestException(
        'Google Play subscription token is required.',
      );
    }

    if (!expectedProductId) {
      throw new BadRequestException(
        'Google Play subscription product ID is required.',
      );
    }

    const response = await this.googleRequest<GooglePlaySubscriptionPurchaseV2>(
      {
        method: 'GET',
        url: this.buildSubscriptionV2Url(purchaseToken),
      },
    );

    const subscriptionState =
      response.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED';

    if (subscriptionState === 'SUBSCRIPTION_STATE_PENDING') {
      throw new ConflictException(
        'The Google Play subscription purchase is pending.',
      );
    }

    const allowedStates = new Set([
      'SUBSCRIPTION_STATE_ACTIVE',
      'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
      'SUBSCRIPTION_STATE_CANCELED',
    ]);

    if (!allowedStates.has(subscriptionState)) {
      throw new BadRequestException(
        `Google Play subscription is not active. State: ${subscriptionState}.`,
      );
    }

    const lineItems = response.lineItems ?? [];

    const matchedLineItem = lineItems.find(
      (lineItem) => lineItem.productId === expectedProductId,
    );

    if (!matchedLineItem) {
      throw new BadRequestException(
        'The verified Google Play subscription does not match the ordered product.',
      );
    }

    const containsAnotherProduct = lineItems.some(
      (lineItem) => lineItem.productId !== expectedProductId,
    );

    if (containsAnotherProduct) {
      throw new BadRequestException(
        'The Google Play subscription contains an unexpected product.',
      );
    }

    const basePlanId = matchedLineItem.offerDetails?.basePlanId ?? null;

    const offerId = matchedLineItem.offerDetails?.offerId ?? null;

    if (params.expectedBasePlanId && basePlanId !== params.expectedBasePlanId) {
      throw new BadRequestException(
        'The Google Play base plan does not match the order.',
      );
    }

    if (params.expectedOfferId && offerId !== params.expectedOfferId) {
      throw new BadRequestException(
        'The Google Play subscription offer does not match the order.',
      );
    }

    if (!matchedLineItem.expiryTime) {
      throw new BadRequestException(
        'Google Play did not return a subscription expiry time.',
      );
    }

    const expiryDate = new Date(matchedLineItem.expiryTime);

    if (
      Number.isNaN(expiryDate.getTime()) ||
      expiryDate.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'The Google Play subscription has expired.',
      );
    }

    const receivedObfuscatedAccountId =
      response.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null;

    this.assertObfuscatedAccountId({
      expected: params.expectedObfuscatedAccountId ?? null,
      received: receivedObfuscatedAccountId,
    });

    return {
      provider: 'google_play',
      packageName: this.packageName,
      productId: expectedProductId,
      basePlanId,
      offerId,
      latestOrderId:
        response.latestOrderId ??
        matchedLineItem.latestSuccessfulOrderId ??
        null,
      purchaseTokenHash: this.hashPurchaseToken(purchaseToken),
      subscriptionState,
      acknowledgementState:
        response.acknowledgementState ?? 'ACKNOWLEDGEMENT_STATE_UNSPECIFIED',
      startedAt: response.startTime ?? null,
      expiresAt: matchedLineItem.expiryTime,
      autoRenewEnabled:
        matchedLineItem.autoRenewingPlan?.autoRenewEnabled ?? false,
      regionCode: response.regionCode ?? null,
      obfuscatedExternalAccountId: receivedObfuscatedAccountId,
      obfuscatedExternalProfileId:
        response.externalAccountIdentifiers?.obfuscatedExternalProfileId ??
        null,
      isTestPurchase: response.testPurchase != null,
    };
  }

  async acknowledgeSubscription(params: {
    subscriptionId: string;
    purchaseToken: string;
  }): Promise<{
    acknowledged: true;
    alreadyAcknowledged: boolean;
  }> {
    this.assertRealVerificationEnabled();

    const subscriptionId = params.subscriptionId.trim();
    const purchaseToken = params.purchaseToken.trim();

    const currentSubscription = await this.verifySubscription({
      expectedProductId: subscriptionId,
      purchaseToken,
    });

    if (
      currentSubscription.acknowledgementState ===
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
        url: this.buildSubscriptionAcknowledgeUrl(
          subscriptionId,
          purchaseToken,
        ),
        data: {},
      });

      return {
        acknowledged: true,
        alreadyAcknowledged: false,
      };
    } catch (error) {
      const refreshedSubscription = await this.verifySubscription({
        expectedProductId: subscriptionId,
        purchaseToken,
      });

      if (
        refreshedSubscription.acknowledgementState ===
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

  async refundOrder(params: { orderId: string; revoke?: boolean }): Promise<{
    refunded: true;
    revoked: boolean;
  }> {
    this.assertRealVerificationEnabled();

    const orderId = params.orderId.trim();
    const revoke = params.revoke ?? true;

    if (!orderId) {
      throw new BadRequestException(
        'Google Play order ID is required for a refund.',
      );
    }

    await this.googleRequest<void>({
      method: 'POST',
      url: this.buildOrderRefundUrl(orderId, revoke),
      data: {},
    });

    return {
      refunded: true,
      revoked: revoke,
    };
  }

  async getOneTimeProductPurchaseByToken(params: {
    purchaseToken: string;
  }): Promise<GooglePlayProductPurchaseV2> {
    this.assertRealVerificationEnabled();

    const purchaseToken = params.purchaseToken.trim();

    if (!purchaseToken) {
      throw new BadRequestException('Google Play purchase token is required.');
    }

    return this.googleRequest<GooglePlayProductPurchaseV2>({
      method: 'GET',
      url: this.buildProductV2Url(purchaseToken),
    });
  }

  async getSubscriptionPurchaseByToken(params: {
    purchaseToken: string;
  }): Promise<GooglePlaySubscriptionPurchaseV2> {
    this.assertRealVerificationEnabled();

    const purchaseToken = params.purchaseToken.trim();

    if (!purchaseToken) {
      throw new BadRequestException(
        'Google Play subscription token is required.',
      );
    }

    return this.googleRequest<GooglePlaySubscriptionPurchaseV2>({
      method: 'GET',
      url: this.buildSubscriptionV2Url(purchaseToken),
    });
  }

  async cancelSubscription(params: {
    purchaseToken: string;

    cancellationType:
      | 'USER_REQUESTED_STOP_RENEWALS'
      | 'DEVELOPER_REQUESTED_STOP_PAYMENTS';
  }): Promise<{
    canceled: true;

    cancellationType:
      | 'USER_REQUESTED_STOP_RENEWALS'
      | 'DEVELOPER_REQUESTED_STOP_PAYMENTS';
  }> {
    this.assertRealVerificationEnabled();

    const purchaseToken = params.purchaseToken.trim();

    if (!purchaseToken) {
      throw new BadRequestException(
        'Google Play subscription token is required.',
      );
    }

    await this.googleRequest<void>({
      method: 'POST',

      url: this.buildSubscriptionCancelUrl(purchaseToken),

      data: {
        cancellationContext: {
          cancellationType: params.cancellationType,
        },
      },
    });

    return {
      canceled: true,

      cancellationType: params.cancellationType,
    };
  }

  async listVoidedPurchases(params: {
    startTime?: Date;
    endTime?: Date;
    pageToken?: string | null;
    maxResults?: number;
    includeSubscriptions?: boolean;
    includeQuantityBasedPartialRefund?: boolean;
  }): Promise<GooglePlayVoidedPurchasesListResponse> {
    this.assertRealVerificationEnabled();

    const pageToken = params.pageToken?.trim() || null;

    const maxResults = Math.min(
      1000,
      Math.max(1, Math.trunc(params.maxResults ?? 1000)),
    );

    const endTime = params.endTime ?? new Date();

    const startTime =
      params.startTime ??
      new Date(endTime.getTime() - 29 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestException(
        'Voided-purchase reconciliation dates are invalid.',
      );
    }

    if (startTime.getTime() >= endTime.getTime()) {
      throw new BadRequestException(
        'Voided-purchase startTime must be before endTime.',
      );
    }

    if (endTime.getTime() > Date.now() + 60_000) {
      throw new BadRequestException(
        'Voided-purchase endTime cannot be in the future.',
      );
    }

    const oldestAllowed = Date.now() - 30 * 24 * 60 * 60 * 1000;

    if (!pageToken && startTime.getTime() < oldestAllowed) {
      throw new BadRequestException(
        'Google Play only permits voided-purchase reconciliation for the previous 30 days.',
      );
    }

    return this.googleRequest<GooglePlayVoidedPurchasesListResponse>({
      method: 'GET',

      url: this.buildVoidedPurchasesUrl({
        startTime,
        endTime,
        pageToken,
        maxResults,

        includeSubscriptions: params.includeSubscriptions ?? true,

        includeQuantityBasedPartialRefund:
          params.includeQuantityBasedPartialRefund ?? true,
      }),
    });
  }

  private buildVoidedPurchasesUrl(params: {
    startTime: Date;
    endTime: Date;
    pageToken: string | null;
    maxResults: number;
    includeSubscriptions: boolean;
    includeQuantityBasedPartialRefund: boolean;
  }): string {
    const query = new URLSearchParams();

    query.set('pageSelection.maxResults', String(params.maxResults));

    query.set('type', params.includeSubscriptions ? '1' : '0');

    query.set(
      'includeQuantityBasedPartialRefund',
      String(params.includeQuantityBasedPartialRefund),
    );

    if (params.pageToken) {
      query.set('pageSelection.token', params.pageToken);
    } else {
      query.set('startTime', String(params.startTime.getTime()));

      query.set('endTime', String(params.endTime.getTime()));
    }

    return (
      'https://androidpublisher.googleapis.com/' +
      'androidpublisher/v3/applications/' +
      `${encodeURIComponent(this.packageName)}/` +
      'purchases/voidedpurchases?' +
      query.toString()
    );
  }

  private buildSubscriptionCancelUrl(purchaseToken: string): string {
    return (
      'https://androidpublisher.googleapis.com/' +
      'androidpublisher/v3/applications/' +
      `${encodeURIComponent(this.packageName)}/` +
      'purchases/subscriptionsv2/tokens/' +
      `${encodeURIComponent(purchaseToken)}:cancel`
    );
  }

  private buildOrderRefundUrl(orderId: string, revoke: boolean): string {
    return (
      'https://androidpublisher.googleapis.com/' +
      'androidpublisher/v3/applications/' +
      `${encodeURIComponent(this.packageName)}/orders/` +
      `${encodeURIComponent(orderId)}:refund` +
      `?revoke=${String(revoke)}`
    );
  }

  private assertObfuscatedAccountId(params: {
    expected: string | null;
    received: string | null;
  }): void {
    if (!params.expected) {
      return;
    }

    const requireAccountId =
      this.configService.get<string>(
        'GOOGLE_PLAY_REQUIRE_OBFUSCATED_ACCOUNT_ID',
      ) === 'true';

    if (!params.received) {
      if (requireAccountId) {
        throw new BadRequestException(
          'Google Play did not return the expected application account identifier.',
        );
      }

      return;
    }

    if (params.received !== params.expected) {
      throw new BadRequestException(
        'The Google Play purchase belongs to another application user.',
      );
    }
  }

  private assertRealVerificationEnabled(): void {
    if (!this.isRealVerificationEnabled()) {
      throw new ServiceUnavailableException(
        'Real Google Play verification is not enabled.',
      );
    }
  }

  private assertConfiguration(): void {
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

  private getAuth(): GoogleAuth {
    if (this.auth) {
      return this.auth;
    }

    this.assertConfiguration();

    const clientEmail = this.configService
      .getOrThrow<string>('GOOGLE_PLAY_CLIENT_EMAIL')
      .trim();

    const privateKey = this.normalizePrivateKey(
      this.configService.getOrThrow<string>('GOOGLE_PLAY_PRIVATE_KEY'),
    );

    this.auth = new GoogleAuth({
      projectId: this.projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      scopes: [ANDROID_PUBLISHER_SCOPE],
    });

    return this.auth;
  }

  private normalizePrivateKey(value: string): string {
    let normalized = value.trim();

    const wrappedInDoubleQuotes =
      normalized.startsWith('"') && normalized.endsWith('"');

    const wrappedInSingleQuotes =
      normalized.startsWith("'") && normalized.endsWith("'");

    if (wrappedInDoubleQuotes || wrappedInSingleQuotes) {
      normalized = normalized.slice(1, -1);
    }

    return normalized.replace(/\\n/g, '\n');
  }

  private async googleRequest<T>(config: {
    method: 'GET' | 'POST';
    url: string;
    data?: unknown;
  }): Promise<T> {
    try {
      const client = await this.getAuth().getClient();

      const response = await client.request<T>({
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
        'Google Play credentials or Play Console permissions are invalid.',
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
      'Google Play verification is temporarily unavailable.',
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

  private buildProductAcknowledgeUrl(
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

  private buildSubscriptionV2Url(purchaseToken: string): string {
    return (
      'https://androidpublisher.googleapis.com/' +
      'androidpublisher/v3/applications/' +
      `${encodeURIComponent(this.packageName)}/` +
      'purchases/subscriptionsv2/tokens/' +
      encodeURIComponent(purchaseToken)
    );
  }

  private buildSubscriptionAcknowledgeUrl(
    subscriptionId: string,
    purchaseToken: string,
  ): string {
    return (
      'https://androidpublisher.googleapis.com/' +
      'androidpublisher/v3/applications/' +
      `${encodeURIComponent(this.packageName)}/` +
      'purchases/subscriptions/' +
      `${encodeURIComponent(subscriptionId)}/tokens/` +
      `${encodeURIComponent(purchaseToken)}:acknowledge`
    );
  }
}
