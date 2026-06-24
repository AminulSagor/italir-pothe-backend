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
