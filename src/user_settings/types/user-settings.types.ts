export interface UserSettingsProfilePayload {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  profilePhotoFileId: string | null;
  avatarUrl: string | null;
  canChangeEmail: boolean;
  canChangePhone: boolean;
  streakFreezeCount: number;
  currentStreakDays: number;
  learnerLevel: string;
}

export interface UserSettingsProfileResponse {
  message?: string;
  profile: UserSettingsProfilePayload;
}

export interface AvatarUploadPreparationResponse {
  storageKey: string;
  signedUploadUrl: string;
  publicUrl: string;
  method: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
  maxSizeBytes: number;
}

export interface UserSettingsMessageResponse {
  message: string;
}

export interface ContactChangeOtpResponse {
  message: string;
  contactType: 'email' | 'phone';
  destination: string;
  devOtp?: string;
}
