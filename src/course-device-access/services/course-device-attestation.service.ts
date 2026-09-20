import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
  X509Certificate,
} from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { decodeFirstSync } from 'cbor';

import { CourseDeviceAuthorization } from '../entities/course-device-authorization.entity';

type PlayIntegrityPayload = {
  requestDetails?: {
    requestPackageName?: string;
    requestHash?: string;
    timestampMillis?: string;
  };
  appIntegrity?: { appRecognitionVerdict?: string };
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
  accountDetails?: { appLicensingVerdict?: string };
};

type AppAttestObject = {
  fmt?: string;
  authData?: Buffer;
  attStmt?: { x5c?: Buffer[]; receipt?: Buffer };
};

@Injectable()
export class CourseDeviceAttestationService {
  private readonly googleAuth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/playintegrity'],
  });

  constructor(private readonly config: ConfigService) {}

  async verifyAndroid(params: {
    token: string;
    publicKeyPem: string;
    signatureBase64: string;
    clientData: Buffer;
  }): Promise<{ publicKeyPem: string }> {
    const packageName = this.requiredConfig(
      'PLAY_INTEGRITY_PACKAGE_NAME',
      'com.shafacode.italir_pothe',
    );
    const url = `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`;

    let payload: PlayIntegrityPayload;
    try {
      const response = await this.googleAuth.request<{
        tokenPayloadExternal?: PlayIntegrityPayload;
      }>({
        url,
        method: 'POST',
        data: { integrityToken: params.token },
      });
      payload = response.data.tokenPayloadExternal ?? {};
    } catch {
      throw new BadGatewayException(
        'Play Integrity verification is temporarily unavailable.',
      );
    }

    const expectedHash = this.base64Url(this.sha256(params.clientData));
    const timestamp = Number(payload.requestDetails?.timestampMillis ?? 0);
    const maximumAgeMs = Number(
      this.config.get<string>('PLAY_INTEGRITY_MAX_AGE_MS') ?? 120_000,
    );
    const verdicts = payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];

    if (
      payload.requestDetails?.requestPackageName !== packageName ||
      payload.requestDetails?.requestHash !== expectedHash ||
      !Number.isFinite(timestamp) ||
      Math.abs(Date.now() - timestamp) > maximumAgeMs ||
      payload.appIntegrity?.appRecognitionVerdict !== 'PLAY_RECOGNIZED' ||
      !verdicts.includes('MEETS_DEVICE_INTEGRITY')
    ) {
      throw new ForbiddenException(
        'Android app or device integrity verification failed.',
      );
    }

    const requireLicensed =
      (this.config.get<string>('PLAY_INTEGRITY_REQUIRE_LICENSED') ?? 'true') !==
      'false';
    if (
      requireLicensed &&
      payload.accountDetails?.appLicensingVerdict !== 'LICENSED'
    ) {
      throw new ForbiddenException(
        'This app installation is not licensed by Google Play.',
      );
    }

    const publicKey = createPublicKey(params.publicKeyPem);
    if (
      publicKey.asymmetricKeyType !== 'ec' ||
      publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    ) {
      throw new ForbiddenException(
        'The Android device key is not a P-256 key.',
      );
    }

    const signature = Buffer.from(params.signatureBase64, 'base64');
    if (!verifySignature('sha256', params.clientData, publicKey, signature)) {
      throw new ForbiddenException(
        'Android device signature verification failed.',
      );
    }

    return {
      publicKeyPem: publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
    };
  }

  async verifyAppleAttestation(params: {
    keyId: string;
    attestationObjectBase64: string;
    clientData: Buffer;
  }): Promise<{ publicKeyPem: string; receipt: string }> {
    let object: AppAttestObject;
    try {
      object = decodeFirstSync(
        Buffer.from(params.attestationObjectBase64, 'base64'),
      ) as AppAttestObject;
    } catch {
      throw new ForbiddenException('The App Attest object is invalid CBOR.');
    }

    const authData = Buffer.from(object.authData ?? []);
    const certificates = object.attStmt?.x5c ?? [];
    if (
      object.fmt !== 'apple-appattest' ||
      authData.length < 55 ||
      certificates.length < 1 ||
      !object.attStmt?.receipt
    ) {
      throw new ForbiddenException('The App Attest object is incomplete.');
    }

    const chain = certificates.map((item) => new X509Certificate(item));
    this.verifyAppleCertificateChain(chain);

    const leaf = chain[0];
    const extension = this.findCertificateExtensionValue(
      Buffer.from(leaf.raw),
      '1.2.840.113635.100.8.2',
    );
    const clientDataHash = this.sha256(params.clientData);
    const expectedNonce = this.sha256(
      Buffer.concat([authData, clientDataHash]),
    );
    if (!this.containsOctetString(extension, expectedNonce)) {
      throw new ForbiddenException(
        'The App Attest challenge binding is invalid.',
      );
    }

    this.verifyAppleAuthenticatorData(authData, params.keyId, true);
    const jwk = leaf.publicKey.export({ format: 'jwk' });
    if (!jwk.x || !jwk.y) {
      throw new ForbiddenException('The App Attest credential key is invalid.');
    }
    const point = Buffer.concat([
      Buffer.from([0x04]),
      Buffer.from(jwk.x, 'base64url'),
      Buffer.from(jwk.y, 'base64url'),
    ]);
    if (!this.matchesAppleKeyId(this.sha256(point), params.keyId)) {
      throw new ForbiddenException(
        'The App Attest key identifier does not match.',
      );
    }

    return {
      publicKeyPem: leaf.publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
      receipt: Buffer.from(object.attStmt.receipt).toString('base64'),
    };
  }

  verifyAppleAssertion(params: {
    authorization: CourseDeviceAuthorization;
    assertionBase64: string;
    clientData: Buffer;
  }): number {
    let assertion: { signature?: Buffer; authenticatorData?: Buffer };
    try {
      assertion = decodeFirstSync(
        Buffer.from(params.assertionBase64, 'base64'),
      ) as {
        signature?: Buffer;
        authenticatorData?: Buffer;
      };
    } catch {
      throw new ForbiddenException('The App Attest assertion is invalid CBOR.');
    }

    const authenticatorData = Buffer.from(assertion.authenticatorData ?? []);
    const signature = Buffer.from(assertion.signature ?? []);
    if (authenticatorData.length < 37 || signature.length === 0) {
      throw new ForbiddenException('The App Attest assertion is incomplete.');
    }

    this.verifyAppleAuthenticatorData(authenticatorData, null, false);
    const counter = authenticatorData.readUInt32BE(33);
    if (counter <= params.authorization.assertionCounter) {
      throw new ForbiddenException('The App Attest assertion was replayed.');
    }

    // App Attest signs the nonce, not the unhashed concatenation. Node's
    // ECDSA verifier applies SHA-256 to the value passed to it, so pass the
    // nonce prescribed by Apple: SHA256(authenticatorData || clientDataHash).
    const nonce = this.sha256(
      Buffer.concat([authenticatorData, this.sha256(params.clientData)]),
    );
    const valid = verifySignature(
      'sha256',
      nonce,
      createPublicKey(params.authorization.publicKeyPem),
      signature,
    );
    if (!valid) {
      throw new ForbiddenException(
        'The App Attest assertion signature is invalid.',
      );
    }

    return counter;
  }

  private verifyAppleAuthenticatorData(
    authData: Buffer,
    keyId: string | null,
    isAttestation: boolean,
  ): void {
    const appId = `${this.requiredConfig('APPLE_APP_ID_PREFIX')}.${this.requiredConfig('APPLE_BUNDLE_ID')}`;
    if (
      !this.safeEqual(authData.subarray(0, 32), this.sha256(Buffer.from(appId)))
    ) {
      throw new ForbiddenException('The App Attest App ID does not match.');
    }

    const counter = authData.readUInt32BE(33);
    if (isAttestation && counter !== 0) {
      throw new ForbiddenException(
        'The App Attest initial counter is invalid.',
      );
    }
    if (!isAttestation) return;

    const expectedEnvironment =
      this.config.get<string>('APPLE_APP_ATTEST_ENVIRONMENT') === 'development'
        ? Buffer.from('appattestdevelop')
        : Buffer.concat([Buffer.from('appattest'), Buffer.alloc(7)]);
    if (!this.safeEqual(authData.subarray(37, 53), expectedEnvironment)) {
      throw new ForbiddenException('The App Attest environment is invalid.');
    }

    const credentialLength = authData.readUInt16BE(53);
    const credentialId = authData.subarray(55, 55 + credentialLength);
    if (!keyId || !this.matchesAppleKeyId(credentialId, keyId)) {
      throw new ForbiddenException(
        'The App Attest credential identifier is invalid.',
      );
    }
  }

  private verifyAppleCertificateChain(chain: X509Certificate[]): void {
    const now = new Date();
    for (const certificate of chain) {
      if (now < certificate.validFromDate || now > certificate.validToDate) {
        throw new ForbiddenException(
          'The App Attest certificate is expired or not yet valid.',
        );
      }
    }
    for (let index = 0; index < chain.length - 1; index += 1) {
      if (!chain[index].verify(chain[index + 1].publicKey)) {
        throw new ForbiddenException(
          'The App Attest certificate chain is invalid.',
        );
      }
    }

    const rootPath =
      this.config.get<string>('APPLE_APP_ATTEST_ROOT_CA_PATH')?.trim() ||
      join(process.cwd(), 'assets/security/Apple_App_Attestation_Root_CA.pem');
    let trustedRoot: X509Certificate;
    try {
      trustedRoot = new X509Certificate(readFileSync(rootPath));
    } catch {
      throw new InternalServerErrorException(
        'The Apple App Attestation root CA is not configured.',
      );
    }
    const last = chain[chain.length - 1];
    const trusted =
      last.fingerprint256 === trustedRoot.fingerprint256 ||
      (last.issuer === trustedRoot.subject &&
        last.verify(trustedRoot.publicKey));
    if (!trusted) {
      throw new ForbiddenException(
        'The App Attest chain is not anchored to Apple.',
      );
    }
  }

  private findCertificateExtensionValue(
    certificateDer: Buffer,
    oid: string,
  ): Buffer {
    const oidBytes = this.encodeOid(oid);
    const needle = Buffer.concat([
      Buffer.from([0x06, oidBytes.length]),
      oidBytes,
    ]);
    const index = certificateDer.indexOf(needle);
    if (index < 0) {
      throw new ForbiddenException(
        'The App Attest nonce extension is missing.',
      );
    }
    let cursor = index + needle.length;
    if (certificateDer[cursor] === 0x01)
      cursor = this.skipDerValue(certificateDer, cursor);
    if (certificateDer[cursor] !== 0x04) {
      throw new ForbiddenException(
        'The App Attest nonce extension is malformed.',
      );
    }
    const { length, contentOffset } = this.readDerLength(
      certificateDer,
      cursor + 1,
    );
    return certificateDer.subarray(contentOffset, contentOffset + length);
  }

  private containsOctetString(der: Buffer, expected: Buffer): boolean {
    for (let offset = 0; offset < der.length - expected.length; offset += 1) {
      if (der[offset] !== 0x04) continue;
      try {
        const parsed = this.readDerLength(der, offset + 1);
        if (
          parsed.length === expected.length &&
          this.safeEqual(
            der.subarray(
              parsed.contentOffset,
              parsed.contentOffset + parsed.length,
            ),
            expected,
          )
        )
          return true;
      } catch {
        // Continue scanning the bounded extension value.
      }
    }
    return false;
  }

  private skipDerValue(der: Buffer, tagOffset: number): number {
    const parsed = this.readDerLength(der, tagOffset + 1);
    return parsed.contentOffset + parsed.length;
  }

  private readDerLength(
    der: Buffer,
    offset: number,
  ): { length: number; contentOffset: number } {
    const first = der[offset];
    if (first === undefined) throw new Error('Invalid DER length.');
    if ((first & 0x80) === 0)
      return { length: first, contentOffset: offset + 1 };
    const count = first & 0x7f;
    if (count < 1 || count > 4 || offset + count >= der.length)
      throw new Error('Invalid DER length.');
    let length = 0;
    for (let index = 0; index < count; index += 1)
      length = (length << 8) | der[offset + 1 + index];
    return { length, contentOffset: offset + 1 + count };
  }

  private encodeOid(value: string): Buffer {
    const parts = value.split('.').map(Number);
    const bytes = [parts[0] * 40 + parts[1]];
    for (const part of parts.slice(2)) {
      const encoded = [part & 0x7f];
      let remaining = Math.floor(part / 128);
      while (remaining > 0) {
        encoded.unshift((remaining & 0x7f) | 0x80);
        remaining = Math.floor(remaining / 128);
      }
      bytes.push(...encoded);
    }
    return Buffer.from(bytes);
  }

  private matchesAppleKeyId(bytes: Buffer, keyId: string): boolean {
    for (const encoding of ['base64', 'base64url'] as const) {
      try {
        if (this.safeEqual(bytes, Buffer.from(keyId, encoding))) return true;
      } catch {
        // Try the other accepted Apple representation.
      }
    }
    return false;
  }

  private requiredConfig(key: string, fallback?: string): string {
    const value = this.config.get<string>(key)?.trim() || fallback;
    if (!value)
      throw new InternalServerErrorException(`${key} is not configured.`);
    return value;
  }

  private sha256(value: Buffer): Buffer {
    return createHash('sha256').update(value).digest();
  }

  private base64Url(value: Buffer): string {
    return value.toString('base64url');
  }

  private safeEqual(left: Buffer, right: Buffer): boolean {
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
