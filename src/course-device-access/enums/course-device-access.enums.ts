export enum CourseDevicePlatform {
  ANDROID = 'android',
  IOS = 'ios',
}

export enum CourseDeviceAuthorizationStatus {
  CANDIDATE = 'candidate',
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

export enum CourseDeviceRequestStatus {
  PENDING = 'pending',
  APPROVED_REPLACE = 'approved_replace',
  APPROVED_ADD = 'approved_add',
  REJECTED = 'rejected',
}

export enum CourseDeviceRequestDecision {
  REPLACE = 'replace',
  ADD = 'add',
  REJECT = 'reject',
}
