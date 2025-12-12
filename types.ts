export interface GeneratedStyle {
  id: string;
  imageUrl: string; // Base64 data URL
  prompt: string;
  type: 'hair' | 'fashion' | 'mix';
  timestamp: number;
}

export interface SalonResult {
  title: string;
  uri: string;
}

export interface ShoppingResult {
  title: string;
  uri: string;
}

export enum AppState {
  IDLE,
  ANALYZING,
  GENERATING,
  COMPLETE,
  ERROR
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
}