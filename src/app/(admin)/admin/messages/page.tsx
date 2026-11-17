"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCheck,
  ExternalLink,
  FileText,
  Inbox,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Trash2,
  Truck,
  User,
  X,
} from "lucide-react";
import { toast } from "@/stores/useToastStore";
import { confirmAction } from "@/stores/useConfirmStore";

interface SupplierOption {
  id: number;
  name: string;
  email: string | null;
  phone: string;
}

interface SupplierMessageRow {
  id: number;
  supplierId: number;
  supplierName: string | null;
  senderEmail: string | null;
  subject: string;
  message: string;
  direction: "in" | "out";
  reply: string | null;
  repliedAt: string | null;
  status: "unread" | "read" | "replied";
  createdAt: string;
  supplier?: {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    contact: string | null;
  };
}

interface PatientConversationSummary {
  customerId: number;
  name: string;
  phone: string;
  email: string | null;
  isChronic: boolean;
  unreadCount: number;
  totalCount: number;
  lastMessage: string;
  lastFileName: string | null;
  lastAt: string;
}

interface PatientThreadMessage {
  id: number;
  customerId: number;
  direction: "in" | "out";
  message: string | null;
  hasFile: boolean;
  fileName: string | null;
  fileType: string | null;
  fileUrl: string | null;
  isRead: boolean;
  creatorName: string | null;
  createdAt: string;
}

export default function AdminMessagesPage() {
  const [activeTab, setActiveTab] = useState<"patients" | "suppliers">("patients");

  // =========================================================================
  // PATIENT MESSAGE INBOX STATE (MODULE 2.20.1)
  // =========================================================================
  const [ptConversations, setPtConversations] = useState<PatientConversationSummary[]>([]);
  const [ptTotalUnread, setPtTotalUnread] = useState(0);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [ptThread, setPtThread] = useState<PatientThreadMessage[]>([]);
  const [ptCustomers, setPtCustomers] = useState<Array<{ id: number; name: string; phone: string }>>([]);
  const [ptSearch, setPtSearch] = useState("");
  const [ptLoading, setPtLoading] = useState(true);
  const [ptReplyText, setPtReplyText] = useState("");
  const [ptSending, setPtSending] = useState(false);

  // =========================================================================
  // SUPPLIER MESSAGE INBOX STATE (MODULE 2.17.2 & 2.20.2)
  // =========================================================================
  const [messages, setMessages] = useState<SupplierMessageRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supUnreadCount, setSupUnreadCount] = useState(0);
  const [supLoading, setSupLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [supSearch, setSupSearch] = useState("");

  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSupplierId, setComposeSupplierId] = useState<string>("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sendingCompose, setSendingCompose] = useState(false);

  const fetchPatientInbox = useCallback(
    async (explicitCustId?: number | null) => {
      setPtLoading(true);
      try {
        const p = new URLSearchParams();
        const cid = explicitCustId !== undefined ? explicitCustId : selectedCustomerId;
        if (cid) p.set("customerId", String(cid));
        if (ptSearch.trim()) p.set("search", ptSearch.trim());

        const res = await fetch(`/api/admin/patient-messages?${p.toString()}`, { cache: "no-store" });
        const data = await res.json();
        if (res.ok && data.success) {
          setPtConversations(data.conversations || []);
          setPtTotalUnread(data.totalUnreadCount || 0);
          setPtThread(data.thread || []);
          if (!cid && data.selectedCustomerId) {
            setSelectedCustomerId(data.selectedCustomerId);
          }
          if (Array.isArray(data.customers)) setPtCustomers(data.customers);
        }
      } finally {
        setPtLoading(false);
      }
    },
    [selectedCustomerId, ptSearch]
  );

  const fetchSupplierMessages = useCallback(async () => {
    setSupLoading(true);
    try {
      const p = new URLSearchParams();
      if (statusFilter !== "all") p.set("status", statusFilter);
      if (supplierFilter !== "all") p.set("supplierId", supplierFilter);
      if (supSearch.trim()) p.set("search", supSearch.trim());

      const res = await fetch(`/api/admin/messages?${p.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessages(data.messages || []);
        setSupUnreadCount(data.unreadCount || 0);
        if (Array.isArray(data.suppliers)) {
          setSuppliers(data.suppliers);
        }
      }
    } finally {
      setSupLoading(false);
    }
  }, [statusFilter, supplierFilter, supSearch]);

  useEffect(() => {
    fetchPatientInbox();
    fetchSupplierMessages();
  }, [fetchPatientInbox, fetchSupplierMessages]);

  const handleSelectPatient = (customerId: number) => {
    setSelectedCustomerId(customerId);
    fetchPatientInbox(customerId);
  };

  const handleSendPatientReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId || !ptReplyText.trim()) return;
    setPtSending(true);
    try {
      const res = await fetch("/api/admin/patient-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          message: ptReplyText.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPtReplyText("");
        toast.success("Reply sent to patient.");
        fetchPatientInbox(selectedCustomerId);
      } else {
        toast.error(data.message || "Failed to send reply");
      }
    } finally {
      setPtSending(false);
    }
  };

  const handleMarkPatientConversationRead = async (customerId: number) => {
    const res = await fetch("/api/admin/patient-messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, isRead: true }),
    });
    if (res.ok) {
      toast.success("Conversation marked as read.");
      fetchPatientInbox(customerId);
    }
  };

  const handleDeletePatientMessage = async (msgId: number) => {
    const confirmed = await confirmAction({
      title: "Delete Patient Message?",
      message: "This will delete the message and any uploaded attachment from storage.",
      confirmText: "Delete",
      cancelText: "Cancel",
      type: "danger",
    });
    if (!confirmed) return;

    const res = await fetch(`/api/admin/patient-messages?id=${msgId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Message deleted.");
      fetchPatientInbox(selectedCustomerId);
    }
  };

  const handleDeletePatientConversation = async (customerId: number) => {
    const confirmed = await confirmAction({
      title: "Delete Entire Conversation?",
      message: "All messages and prescription attachments in this patient's thread will be permanently deleted.",
      confirmText: "Delete Conversation",
      cancelText: "Cancel",
      type: "danger",
    });
    if (!confirmed) return;

    const res = await fetch(`/api/admin/patient-messages?customerId=${customerId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Conversation deleted.");
      setSelectedCustomerId(null);
      fetchPatientInbox(null);
    }
  };

  // Supplier Inbox Actions
  const handleMarkRead = async (id: number, currentStatus: string) => {
    const nextStatus = currentStatus === "unread" ? "read" : "unread";
    const res = await fetch(`/api/admin/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) fetchSupplierMessages();
  };

  const handleSendReply = async (id: number) => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/admin/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", reply: replyText.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Reply delivered to supplier.");
        setReplyingId(null);
        setReplyText("");
        fetchSupplierMessages();
      } else {
        toast.error(data.message || "Failed to send reply");
      }
    } finally {
      setSendingReply(false);
    }
  };

  const handleDeleteSupplierMsg = async (id: number) => {
    const confirmed = await confirmAction({
      title: "Delete Supplier Message?",
      message: "This will permanently remove this message thread from the pharmacy inbox.",
      confirmText: "Delete",
      cancelText: "Cancel",
      type: "danger",
    });
    if (!confirmed) return;

    const res = await fetch(`/api/admin/messages/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Message deleted.");
      fetchSupplierMessages();
    }
  };

  const handleComposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeSupplierId || !composeSubject.trim() || !composeBody.trim()) return;
    setSendingCompose(true);
    try {
      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(composeSupplierId),
          subject: composeSubject.trim(),
          message: composeBody.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Outbound message sent.");
        setComposeOpen(false);
        setComposeSupplierId("");
        setComposeSubject("");
        setComposeBody("");
        fetchSupplierMessages();
      } else {
        toast.error(data.message || "Failed to send message");
      }
    } finally {
      setSendingCompose(false);
    }
  };

  const selectedPatientSummary = ptConversations.find((c) => c.customerId === selectedCustomerId);
  const selectedPatientFromDir = ptCustomers.find((c) => c.id === selectedCustomerId);

  return (
    <div className="space-y-5 select-text max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-[#1F4E5B] text-white flex items-center justify-center shadow-xs">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Pharmacy Message Inboxes
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Patient two-way prescription/support inbox & Supplier distributor communication channel
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              fetchPatientInbox();
              fetchSupplierMessages();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(ptLoading || supLoading) ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {activeTab === "suppliers" && (
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-extrabold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Message Supplier
            </button>
          )}
        </div>
      </div>

      {/* Main Switch Tabs */}
      <div className="flex border-b border-slate-200 gap-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("patients")}
          className={`flex items-center gap-2 px-4 py-2.5 font-extrabold border-b-2 transition cursor-pointer ${
            activeTab === "patients"
              ? "border-[#1F4E5B] text-[#1F4E5B] bg-teal-50/40 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <User className="w-4 h-4" />
          <span>Patient Inbox</span>
          {ptTotalUnread > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-extrabold">
              {ptTotalUnread}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("suppliers")}
          className={`flex items-center gap-2 px-4 py-2.5 font-extrabold border-b-2 transition cursor-pointer ${
            activeTab === "suppliers"
              ? "border-[#1F4E5B] text-[#1F4E5B] bg-teal-50/40 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Supplier Inbox</span>
          {supUnreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-extrabold">
              {supUnreadCount}
            </span>
          )}
        </button>
      </div>

      {/* ================================================================== */}
      {/* TAB 1: PATIENT MESSAGE INBOX (2.20.1)                              */}
      {/* ================================================================== */}
      {activeTab === "patients" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Per-Patient Conversations */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3 h-fit">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={ptSearch}
                onChange={(e) => setPtSearch(e.target.value)}
                placeholder="Search patient name/phone..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
              />
            </div>

            {ptCustomers.length > 0 && (
              <select
                value={selectedCustomerId || ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id) handleSelectPatient(id);
                }}
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="">Jump to any patient...</option>
                {ptCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            )}

            <div className="space-y-1.5 max-h-[460px] overflow-y-auto">
              {ptConversations.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">No patient conversations yet.</p>
              ) : (
                ptConversations.map((c) => {
                  const active = c.customerId === selectedCustomerId;
                  return (
                    <button
                      key={c.customerId}
                      type="button"
                      onClick={() => handleSelectPatient(c.customerId)}
                      className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${
                        active
                          ? "border-[#1F4E5B] bg-[#EAF2F4]"
                          : c.unreadCount > 0
                          ? "border-amber-300 bg-amber-50/60 hover:bg-amber-50"
                          : "border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-slate-900 truncate">{c.name}</span>
                        {c.unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">{c.phone}</p>
                      <p className="text-[11px] text-slate-700 line-clamp-1 mt-1">{c.lastMessage}</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Active Patient Conversation Thread */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between min-h-[520px]">
            {!selectedCustomerId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-xs text-slate-400">
                <Inbox className="w-10 h-10 text-slate-300 mb-2" />
                Select a patient conversation on the left to view prescriptions &amp; reply.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      {selectedPatientSummary?.name || selectedPatientFromDir?.name || `Patient #${selectedCustomerId}`}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      {selectedPatientSummary?.phone || selectedPatientFromDir?.phone}
                      {selectedPatientSummary?.email ? ` • ${selectedPatientSummary.email}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    {(selectedPatientSummary?.unreadCount || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => handleMarkPatientConversationRead(selectedCustomerId)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark Read
                      </button>
                    )}
                    {ptThread.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleDeletePatientConversation(selectedCustomerId)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 font-bold text-rose-700 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Thread
                      </button>
                    )}
                  </div>
                </div>

                {/* Thread Messages */}
                <div className="flex-1 py-4 space-y-3 max-h-[360px] overflow-y-auto">
                  {ptThread.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">
                      No messages yet with this patient. Send a direct message below.
                    </p>
                  ) : (
                    ptThread.map((m) => {
                      const isOut = m.direction === "out";
                      return (
                        <div key={m.id} className={`flex flex-col ${isOut ? "items-end" : "items-start"}`}>
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs space-y-1.5 ${
                              isOut
                                ? "bg-[#1F4E5B] text-white"
                                : "bg-slate-100 text-slate-800 border border-slate-200"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-4 text-[10px] opacity-75 font-bold">
                              <span>{isOut ? m.creatorName || "Pharmacy Staff" : "Patient"}</span>
                              <span>
                                {new Date(m.createdAt).toLocaleString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            {m.message && <p className="whitespace-pre-wrap leading-relaxed">{m.message}</p>}
                            {m.fileUrl && (
                              <a
                                href={m.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                                  isOut ? "bg-white/15 text-white" : "bg-white text-[#1F4E5B] border border-slate-200"
                                }`}
                              >
                                <FileText className="w-3.5 h-3.5" />
                                {m.fileName || "Prescription Attachment"}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeletePatientMessage(m.id)}
                            className="text-[10px] text-slate-400 hover:text-rose-600 mt-0.5 px-2 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Staff Reply Form */}
                <form onSubmit={handleSendPatientReply} className="pt-3 border-t border-slate-100 flex gap-2">
                  <input
                    type="text"
                    required
                    value={ptReplyText}
                    onChange={(e) => setPtReplyText(e.target.value)}
                    placeholder="Write a reply to the patient (also notifies via email)..."
                    className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:outline-none focus:border-[#1F4E5B]"
                  />
                  <button
                    type="submit"
                    disabled={ptSending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-extrabold cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {ptSending ? "Sending..." : "Reply"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 2: SUPPLIER MESSAGE INBOX (2.17.2 & 2.20.2)                    */}
      {/* ================================================================== */}
      {activeTab === "suppliers" && (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                { key: "all", label: "All Threads" },
                { key: "unread", label: "Unread" },
                { key: "read", label: "Read" },
                { key: "replied", label: "Replied" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    statusFilter === tab.key
                      ? "bg-[#1F4E5B] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 flex-1 sm:flex-initial justify-end">
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="all">All Suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={supSearch}
                  onChange={(e) => setSupSearch(e.target.value)}
                  placeholder="Search subject or message..."
                  className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs w-52"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {messages.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">No supplier messages found</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isInbound = msg.direction === "in";
                const supplierTitle = msg.supplier?.name || msg.supplierName || "Supplier";
                const badgeTone =
                  msg.status === "unread"
                    ? "bg-rose-100 text-rose-700"
                    : msg.status === "replied"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-600";

                return (
                  <div
                    key={msg.id}
                    className={`bg-white rounded-2xl border p-5 shadow-2xs transition ${
                      msg.status === "unread" && isInbound ? "border-teal-400 ring-1 ring-teal-100" : "border-slate-200"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              isInbound ? "bg-indigo-100 text-indigo-800" : "bg-teal-100 text-teal-800"
                            }`}
                          >
                            {isInbound ? "From Supplier" : "Sent to Supplier"}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${badgeTone}`}>
                            {msg.status}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-800">
                            <Truck className="w-3.5 h-3.5 text-[#1F4E5B]" />
                            {supplierTitle}
                          </span>
                        </div>
                        <h3 className="text-sm font-extrabold text-slate-900 pt-1">{msg.subject}</h3>
                        <p className="text-xs text-slate-600 whitespace-pre-wrap">{msg.message}</p>
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {new Date(msg.createdAt).toLocaleString("en-IN")}
                      </span>
                    </div>

                    {msg.reply && (
                      <div className="mt-3 rounded-xl bg-emerald-50/70 border border-emerald-200 p-3 text-xs">
                        <p className="font-bold text-emerald-800 mb-0.5">Pharmacy Reply:</p>
                        <p className="text-emerald-950 whitespace-pre-wrap">{msg.reply}</p>
                      </div>
                    )}

                    {replyingId === msg.id && (
                      <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                        <textarea
                          rows={3}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Write your reply..."
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingId(null);
                              setReplyText("");
                            }}
                            className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={sendingReply}
                            onClick={() => handleSendReply(msg.id)}
                            className="px-3.5 py-1 rounded-lg bg-[#1F4E5B] text-white text-xs font-bold"
                          >
                            {sendingReply ? "Sending..." : "Send Reply"}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-end gap-2 text-xs">
                      {isInbound && msg.status !== "replied" && (
                        <button
                          type="button"
                          onClick={() => handleMarkRead(msg.id, msg.status)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {msg.status === "unread" ? "Mark Read" : "Mark Unread"}
                        </button>
                      )}
                      {isInbound && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingId(msg.id);
                            setReplyText(msg.reply || "");
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-teal-50 text-[#1F4E5B] font-bold cursor-pointer"
                        >
                          <Reply className="w-3.5 h-3.5" />
                          {msg.reply ? "Update Reply" : "Reply"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteSupplierMsg(msg.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Compose Supplier Modal */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#1F4E5B]" />
                <h2 className="text-sm font-extrabold text-slate-900">Send Direct Message to Supplier</h2>
              </div>
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleComposeSubmit} className="space-y-3 text-xs">
              <select
                required
                value={composeSupplierId}
                onChange={(e) => setComposeSupplierId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-semibold"
              >
                <option value="">Choose distributor...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.phone})
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Subject..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
              <textarea
                rows={4}
                required
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Message..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingCompose}
                  className="px-4 py-2 rounded-xl bg-[#1F4E5B] text-white font-extrabold"
                >
                  {sendingCompose ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
