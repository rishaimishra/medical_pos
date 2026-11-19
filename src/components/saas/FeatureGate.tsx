"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { FeatureKey, QuotaResourceKey, SAAS_FEATURE_REGISTRY } from "@/lib/saasFeatures";

/**
 * Utility for parsing HTTP 402/403 API payloads and opening <UpgradeRequiredModal /> cleanly.
 */
export function promptUpgradeFromApiResponse(resJson: any): boolean {
  if (!resJson || !resJson.upgradeRequired) return false;
  useSubscriptionStore.getState().openUpgradeModal({
    featureKey: resJson.featureKey,
    resource: resJson.resource,
    reason: resJson.reason,
    customMessage: resJson.message || resJson.error,
    used: resJson.used,
    limit: resJson.limit,
  });
  return true;
}

interface FeatureGateProps {
  feature?: FeatureKey | FeatureKey[];
  quotaResource?: QuotaResourceKey;
  mode?: "replace" | "disable" | "hide";
  title?: string;
  children: React.ReactNode;
}

/**
 * MODULE 3.7.3: Inline SaaS Feature & Quota Gate (`<FeatureGate />`)
 */
export function FeatureGate({
  feature,
  quotaResource,
  mode = "replace",
  title,
  children,
}: FeatureGateProps) {
  const { loaded, entitlements, hasFeature, usageMeters, openUpgradeModal } = useSubscriptionStore();

  // Wait until hydrated so unlocked subscribers don't experience UI flash
  if (!loaded || !entitlements) {
    return <>{children}</>;
  }

  const featureAllowed = feature ? hasFeature(feature) : true;
  const meter = quotaResource ? usageMeters.find((m) => m.key === quotaResource) : undefined;
  const quotaAllowed = !meter || meter.limit === -1 ? true : meter.used < meter.limit;
  const locked = entitlements.isReadOnlyLocked || !featureAllowed || !quotaAllowed;

  if (!locked) {
    return <>{children}</>;
  }

  if (mode === "hide") return null;

  const firstKey = Array.isArray(feature) ? feature[0] : feature;
  const featMeta = firstKey ? SAAS_FEATURE_REGISTRY.find((f) => f.key === firstKey) : undefined;

  if (mode === "disable") {
    return (
      <div
        className="inline-flex items-center gap-1.5 relative group cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openUpgradeModal({
            featureKey: firstKey,
            resource: quotaResource,
            used: meter?.used,
            limit: meter?.limit,
          });
        }}
      >
        <div className="opacity-50 pointer-events-none select-none">{children}</div>
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-extrabold">
          <Lock className="w-2.5 h-2.5" /> PRO
        </span>
      </div>
    );
  }

  const targetHref = firstKey
    ? `/admin/billing?highlight=${encodeURIComponent(firstKey)}`
    : "/admin/billing";

  return (
    <div className="bg-white border border-amber-200 rounded-3xl p-8 text-center max-w-xl mx-auto my-6 shadow-xs space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
        <Lock className="w-6 h-6 text-amber-600" />
      </div>
      <div className="space-y-1">
        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-teal-50 text-teal-800 border border-teal-200">
          {featMeta ? `${featMeta.recommendedTier} Plan Feature` : "Plan Upgrade Needed"}
        </span>
        <h3 className="text-lg font-extrabold text-slate-900">
          {title || featMeta?.label || "Module Locked on Current Plan"}
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
          {!quotaAllowed && meter
            ? `You have reached the maximum quota of ${meter.limit} ${meter.unit} (${meter.used}/${meter.limit}) on ${entitlements.planName}.`
            : entitlements.isReadOnlyLocked
            ? "Your pharmacy subscription is currently expired or suspended. Renew now to unlock full operations."
            : featMeta?.description ||
              `Upgrade your ${entitlements.planName} subscription to unlock this workflow.`}
        </p>
      </div>
      <div className="pt-1 flex justify-center">
        <Link
          href={targetHref}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold transition-colors"
        >
          <span>Upgrade Plan</span>
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
