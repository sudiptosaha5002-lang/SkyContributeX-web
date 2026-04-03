import { sha256 } from 'js-sha256';

export const hashPin = (pin: string) => sha256(pin);
