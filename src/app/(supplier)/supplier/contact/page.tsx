"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail, Send, Truck, AlertTriangle } from "lucide-react";

export default function SupplierContactPage() {
  const [companyName, setCompanyName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/supplier/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          senderEmail: senderEmail.trim(),
          phone: phone.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSuccessMsg(json.message || "Your message has been delivered to Pharmacy Administration.");
        setSubject("");
        setMessage("");
      } else {
        setErrorMsg(json.message || "Could not send inquiry.");
      }
    } catch {
      setErrorMsg("Network error submitting contact form.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg mb-4 flex items-center justify-between text-xs">
        <Link href="/supplier/login" className="inline-flex items-center gap-1.5 text-indigo-300 hover:text-white font-bold">
          <ArrowLeft className="w-4 h-4" />
          Back to Supplier Login
        </Link>
        <span className="inline-flex items-center gap-1 text-indigo-200 font-semibold">
          <Truck className="w-4 h-4" /> Distributor Desk
        </span>
      </div>

      <div className="w-full max-w-lg bg-white text-slate-900 rounded-3xl border border-indigo-200 shadow-2xl overflow-hidden">
        <div className="bg-[#283566] text-white px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold">Contact Pharmacy Purchasing Desk</h1>
            <p className="text-xs text-indigo-100 mt-0.5">
              Submit supply quotes, onboarding requests, or dispatch queries straight to Admin Inbox.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Company / Distributor Name *</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. MedLine Distributors Pvt Ltd"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Contact Email *</label>
                <input
                  type="email"
                  required
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="sales@distributor.com"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Subject *</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Updated wholesale rate card / PO dispatch status"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Message *</label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your message for pharmacy administration..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-[#283566] hover:bg-[#1c264a] text-white font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {submitting ? "Sending Inquiry..." : "Send to Pharmacy Inbox"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
