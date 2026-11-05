import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionPayload } from "@/lib/auth";
import {
  PermissionKey,
  canAccessPage as rbacCanAccessPage,
  hasPermission as rbacHasPermission,
} from "@/lib/rbac";

interface AuthResult {
  success: boolean;
  message?: string;
  lockedOut?: boolean;
  remainingAttempts?: number;
  remainingSeconds?: number;
  unlockAt?: string;
}

interface AuthState {
  user: SessionPayload | null;
  isAuthenticated: boolean;
  setupDone: boolean | null;
  isLocked: boolean;
  loading: boolean;
  lastActivityAt: number;
  checkSession: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<AuthResult>;
  unlockScreen: (password: string) => Promise<AuthResult>;
  lockScreen: (reason?: string) => Promise<void>;
  logout: () => Promise<void>;
  touchActivity: () => void;
  hasPermission: (permission: PermissionKey) => boolean;
  canAccessPage: (pathname: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      setupDone: null,
      isLocked: false,
      loading: true,
      lastActivityAt: Date.now(),

      checkSession: async () => {
        set({ loading: true });
        try {
          const res = await fetch("/api/auth/admin", {
            method: "GET",
            cache: "no-store",
          });
          const data = await res.json();
          const setupDone =
            typeof data.setupDone === "boolean" ? data.setupDone : true;

          if (res.ok && data.authenticated && data.session) {
            set({
              user: data.session,
              isAuthenticated: true,
              setupDone,
              isLocked: Boolean(data.locked),
              loading: false,
              lastActivityAt: data.locked ? get().lastActivityAt : Date.now(),
            });
          } else {
            set({
              user: null,
              isAuthenticated: false,
              setupDone,
              isLocked: false,
              loading: false,
            });
          }
        } catch {
          set({ loading: false });
        }
      },

      login: async (identifier: string, password: string): Promise<AuthResult> => {
        try {
          const res = await fetch("/api/auth/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "login",
              identifier,
              password,
            }),
          });
          const data = await res.json();

          if (res.ok && data.success && data.session) {
            set({
              user: data.session,
              isAuthenticated: true,
              setupDone: true,
              isLocked: false,
              loading: false,
              lastActivityAt: Date.now(),
            });
            return { success: true, message: data.message };
          }

          return {
            success: false,
            message: data.message || "Invalid credentials.",
            lockedOut: Boolean(data.lockedOut),
            remainingAttempts: data.remainingAttempts,
            remainingSeconds: data.remainingSeconds,
            unlockAt: data.unlockAt,
          };
        } catch {
          return {
            success: false,
            message: "Network error while attempting to sign in.",
          };
        }
      },

      unlockScreen: async (password: string): Promise<AuthResult> => {
        const currentUser = get().user;
        try {
          const res = await fetch("/api/auth/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "unlock",
              userId: currentUser?.userId,
              identifier: currentUser?.username,
              password,
            }),
          });
          const data = await res.json();

          if (res.ok && data.success && data.session) {
            set({
              user: data.session,
              isAuthenticated: true,
              isLocked: false,
              lastActivityAt: Date.now(),
            });
            return { success: true, message: data.message };
          }

          return {
            success: false,
            message: data.message || "Incorrect password.",
            lockedOut: Boolean(data.lockedOut),
            remainingAttempts: data.remainingAttempts,
            remainingSeconds: data.remainingSeconds,
          };
        } catch {
          return {
            success: false,
            message: "Network error while unlocking screen.",
          };
        }
      },

      lockScreen: async (reason = "manual_or_inactivity_lock") => {
        set({ isLocked: true });
        try {
          await fetch("/api/auth/admin", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "lock", reason }),
          });
        } catch {
          // Local lock state already enforced
        }
      },

      logout: async () => {
        try {
          await fetch("/api/auth/admin", { method: "DELETE" });
        } catch {
          // Ignore network error on logout
        }
        set({
          user: null,
          isAuthenticated: false,
          isLocked: false,
          loading: false,
        });
      },

      touchActivity: () => {
        if (!get().isLocked) {
          set({ lastActivityAt: Date.now() });
        }
      },

      hasPermission: (permission: PermissionKey) => {
        const currentUser = get().user;
        if (!currentUser) return false;
        if (currentUser.role === "admin") return true;
        if (Array.isArray(currentUser.permissions)) {
          return currentUser.permissions.includes(permission);
        }
        return rbacHasPermission(
          { role: currentUser.role, branchId: currentUser.branchId },
          permission
        );
      },

      canAccessPage: (pathname: string) => {
        const currentUser = get().user;
        if (!currentUser) return false;
        return rbacCanAccessPage(
          {
            role: currentUser.role,
            permissions: currentUser.permissions,
            allowedPages: currentUser.allowedPages,
          },
          pathname
        );
      },
    }),
    {
      name: "med_pos_auth_state",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        isLocked: state.isLocked,
        lastActivityAt: state.lastActivityAt,
      }),
    }
  )
);
