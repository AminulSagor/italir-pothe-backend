import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  AppStoreServerAPIClient,
  Environment,
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
  SignedDataVerifier,
  Type,
} from '@apple/app-store-server-library';

import { createHash } from 'node:crypto';

import type {
  VerifiedAppStoreNotification,
  VerifiedAppStoreTransaction,
} from 'src/billing/types/app-store-billing.type';

@Injectable()
export class AppStoreBillingService implements OnModuleInit {
  private readonly realVerificationEnabled: boolean;

  private bundleId = '';

  private appAppleId = 0;

  private productionClient!: AppStoreServerAPIClient;

  private sandboxClient!: AppStoreServerAPIClient;

  private productionVerifier!: SignedDataVerifier;

  private sandboxVerifier!: SignedDataVerifier;

  constructor(private readonly configService: ConfigService) {
    this.realVerificationEnabled =
      this.configService
        .get<string>('APP_STORE_VERIFICATION_MODE')
        ?.trim()
        .toLowerCase() === 'real';
  }

  onModuleInit(): void {
    if (!this.realVerificationEnabled) {
      return;
    }

    this.bundleId = this.required('APP_STORE_BUNDLE_ID');

    const appAppleId = Number(this.required('APP_STORE_APP_APPLE_ID'));

    // if (!Number.isSafeInteger(appAppleId) || appAppleId <= 0) {
    //   throw new Error('APP_STORE_APP_APPLE_ID must be a positive integer.');
    // }

    this.appAppleId = appAppleId;

    const issuerId = this.required('APP_STORE_ISSUER_ID');

    const keyId = this.required('APP_STORE_KEY_ID');

    const privateKey = this.required('APP_STORE_PRIVATE_KEY').replace(
      /\\n/g,
      '\n',
    );

    const rootCertificates = this.loadRootCertificates();

    const enableOnlineChecks =
      this.configService
        .get<string>('APP_STORE_ENABLE_ONLINE_CERTIFICATE_CHECKS')
        ?.trim()
        .toLowerCase() !== 'false';

    this.productionClient = new AppStoreServerAPIClient(
      privateKey,
      keyId,
      issuerId,
      this.bundleId,
      Environment.PRODUCTION,
    );

    this.sandboxClient = new AppStoreServerAPIClient(
      privateKey,
      keyId,
      issuerId,
      this.bundleId,
      Environment.SANDBOX,
    );

    this.productionVerifier = new SignedDataVerifier(
      rootCertificates,
      enableOnlineChecks,
      Environment.PRODUCTION,
      this.bundleId,
      this.appAppleId,
    );

    this.sandboxVerifier = new SignedDataVerifier(
      rootCertificates,
      enableOnlineChecks,
      Environment.SANDBOX,
      this.bundleId,
    );
  }

  isRealVerificationEnabled(): boolean {
    return this.realVerificationEnabled;
  }

  hash(value: string): string {
    return createHash('sha256').update(value.trim()).digest('hex');
  }

  async verifyTransaction(params: {
    signedTransactionInfo: string;

    expectedTransactionId: string;

    expectedProductId: string;

    expectedAppAccountToken: string;

    expectedType: Type;
  }): Promise<VerifiedAppStoreTransaction> {
    this.assertRealVerificationEnabled();

    const signedTransactionInfo = params.signedTransactionInfo.trim();

    if (!signedTransactionInfo) {
      throw new BadRequestException(
        'signedTransactionInfo is required for App Store verification.',
      );
    }

    const submitted = await this.verifyTransactionJws(signedTransactionInfo);

    this.assertTransactionMatches({
      transaction: submitted.transaction,

      expectedTransactionId: params.expectedTransactionId,

      expectedProductId: params.expectedProductId,

      expectedAppAccountToken: params.expectedAppAccountToken,

      expectedType: params.expectedType,
    });

    const client = this.clientForEnvironment(submitted.environment);

    const apiResponse = await client.getTransactionInfo(
      params.expectedTransactionId.trim(),
    );

    const authoritativeJws = apiResponse.signedTransactionInfo?.trim();

    if (!authoritativeJws) {
      throw new ServiceUnavailableException(
        'App Store Server API returned no signed transaction information.',
      );
    }

    const verifier = this.verifierForEnvironment(submitted.environment);

    const authoritative =
      await verifier.verifyAndDecodeTransaction(authoritativeJws);

    this.assertTransactionMatches({
      transaction: authoritative,

      expectedTransactionId: params.expectedTransactionId,

      expectedProductId: params.expectedProductId,

      expectedAppAccountToken: params.expectedAppAccountToken,

      expectedType: params.expectedType,
    });

    if (
      submitted.transaction.transactionId !== authoritative.transactionId ||
      submitted.transaction.originalTransactionId !==
        authoritative.originalTransactionId
    ) {
      throw new BadRequestException(
        'The submitted StoreKit transaction does not match the App Store Server API transaction.',
      );
    }

    if (authoritative.revocationDate) {
      throw new BadRequestException(
        'The App Store transaction has already been revoked or refunded.',
      );
    }

    const quantity = authoritative.quantity ?? 1;

    if (quantity !== 1) {
      throw new BadRequestException(
        'This backend currently supports an App Store quantity of exactly one.',
      );
    }

    return {
      transactionId: authoritative.transactionId!,

      originalTransactionId: authoritative.originalTransactionId!,

      productId: authoritative.productId!,

      appAccountToken: authoritative.appAccountToken ?? null,

      type: authoritative.type!,

      environment: authoritative.environment ?? submitted.environment,

      purchaseDate: this.dateFromMillis(authoritative.purchaseDate),

      originalPurchaseDate: this.dateFromMillis(
        authoritative.originalPurchaseDate,
      ),

      expiresDate: this.dateFromMillis(authoritative.expiresDate),

      quantity,

      revocationDate: this.dateFromMillis(authoritative.revocationDate),

      revocationReason:
        typeof authoritative.revocationReason === 'number'
          ? authoritative.revocationReason
          : null,

      currency: authoritative.currency ?? null,

      priceMilliunits: authoritative.price ?? null,

      storefront: authoritative.storefront ?? null,

      signedTransactionHash: this.hash(authoritativeJws),

      decoded: authoritative,

      sanitizedPayload: this.sanitizeTransaction(authoritative),
    };
  }

  async verifyNotification(
    signedPayload: string,
  ): Promise<VerifiedAppStoreNotification> {
    this.assertRealVerificationEnabled();

    const normalized = signedPayload.trim();

    if (!normalized) {
      throw new BadRequestException('signedPayload is required.');
    }

    const verified = await this.verifyNotificationJws(normalized);

    const notification = verified.notification;

    const notificationUuid = notification.notificationUUID?.trim();

    if (!notificationUuid) {
      throw new BadRequestException('App Store notificationUUID is missing.');
    }

    const notificationType = notification.notificationType;

    if (!notificationType) {
      throw new BadRequestException('App Store notificationType is missing.');
    }

    const signedDate = this.dateFromMillis(notification.signedDate);

    if (!signedDate) {
      throw new BadRequestException('App Store signedDate is missing.');
    }

    let transaction: JWSTransactionDecodedPayload | null = null;

    let renewalInfo: JWSRenewalInfoDecodedPayload | null = null;

    const verifier = this.verifierForEnvironment(verified.environment);

    if (notification.data?.signedTransactionInfo) {
      transaction = await verifier.verifyAndDecodeTransaction(
        notification.data.signedTransactionInfo,
      );

      this.assertBundleAndEnvironment(transaction, verified.environment);
    }

    if (notification.data?.signedRenewalInfo) {
      renewalInfo = await verifier.verifyAndDecodeRenewalInfo(
        notification.data.signedRenewalInfo,
      );
    }

    return {
      notificationUuid,

      notificationType,

      subtype: notification.subtype ?? null,

      environment: verified.environment,

      signedDate,

      status:
        typeof notification.data?.status === 'number'
          ? notification.data.status
          : null,

      transaction,

      renewalInfo,

      decoded: notification,

      signedPayloadHash: this.hash(normalized),

      sanitizedPayload: {
        notificationUUID: notificationUuid,

        notificationType,

        subtype: notification.subtype ?? null,

        version: notification.version ?? null,

        signedDate: signedDate.toISOString(),

        environment: verified.environment,

        status: notification.data?.status ?? null,

        bundleId: notification.data?.bundleId ?? null,

        appAppleId: notification.data?.appAppleId ?? null,

        transaction: transaction ? this.sanitizeTransaction(transaction) : null,

        renewalInfo: renewalInfo ? this.sanitizeRenewalInfo(renewalInfo) : null,
      },
    };
  }

  async requestTestNotification(environment: Environment) {
    this.assertRealVerificationEnabled();

    if (
      environment !== Environment.PRODUCTION &&
      environment !== Environment.SANDBOX
    ) {
      throw new BadRequestException(
        'Test notifications support only Production or Sandbox.',
      );
    }

    return this.clientForEnvironment(environment).requestTestNotification();
  }

  private async verifyTransactionJws(signedTransactionInfo: string): Promise<{
    transaction: JWSTransactionDecodedPayload;

    environment: Environment;
  }> {
    try {
      return {
        transaction: await this.productionVerifier.verifyAndDecodeTransaction(
          signedTransactionInfo,
        ),

        environment: Environment.PRODUCTION,
      };
    } catch (productionError) {
      try {
        return {
          transaction: await this.sandboxVerifier.verifyAndDecodeTransaction(
            signedTransactionInfo,
          ),

          environment: Environment.SANDBOX,
        };
      } catch {
        throw new BadRequestException(
          `App Store transaction signature verification failed: ${this.errorMessage(
            productionError,
          )}`,
        );
      }
    }
  }

  private async verifyNotificationJws(signedPayload: string): Promise<{
    notification: Awaited<
      ReturnType<SignedDataVerifier['verifyAndDecodeNotification']>
    >;

    environment: Environment;
  }> {
    try {
      return {
        notification:
          await this.productionVerifier.verifyAndDecodeNotification(
            signedPayload,
          ),

        environment: Environment.PRODUCTION,
      };
    } catch (productionError) {
      try {
        return {
          notification:
            await this.sandboxVerifier.verifyAndDecodeNotification(
              signedPayload,
            ),

          environment: Environment.SANDBOX,
        };
      } catch {
        throw new BadRequestException(
          `App Store notification signature verification failed: ${this.errorMessage(
            productionError,
          )}`,
        );
      }
    }
  }

  private assertTransactionMatches(params: {
    transaction: JWSTransactionDecodedPayload;

    expectedTransactionId: string;

    expectedProductId: string;

    expectedAppAccountToken: string;

    expectedType: Type;
  }): void {
    const transaction = params.transaction;

    if (transaction.bundleId !== this.bundleId) {
      throw new BadRequestException(
        'App Store transaction belongs to another bundle ID.',
      );
    }

    if (!transaction.transactionId || !transaction.originalTransactionId) {
      throw new BadRequestException(
        'App Store transaction identifiers are missing.',
      );
    }

    if (transaction.transactionId !== params.expectedTransactionId.trim()) {
      throw new BadRequestException(
        'App Store transaction ID does not match the submitted transaction.',
      );
    }

    if (transaction.productId !== params.expectedProductId.trim()) {
      throw new BadRequestException(
        'App Store product ID does not match the ordered product.',
      );
    }

    if (transaction.type !== params.expectedType) {
      throw new BadRequestException(
        `App Store product type must be ${params.expectedType}.`,
      );
    }

    if (
      !transaction.appAccountToken ||
      transaction.appAccountToken.toLowerCase() !==
        params.expectedAppAccountToken.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        'App Store appAccountToken does not match the backend order ID.',
      );
    }
  }

  private assertBundleAndEnvironment(
    transaction: JWSTransactionDecodedPayload,

    expectedEnvironment: Environment,
  ): void {
    if (transaction.bundleId !== this.bundleId) {
      throw new BadRequestException(
        'App Store transaction belongs to another bundle ID.',
      );
    }

    if (
      transaction.environment &&
      transaction.environment !== expectedEnvironment
    ) {
      throw new BadRequestException(
        'App Store transaction environment does not match its signature environment.',
      );
    }
  }

  private sanitizeTransaction(
    transaction: JWSTransactionDecodedPayload,
  ): Record<string, unknown> {
    return {
      transactionId: transaction.transactionId ?? null,

      originalTransactionId: transaction.originalTransactionId ?? null,

      productId: transaction.productId ?? null,

      appAccountToken: transaction.appAccountToken ?? null,

      type: transaction.type ?? null,

      environment: transaction.environment ?? null,

      purchaseDate: this.isoFromMillis(transaction.purchaseDate),

      originalPurchaseDate: this.isoFromMillis(
        transaction.originalPurchaseDate,
      ),

      expiresDate: this.isoFromMillis(transaction.expiresDate),

      quantity: transaction.quantity ?? 1,

      revocationDate: this.isoFromMillis(transaction.revocationDate),

      revocationReason: transaction.revocationReason ?? null,

      revocationType: transaction.revocationType ?? null,

      revocationPercentage: transaction.revocationPercentage ?? null,

      transactionReason: transaction.transactionReason ?? null,

      currency: transaction.currency ?? null,

      price: transaction.price ?? null,

      storefront: transaction.storefront ?? null,

      offerIdentifier: transaction.offerIdentifier ?? null,

      subscriptionGroupIdentifier:
        transaction.subscriptionGroupIdentifier ?? null,

      signedDate: this.isoFromMillis(transaction.signedDate),
    };
  }

  private sanitizeRenewalInfo(
    renewalInfo: JWSRenewalInfoDecodedPayload,
  ): Record<string, unknown> {
    return {
      originalTransactionId: renewalInfo.originalTransactionId ?? null,

      productId: renewalInfo.productId ?? null,

      autoRenewProductId: renewalInfo.autoRenewProductId ?? null,

      autoRenewStatus: renewalInfo.autoRenewStatus ?? null,

      expirationIntent: renewalInfo.expirationIntent ?? null,

      isInBillingRetryPeriod: renewalInfo.isInBillingRetryPeriod ?? false,

      gracePeriodExpiresDate: this.isoFromMillis(
        renewalInfo.gracePeriodExpiresDate,
      ),

      renewalDate: this.isoFromMillis(renewalInfo.renewalDate),

      environment: renewalInfo.environment ?? null,

      currency: renewalInfo.currency ?? null,

      renewalPrice: renewalInfo.renewalPrice ?? null,

      signedDate: this.isoFromMillis(renewalInfo.signedDate),
    };
  }

  private clientForEnvironment(
    environment: Environment | string,
  ): AppStoreServerAPIClient {
    if (environment === Environment.PRODUCTION) {
      return this.productionClient;
    }

    if (environment === Environment.SANDBOX) {
      return this.sandboxClient;
    }

    throw new BadRequestException(
      `Unsupported App Store environment: ${String(environment)}.`,
    );
  }

  private verifierForEnvironment(
    environment: Environment | string,
  ): SignedDataVerifier {
    if (environment === Environment.PRODUCTION) {
      return this.productionVerifier;
    }

    if (environment === Environment.SANDBOX) {
      return this.sandboxVerifier;
    }

    throw new BadRequestException(
      `Unsupported App Store environment: ${String(environment)}.`,
    );
  }

  private loadRootCertificates(): Buffer[] {
    const raw = this.required('APP_STORE_ROOT_CA_CERTS_BASE64');

    const certificates = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Buffer.from(value, 'base64'));

    if (
      certificates.length === 0 ||
      certificates.some((item) => !item.length)
    ) {
      throw new Error(
        'APP_STORE_ROOT_CA_CERTS_BASE64 must contain comma-separated base64 DER certificates.',
      );
    }

    return certificates;
  }

  private assertRealVerificationEnabled(): void {
    if (!this.realVerificationEnabled) {
      throw new ServiceUnavailableException(
        'Real App Store verification is disabled.',
      );
    }
  }

  private required(key: string): string {
    const value = this.configService.get<string>(key)?.trim();

    if (!value) {
      throw new Error(
        `${key} is required when APP_STORE_VERIFICATION_MODE=real.`,
      );
    }

    return value;
  }

  private dateFromMillis(value: number | undefined): Date | null {
    if (!Number.isFinite(value)) {
      return null;
    }

    const date = new Date(value!);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private isoFromMillis(value: number | undefined): string | null {
    return this.dateFromMillis(value)?.toISOString() ?? null;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Unknown verification error';
  }
}
