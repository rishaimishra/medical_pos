"use client";

import { create } from "zustand";
import type { ResolvedEntitlements } from "@/lib/entitlements";
import type { FeatureKey, QuotaResourceKey } from "@/lib/saasFeatures";

export interface UsageMeterItem {
  key: QuotaResourceKey;
  label: string;
  unit: string;
  used: number;
  limit: number;
  percent: number;
}

export interface UpgradeModalPayload {
  open: boolean;
  featureKey?: FeatureKey | string;
  resource?: QuotaResourceKey | string;
  reason?: string;
  customMessage?: string;
  used?: number;
  limit?: number;
}

interface SubscriptionStoreState {
  loading: boolean;
  loaded: boolean;
  entitlements: ResolvedEntitlements | null;
  subscriptionDetails: any | null;
  storeInfo: any | null;
  platformCompany: any | null;
  usageMeters: UsageMeterItem[];
  plans: any[];
  payments: any[];
  razorpayConfigured: boolean;
  razorpayKeyId: string | null;
  upgradeModal: UpgradeModalPayload;
  fetchBillingStatus: () => Promise<void>;
  hasFeature: (feature: FeatureKey | FeatureKey[]) => boolean;
  openUpgradeModal: (opts: Omit<UpgradeModalPayload, "open">) => void;
  closeUpgradeModal: () => void;
  clearSubscription: () => void;
}

export const useSubscriptionStore = create<SubscriptionStoreState>((set, get) => ({
  loading: false,
  loaded: false,
  entitlements: null,
  subscriptionDetails: null,
  storeInfo: null,
  platformCompany: null,
  usageMeters: [],
  plans: [],
  payments: [],
  razorpayConfigured: false,
  razorpayKeyId: null,
  upgradeModal: { open: false },

  fetchBillingStatus: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/admin/billing/status", { cache: "no-store" });
      if (!res.ok) {
        set({ loading: false });
        return;
      }
      const json = await res.json();
      if (json.success) {
        set({
          loaded: true,
          loading: false,
          entitlements: json.entitlements || null,
          subscriptionDetails: json.subscriptionDetails || null,
          storeInfo: json.storeInfo || null,
          platformCompany: json.platformCompany || null,
          usageMeters: json.usageMeters || [],
          plans: json.plans || [],
          payments: json.payments || [],
          razorpayConfigured: Boolean(json.razorpayConfigured),
          razorpayKeyId: json.razorpayKeyId || null,
        });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  hasFeature: (feature) => {
    const { entitlements, loaded } = get();
    // Stay non-blocking before first client hydration finishes
    if (!loaded || !entitlements) return true;
    const keys = Array.isArray(feature) ? feature : [feature];
    return keys.some((k) => Boolean(entitlements.features?.[k]));
  },

  openUpgradeModal: (opts) => set({ upgradeModal: { open: true, ...opts } }),
  closeUpgradeModal: () => set({ upgradeModal: { open: false } }),

  clearSubscription: () =>
    set({
      loaded: false,
      loading: false,
      entitlements: null,
      subscriptionDetails: null,
      storeInfo: null,
      usageMeters: [],
      plans: [],
      payments: [],
      upgradeModal: { open: false },
    }),
}));
