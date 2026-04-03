import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getPinHash, savePinHash } from '../storage/secureStore';
import { initDb } from '../db/database';
import { getSetting, setSetting } from '../db/settings';
import { MasterProfile } from '../types/models';
import { hashPin } from '../utils/hash';

type AuthContextValue = {
  isReady: boolean;
  isSetup: boolean;
  isUnlocked: boolean;
  masterProfile: MasterProfile | null;
  refreshProfile: () => Promise<void>;
  completeSetup: (pin: string, profile: MasterProfile) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithoutPin: () => void;
  lock: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setReady] = useState(false);
  const [isSetup, setSetup] = useState(false);
  const [isUnlocked, setUnlocked] = useState(false);
  const [masterProfile, setMasterProfile] = useState<MasterProfile | null>(null);

  const refreshProfile = useCallback(async () => {
    const raw = await getSetting('master_profile');
    if (raw) setMasterProfile(JSON.parse(raw));
    else setMasterProfile(null);
  }, []);

  useEffect(() => {
    const boot = async () => {
      await initDb();
      const pinHash = await getPinHash();
      setSetup(!!pinHash);
      await refreshProfile();
      setReady(true);
    };
    boot();
  }, [refreshProfile]);

  const completeSetup = useCallback(async (pin: string, profile: MasterProfile) => {
    const hash = hashPin(pin);
    await savePinHash(hash);
    await setSetting('master_profile', JSON.stringify(profile));
    setSetup(true);
    setMasterProfile(profile);
    setUnlocked(true);
  }, []);

  const unlockWithPin = useCallback(async (pin: string) => {
    const saved = await getPinHash();
    if (!saved) return false;
    const ok = saved === hashPin(pin);
    if (ok) setUnlocked(true);
    return ok;
  }, []);

  const unlockWithoutPin = useCallback(() => {
    setUnlocked(true);
  }, []);

  const lock = useCallback(() => {
    setUnlocked(false);
  }, []);

  const value = useMemo(
    () => ({
      isReady,
      isSetup,
      isUnlocked,
      masterProfile,
      refreshProfile,
      completeSetup,
      unlockWithPin,
      unlockWithoutPin,
      lock,
    }),
    [isReady, isSetup, isUnlocked, masterProfile, refreshProfile, completeSetup, unlockWithPin, unlockWithoutPin, lock]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthContext missing');
  return ctx;
};
