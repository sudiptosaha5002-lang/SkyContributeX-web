import * as Keychain from 'react-native-keychain';

const PIN_SERVICE = 'counterx.pin';

export const savePinHash = async (hash: string) => {
  await Keychain.setGenericPassword('master', hash, {
    service: PIN_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
};

export const getPinHash = async (): Promise<string | null> => {
  const creds = await Keychain.getGenericPassword({ service: PIN_SERVICE });
  if (!creds) return null;
  return creds.password;
};

export const resetPinHash = async () => {
  await Keychain.resetGenericPassword({ service: PIN_SERVICE });
};
