import { createContext, useContext } from 'react';
import type { Workspace } from './lib';
export type ModalName = 'create' | 'search' | 'login' | 'register' | null;
export interface Store {
  data: Workspace;
  online: boolean;
  refresh: () => Promise<void>;
  setData: (w: Workspace) => void;
  modal: (v: ModalName) => void;
  toast: (message: string) => void;
}
export const StoreContext = createContext<Store | null>(null);
export function useVault() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('Workspace missing');
  return ctx;
}

export const ReaderContext = createContext<Pick<Store, 'refresh' | 'toast'> | null>(null);
export function useActions() {
  const owner = useContext(StoreContext);
  const reader = useContext(ReaderContext);
  const actions = owner || reader;
  if (!actions) throw new Error('Repository context missing');
  return actions;
}
