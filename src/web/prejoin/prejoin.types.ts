/** Pilihan media dari layar pre-join; dibaca RoomPage untuk publish awal. */
export interface PreJoinChoices {
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
}
