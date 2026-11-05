import { create } from "zustand";

export interface BranchItem {
  id: number;
  code: string;
  name: string;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstNo?: string | null;
  dlNo?: string | null;
  isMain: boolean;
  active: boolean;
}

interface BranchState {
  branches: BranchItem[];
  activeBranch: BranchItem | null;
  loading: boolean;
  fetchBranches: (preferredBranchId?: number | null) => Promise<void>;
  setActiveBranch: (branchId: number) => void;
  clearBranches: () => void;
}

const STORAGE_KEY = "med_pos_active_branch_id";

export const useBranchStore = create<BranchState>((set, get) => ({
  branches: [],
  activeBranch: null,
  loading: false,

  fetchBranches: async (preferredBranchId?: number | null) => {
    try {
      set({ loading: true });
      const res = await fetch("/api/admin/branches", { cache: "no-store" });
      if (!res.ok) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(STORAGE_KEY);
        }
        set({ branches: [], activeBranch: null, loading: false });
        return;
      }

      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const activeList: BranchItem[] = json.data.filter(
          (b: BranchItem) => b.active || b.isMain
        );
        let savedId: number | null = null;
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw) savedId = parseInt(raw, 10);
        }

        const matched =
          (preferredBranchId ? activeList.find((b) => b.id === preferredBranchId) : null) ||
          activeList.find((b) => b.id === savedId) ||
          activeList.find((b) => b.isMain) ||
          activeList[0] ||
          null;

        if (matched && typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, String(matched.id));
        } else if (typeof window !== "undefined") {
          window.localStorage.removeItem(STORAGE_KEY);
        }

        set({
          branches: json.data,
          activeBranch: matched,
          loading: false,
        });
      } else {
        set({ branches: [], activeBranch: null, loading: false });
      }
    } catch {
      set({ branches: [], activeBranch: null, loading: false });
    }
  },

  setActiveBranch: (branchId: number) => {
    const { branches } = get();
    const target = branches.find(
      (b) => b.id === branchId && (b.active || b.isMain)
    );
    if (target) {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, String(target.id));
      }
      set({ activeBranch: target });
    }
  },

  clearBranches: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    set({ branches: [], activeBranch: null });
  },
}));
