"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight, Lock, Sparkles, X } from "lucide-react";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { QUOTA_RESOURCE_REGISTRY, SAAS_FEATURE_REGISTRY } from "@/lib/saasFeatures";

/**
 * MODULE 3.7.3: Global Upgrade & Feature-Lock Modal (`<UpgradeRequiredModal />`)
 * Opened when a user clicks a locked sidebar item or receives a 402/upgradeRequired API error.
 */
export function UpgradeRequiredModal() {
  const { upgradeModal, entitlements, closeUpgradeModal } = useSubscriptionStore();
  const { user } = useAuthStore();

  if (!upgradeModal.open) return null;

  const featureMeta = upgradeModal.featureKey
    ? SAAS_FEATURE_REGISTRY.find((f) => f.key === upgradeModal.featureKey)
    : undefined;

  const quotaMeta = upgradeModal.resource
    ? QUOTA_RESOURCE_REGISTRY.find((q) => q.key === upgradeModal.resource)
    : undefined;

  const title = featureMeta
    ? `${featureMeta.label} Locked`
    : quotaMeta
    ? `${quotaMeta.label} Limit Reached`
    : "Plan Upgrade Required";

  const description =
    upgradeModal.customMessage ||
    (featureMeta
      ? `${featureMeta.description} This capability is available starting on our ${featureMeta.recommendedTier} plan.`
      : quotaMeta && upgradeModal.used !== undefined && upgradeModal.limit !== undefined
      ? `You have used ${upgradeModal.used} of ${upgradeModal.limit} ${quotaMeta.unit} allowed on ${
          entitlements?.planName || "your current tier"
        }. Upgrade to unlock higher capacity.`
      : "This action is restricted on your current subscription tier or status. Please renew or upgrade your plan.");

  const isStoreAdmin = user?.role === "admin";
  const targetHref = upgradeModal.featureKey
    ? `/admin/billing?highlight=${encodeURIComponent(String(upgradeModal.featureKey))}`
    : "/admin/billing";

  return (
    <div
      className="fixed inset-0 z-[9990] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={closeUpgradeModal}
    >
      <div
        className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-[#1F4E5B] to-[#0F766E] p-5 text-white flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/15 text-amber-200">
                <Sparkles className="w-3 h-3" />
                {featureMeta ? `${featureMeta.recommendedTier} Feature` : "Subscription Gate"}
              </span>
              <h3 className="text-base font-extrabold mt-1 leading-tight">{title}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={closeUpgradeModal}
            className="p-1.5 rounded-xl hover:bg-white/15 text-white/80 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">{description}</p>

          <div className="p-3 rounded-2xl bg-[#EAF2F4] border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Current Workspace Plan</p>
              <p className="font-extrabold text-[#1F4E5B] text-sm">
                {entitlements?.planName || "Free Trial / Starter"}
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 font-bold uppercase text-[10px] text-slate-700">
              {entitlements?.subscriptionStatus || "active"}
            </span>
          </div>

          {!isStoreAdmin ? (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
              <strong>Admin Approval Needed:</strong> Please contact your pharmacy Store Owner / Admin to upgrade or renew the subscription under{" "}
              <code className="font-mono">/admin/billing</code>.
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={closeUpgradeModal}
                className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Maybe Later
              </button>
              <Link
                href={targetHref}
                onClick={closeUpgradeModal}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Upgrade / View Plans</span>
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
