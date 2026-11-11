"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { User, Search, UserCheck, Plus, AlertCircle, Phone, MapPin, CreditCard, HeartPulse } from "lucide-react";
import { useCartStore, CustomerDetails } from "@/stores/useCartStore";
import { toast } from "@/stores/useToastStore";

interface CustomerLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CustomerLookupModal({ isOpen, onClose }: CustomerLookupModalProps) {
  const { customer, setCustomer } = useCartStore();
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // New customer form state
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newCreditLimit, setNewCreditLimit] = useState("0");
  const [newIsChronic, setNewIsChronic] = useState(false);
  const [newChronicDiseases, setNewChronicDiseases] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      fetchCustomers("");
    } else {
      setShowAddForm(false);
      setFormError(null);
    }
  }, [isOpen]);

  const fetchCustomers = async (query: string) => {
    try {
      setLoading(true);
      const url = `/api/admin/customers?search=${encodeURIComponent(query)}&limit=15`;
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setCustomers(json.data);
        setSelectedIndex(0);
      } else {
        setCustomers([]);
      }
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    fetchCustomers(val);
  };

  const handleSelectCustomer = (c: any | null) => {
    if (!c) {
      setCustomer(null);
      toast.info("Selected: Walk-in Customer");
      onClose();
      return;
    }

    const custDetails: CustomerDetails = {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email || null,
      address: c.address || null,
      creditLimit: Number(c.creditLimit || 0),
      currentDue: Number(c.currentDue || 0),
      isChronic: Boolean(c.isChronic),
    };

    setCustomer(custDetails);
    toast.success(`Selected customer: ${c.name}`);
    onClose();
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      setFormError("Name and mobile phone are required.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const res = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim(),
          email: newEmail.trim() || undefined,
          address: newAddress.trim() || undefined,
          creditLimit: parseFloat(newCreditLimit) || 0,
          isChronic: newIsChronic,
          chronicDiseases: newIsChronic ? newChronicDiseases.trim() : undefined,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        toast.success(`Customer ${json.data.name} created successfully!`);
        handleSelectCustomer(json.data);
      } else {
        setFormError(json.message || "Failed to create customer");
      }
    } catch (err: any) {
      setFormError(err?.message || "Network error while saving customer");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showAddForm) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < customers.length ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex === 0) {
        handleSelectCustomer(null); // Walk-in
      } else if (customers[selectedIndex - 1]) {
        handleSelectCustomer(customers[selectedIndex - 1]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Customer / Patient Directory"
      description="Select registered customer for Baki Khata or Chronic Health tracking"
      headerIcon={
        <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-[#1F4E5B] flex items-center justify-center">
          <User className="w-5 h-5" />
        </div>
      }
      size="xl"
    >
      <div className="space-y-4" onKeyDown={handleKeyDown}>
        {!showAddForm ? (
          <>
            {/* Search Bar & Add Customer Button */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={handleSearchChange}
                  placeholder="Search customer by Name, Phone, or Disease..."
                  className="w-full bg-slate-50 border border-slate-300 focus:border-[#1F4E5B] rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2.5 rounded-2xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>New Customer</span>
              </button>
            </div>

            {/* Customer List */}
            <div className="max-h-80 overflow-y-auto space-y-2 [scrollbar-width:thin]">
              {/* Walk-in Customer Option */}
              <div
                onClick={() => handleSelectCustomer(null)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  !customer
                    ? "bg-teal-50/80 border-[#1F4E5B] shadow-2xs"
                    : selectedIndex === 0
                    ? "bg-slate-100 border-slate-300"
                    : "bg-white border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900">
                      Walk-in Customer
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Standard counter sale (Cash / UPI / Card only, no credit)
                    </p>
                  </div>
                </div>
                {!customer && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-[#1F4E5B]">
                    Active
                  </span>
                )}
              </div>

              {/* Registered Customers */}
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Searching customers...
                </div>
              ) : customers.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No customers found matching &quot;{search}&quot;.
                </div>
              ) : (
                customers.map((c, index) => {
                  const isSelected = customer?.id === c.id;
                  const isHighlighted = selectedIndex === index + 1;
                  const creditLimit = Number(c.creditLimit || 0);
                  const currentDue = Number(c.currentDue || 0);

                  return (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCustomer(c)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-wrap items-center justify-between gap-3 ${
                        isSelected
                          ? "bg-teal-50/80 border-[#1F4E5B] shadow-2xs"
                          : isHighlighted
                          ? "bg-slate-100 border-slate-300"
                          : "bg-white border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-[#1F4E5B] font-extrabold text-xs shrink-0">
                          {c.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-extrabold text-slate-900 truncate">
                              {c.name}
                            </h4>
                            {c.isChronic && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 shrink-0">
                                <HeartPulse className="w-2.5 h-2.5" />
                                {c.chronicDiseases || "Chronic"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {c.phone}
                            </span>
                            {c.address && (
                              <span className="flex items-center gap-1 truncate max-w-[180px]">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                {c.address}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">
                            Baki Khata Limit
                          </p>
                          <p className="text-xs font-bold text-slate-800">
                            ₹{creditLimit.toFixed(2)}
                            {currentDue > 0 && (
                              <span className="text-rose-600 font-bold ml-1 text-[11px]">
                                (Due: ₹{currentDue.toFixed(2)})
                              </span>
                            )}
                          </p>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-[#1F4E5B]">
                            Selected
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          /* Inline New Customer Form */
          <form onSubmit={handleCreateCustomer} className="space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h4 className="text-xs font-extrabold text-slate-900">
                Register New Customer
              </h4>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-xs text-slate-500 hover:text-slate-800 font-bold"
              >
                Back to Search
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mobile Phone (10-15 digits) *
                </label>
                <input
                  type="text"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="patient@example.com"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Credit Limit (₹ Baki Khata)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={newCreditLimit}
                  onChange={(e) => setNewCreditLimit(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Residential Address
                </label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Street / Locality, City"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                />
              </div>

              <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chronicCheck"
                  checked={newIsChronic}
                  onChange={(e) => setNewIsChronic(e.target.checked)}
                  className="rounded text-[#1F4E5B] focus:ring-[#1F4E5B]"
                />
                <label htmlFor="chronicCheck" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Tag as Chronic Patient (Routine Medicine Refills)
                </label>
              </div>

              {newIsChronic && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Chronic Conditions (e.g. Diabetes, Hypertension, Asthma)
                  </label>
                  <input
                    type="text"
                    value={newChronicDiseases}
                    onChange={(e) => setNewChronicDiseases(e.target.value)}
                    placeholder="e.g. Diabetes Type 2, Hypertension"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#1F4E5B]"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-[#1F4E5B] hover:bg-[#163a44] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                {saving ? "Saving..." : "Save & Select Customer"}
              </button>
            </div>
          </form>
        )}

        <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-[11px] text-slate-400">
          <span>Shortcuts: [Arrow Keys] Navigate • [Enter] Select • [Esc] Close</span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold text-slate-500 hover:text-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
