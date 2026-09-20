import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  generateKeyPairSync,
  sign as createSignature,
} from 'node:crypto';
import { encode } from 'cbor';

import { CourseDeviceAuthorization } from '../entities/course-device-authorization.entity';
import { CourseDeviceAttestationService } from './course-device-attestation.service';

describe('CourseDeviceAttestationService Apple assertions', () => {
  const appIdPrefix = 'TEAM123456';
  const bundleId = 'com.shafacode.italirpothe';
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'APPLE_APP_ID_PREFIX') return appIdPrefix;
      if (key === 'APPLE_BUNDLE_ID') return bundleId;
      return undefined;
    }),
  } as unknown as ConfigService;

  function assertionFixture(signNonce: boolean) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const clientData = Buffer.from('one-time server challenge', 'utf8');
    const authenticatorData = Buffer.alloc(37);
    createHash('sha256')
      .update(`${appIdPrefix}.${bundleId}`)
      .digest()
      .copy(authenticatorData, 0);
    authenticatorData.writeUInt32BE(1, 33);

    const composite = Buffer.concat([
      authenticatorData,
      createHash('sha256').update(clientData).digest(),
    ]);
    const nonce = createHash('sha256').update(composite).digest();
    const signature = createSignature(
      'sha256',
      signNonce ? nonce : composite,
      privateKey,
    );
    const authorization = {
      assertionCounter: 0,
      publicKeyPem: publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
    } as CourseDeviceAuthorization;

    return {
      authorization,
      assertionBase64: encode({ signature, authenticatorData }).toString(
        'base64',
      ),
      clientData,
    };
  }

  it('verifies the Apple signature against the hashed assertion nonce', () => {
    const service = new CourseDeviceAttestationService(config);

    expect(service.verifyAppleAssertion(assertionFixture(true))).toBe(1);
  });

  it('rejects a signature made over the unhashed concatenation', () => {
    const service = new CourseDeviceAttestationService(config);

    expect(() => service.verifyAppleAssertion(assertionFixture(false))).toThrow(
      ForbiddenException,
    );
  });
});
