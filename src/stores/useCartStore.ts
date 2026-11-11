import { create } from "zustand";

export interface CartItem {
  medicineId: number;
  medicineName: string;
  genericName?: string;
  rackLocation?: string;
  batchId: number;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  availableStock: number;
  unitPrice: number; // MRP
  taxPercent: number;
  isLooseUnit?: boolean;
}

export interface CustomerDetails {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  creditLimit: number;
  currentDue: number;
  isChronic?: boolean;
}

export interface ParkedBill {
  id: string;
  createdAt: string;
  items: CartItem[];
  customer: CustomerDetails | null;
  discountAmount: number;
  doctorName: string;
  doctorRegNo: string;
}

interface CartState {
  items: CartItem[];
  discountAmount: number;
  discountPercent: number;
  discountId: number | null;
  paymentMethod: "cash" | "upi" | "card" | "cheque" | "credit";
  
  // Payment dynamic fields (Module 2.1.4)
  tenderedAmount: number;
  upiRef: string;
  chequeNo: string;
  chequeBank: string;
  chequeDate: string;

  // Customer
  customer: CustomerDetails | null;

  // Doctor Info
  doctorName: string;
  doctorRegNo: string;

  // Parked Bills
  parkedBills: ParkedBill[];

  // Actions
  addItem: (item: CartItem) => void;
  removeItem: (batchId: number) => void;
  updateQuantity: (batchId: number, qty: number) => void;
  updateBatch: (oldBatchId: number, newBatch: Partial<CartItem>) => void;
  setDiscount: (amount: number, percent?: number, discountId?: number | null) => void;
  setPaymentMethod: (method: CartState["paymentMethod"]) => void;
  setTenderedAmount: (amount: number) => void;
  setPaymentDetails: (details: { upiRef?: string; chequeNo?: string; chequeBank?: string; chequeDate?: string }) => void;
  setCustomer: (customer: CustomerDetails | null) => void;
  setDoctor: (name: string, regNo: string) => void;
  clearCart: () => void;

  // Park & Recall
  parkCurrentBill: () => string | null;
  recallParkedBill: (parkedId: string) => void;
  discardParkedBill: (parkedId: string) => void;

  // Computed
  getSubtotal: () => number;
  getTotalGst: () => number;
  getGrandTotal: () => number;
  getChangeDue: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discountAmount: 0,
  discountPercent: 0,
  discountId: null,
  paymentMethod: "cash",
  tenderedAmount: 0,
  upiRef: "",
  chequeNo: "",
  chequeBank: "",
  chequeDate: new Date().toISOString().split("T")[0],
  customer: null,
  doctorName: "",
  doctorRegNo: "",
  parkedBills: [],

  addItem: (item) => {
    set((state) => {
      const existing = state.items.find((i) => i.batchId === item.batchId);
      if (existing) {
        // Strict Stock Cap (Module 2.1.5): Never exceed available batch stock
        const newQty = Math.min(existing.quantity + item.quantity, item.availableStock);
        return {
          items: state.items.map((i) =>
            i.batchId === item.batchId ? { ...i, quantity: newQty } : i
          ),
        };
      }
      // Strict Stock Cap for new item
      const safeQty = Math.min(Math.max(1, item.quantity), item.availableStock);
      return { items: [...state.items, { ...item, quantity: safeQty }] };
    });
  },

  removeItem: (batchId) => {
    set((state) => ({
      items: state.items.filter((i) => i.batchId !== batchId),
    }));
  },

  updateQuantity: (batchId, qty) => {
    set((state) => {
      const target = state.items.find((i) => i.batchId === batchId);
      if (!target) return state;
      // Strict Stock Cap (Module 2.1.5)
      const safeQty = Math.min(Math.max(1, qty), target.availableStock);
      return {
        items: state.items.map((i) =>
          i.batchId === batchId ? { ...i, quantity: safeQty } : i
        ),
      };
    });
  },

  updateBatch: (oldBatchId, newBatch) => {
    set((state) => ({
      items: state.items.map((i) => {
        if (i.batchId === oldBatchId) {
          const updated = { ...i, ...newBatch };
          updated.quantity = Math.min(i.quantity, updated.availableStock);
          return updated;
        }
        return i;
      }),
    }));
  },

  setDiscount: (amount, percent = 0, discountId = null) =>
    set({ discountAmount: Math.max(0, amount), discountPercent: percent, discountId }),

  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),

  setTenderedAmount: (tenderedAmount) => set({ tenderedAmount: Math.max(0, tenderedAmount) }),

  setPaymentDetails: (details) => set((state) => ({ ...state, ...details })),

  setCustomer: (customer) => set({ customer }),

  setDoctor: (doctorName, doctorRegNo) => set({ doctorName, doctorRegNo }),

  clearCart: () =>
    set({
      items: [],
      discountAmount: 0,
      discountPercent: 0,
      discountId: null,
      paymentMethod: "cash",
      tenderedAmount: 0,
      upiRef: "",
      chequeNo: "",
      chequeBank: "",
      chequeDate: new Date().toISOString().split("T")[0],
      customer: null,
      doctorName: "",
      doctorRegNo: "",
    }),

  parkCurrentBill: () => {
    const { items, customer, discountAmount, doctorName, doctorRegNo } = get();
    if (items.length === 0) return null;

    const parkedId = `park_${Date.now()}`;
    const newParked: ParkedBill = {
      id: parkedId,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      items: [...items],
      customer,
      discountAmount,
      doctorName,
      doctorRegNo,
    };

    set((state) => ({
      parkedBills: [newParked, ...state.parkedBills],
    }));

    get().clearCart();
    return parkedId;
  },

  recallParkedBill: (parkedId) => {
    const { parkedBills } = get();
    const target = parkedBills.find((b) => b.id === parkedId);
    if (!target) return;

    set((state) => ({
      items: target.items,
      customer: target.customer,
      discountAmount: target.discountAmount,
      doctorName: target.doctorName,
      doctorRegNo: target.doctorRegNo,
      parkedBills: state.parkedBills.filter((b) => b.id !== parkedId),
    }));
  },

  discardParkedBill: (parkedId) => {
    set((state) => ({
      parkedBills: state.parkedBills.filter((b) => b.id !== parkedId),
    }));
  },

  getSubtotal: () => {
    return get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  },

  getTotalGst: () => {
    return get().items.reduce((sum, item) => {
      const lineTotal = item.unitPrice * item.quantity;
      const taxable = lineTotal / (1 + item.taxPercent / 100);
      return sum + (lineTotal - taxable);
    }, 0);
  },

  getGrandTotal: () => {
    const subtotal = get().getSubtotal();
    return Math.max(0, subtotal - get().discountAmount);
  },

  getChangeDue: () => {
    const grandTotal = get().getGrandTotal();
    const tendered = get().tenderedAmount;
    return Math.max(0, tendered - grandTotal);
  },
}));
