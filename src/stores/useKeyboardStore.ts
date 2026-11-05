import { create } from "zustand";

interface KeyboardState {
  activeModal: "search" | "tender" | "customer" | "discount" | null;
  lastPressedKey: string | null;

  setActiveModal: (modal: KeyboardState["activeModal"]) => void;
  setLastPressedKey: (key: string | null) => void;
}

export const useKeyboardStore = create<KeyboardState>((set) => ({
  activeModal: null,
  lastPressedKey: null,

  setActiveModal: (activeModal) => set({ activeModal }),
  setLastPressedKey: (lastPressedKey) => set({ lastPressedKey }),
}));

