import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
  resolve?: (value: boolean) => void;
}

interface ConfirmState {
  isOpen: boolean;
  options: ConfirmOptions | null;
  askConfirm: (options: Omit<ConfirmOptions, "resolve">) => Promise<boolean>;
  close: (result: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  isOpen: false,
  options: null,

  askConfirm: (options) => {
    return new Promise<boolean>((resolve) => {
      set({
        isOpen: true,
        options: {
          ...options,
          confirmText: options.confirmText || "Confirm",
          cancelText: options.cancelText || "Cancel",
          type: options.type || "danger",
          resolve,
        },
      });
    });
  },

  close: (result: boolean) => {
    const { options } = get();
    if (options?.resolve) {
      options.resolve(result);
    }
    set({ isOpen: false, options: null });
  },
}));

export const confirmAction = (options: Omit<ConfirmOptions, "resolve">): Promise<boolean> => {
  return useConfirmStore.getState().askConfirm(options);
};
