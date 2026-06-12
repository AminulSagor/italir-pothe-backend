export enum DevicePlatform {
  ANDROID = 'android',
  IOS = 'ios',
  WEB = 'web',
  DESKTOP = 'desktop',
}

export enum DeviceAppState {
  FOREGROUND = 'foreground',
  BACKGROUND = 'background',
  TERMINATED = 'terminated',
}

export enum PresenceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export enum ConversationType {
  DIRECT = 'direct',
  GROUP = 'group',
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  AUDIO = 'audio',
  VIDEO = 'video',
  SYSTEM = 'system',
}

export enum AttachmentType {
  IMAGE = 'image',
  FILE = 'file',
  AUDIO = 'audio',
  VIDEO = 'video',
}

export enum DeliveryJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum DeliveryType {
  SOCKET = 'socket',
  PUSH = 'push',
}
