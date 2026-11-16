import { create } from "zustand";

export interface CartItem {
  medicineId: number;
  medicineName: string;
  genericName?: string;
  rackLocation?: string;
  scheduleType?: string;
  batchId: number;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  availableStock: number;
  unitPrice: number; // MRP
  taxPercent: number;
  isLooseUnit?: boolean;
  // Module 2.4.2: Item-Level Discounts & Manager Approvals
  discountPercent?: number; // e.g. 5%
  discountAmount?: number; // Calculated or flat ₹ deduction for this line
  managerApprovedBy?: string; // Manager who authorized if > cashier threshold
  managerOverrideToken?: string; // Signed HMAC override token
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
  branchId?: number | null;
  items: CartItem[];
  customer: CustomerDetails | null;
  discountAmount: number;
  discountPercent: number;
  discountId: number | null;
  managerApprovedBillDiscount: ManagerApproval | null;
  doctorName: string;
  doctorRegNo: string;
}

export interface ManagerApproval {
  managerName: string;
  managerId: number;
  percent: number;
  token?: string;
}

interface CartState {
  items: CartItem[];
  discountAmount: number; // Bill-level discount amount in ₹
  discountPercent: number; // Bill-level discount %
  discountId: number | null; // Master Discount policy ID
  managerApprovedBillDiscount: ManagerApproval | null;
  paymentMethod: "cash" | "upi" | "card" | "cheque" | "credit" | "split";
  
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
  
  // Item-level discount actions (Module 2.4.2)
  updateItemDiscount: (batchId: number, amount: number, percent?: number, approvedBy?: string, overrideToken?: string) => void;
  removeItemDiscount: (batchId: number) => void;

  // Bill-level discount actions
  setDiscount: (amount: number, percent?: number, discountId?: number | null) => void;
  setManagerApprovedBillDiscount: (approval: ManagerApproval | null) => void;

  setPaymentMethod: (method: CartState["paymentMethod"]) => void;
  setTenderedAmount: (amount: number) => void;
  setPaymentDetails: (details: { upiRef?: string; chequeNo?: string; chequeBank?: string; chequeDate?: string }) => void;
  setCustomer: (customer: CustomerDetails | null) => void;
  setDoctor: (name: string, regNo: string) => void;
  clearCart: (clearParked?: boolean) => void;

  // Park & Recall
  parkCurrentBill: (branchId?: number | null) => string | null;
  recallParkedBill: (parkedId: string, branchId?: number | null) => boolean;
  discardParkedBill: (parkedId: string) => void;

  // Computed Methods
  getSubtotal: () => number; // Gross total before any discounts
  getTotalItemDiscounts: () => number; // Total item-level discounts
  getSubtotalAfterItemDiscounts: () => number; // Net total after item discounts
  getTotalDiscount: () => number; // Item discounts + Bill-level discount
  getTotalGst: () => number;
  getGrandTotal: () => number;
  getChangeDue: () => number;
}

function recalculateBillDiscount(
  items: CartItem[],
  discountAmount: number,
  discountPercent: number
): number {
  const afterItem = items.reduce((sum, item) => {
    const gross = item.unitPrice * item.quantity;
    return sum + Math.max(0, gross - (item.discountAmount || 0));
  }, 0);
  if (afterItem <= 0) return 0;
  if (discountPercent > 0) {
    return Math.round(((afterItem * discountPercent) / 100) * 100) / 100;
  }
  return Math.min(afterItem, Math.max(0, discountAmount));
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discountAmount: 0,
  discountPercent: 0,
  discountId: null,
  managerApprovedBillDiscount: null,
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
      let nextItems: CartItem[];
      if (existing) {
        // Strict Stock Cap (Module 2.1.5): Never exceed available batch stock
        const newQty = Math.min(existing.quantity + item.quantity, item.availableStock);
        // Recalculate item-level discount if percentage was set
        let itemDiscountAmt = existing.discountAmount || 0;
        if (existing.discountPercent && existing.discountPercent > 0) {
          itemDiscountAmt = (existing.unitPrice * newQty * existing.discountPercent) / 100;
        }

        nextItems = state.items.map((i) =>
          i.batchId === item.batchId
            ? { ...i, quantity: newQty, discountAmount: itemDiscountAmt }
            : i
        );
      } else {
        // Strict Stock Cap for new item
        const safeQty = Math.min(Math.max(1, item.quantity), item.availableStock);
        nextItems = [...state.items, { ...item, quantity: safeQty }];
      }
      return {
        items: nextItems,
        discountAmount: recalculateBillDiscount(nextItems, state.discountAmount, state.discountPercent),
      };
    });
  },

  removeItem: (batchId) => {
    set((state) => {
      const nextItems = state.items.filter((i) => i.batchId !== batchId);
      return {
        items: nextItems,
        discountAmount: recalculateBillDiscount(nextItems, state.discountAmount, state.discountPercent),
      };
    });
  },

  updateQuantity: (batchId, qty) => {
    set((state) => {
      const target = state.items.find((i) => i.batchId === batchId);
      if (!target) return state;
      // Strict Stock Cap (Module 2.1.5)
      const safeQty = Math.min(Math.max(1, qty), Math.max(1, target.availableStock));

      // Recalculate line discount if percentage was present, otherwise clamp flat discount
      let lineDiscount = Math.min(target.discountAmount || 0, target.unitPrice * safeQty);
      if (target.discountPercent && target.discountPercent > 0) {
        lineDiscount = (target.unitPrice * safeQty * target.discountPercent) / 100;
      }

      const nextItems = state.items.map((i) =>
        i.batchId === batchId
          ? { ...i, quantity: safeQty, discountAmount: lineDiscount }
          : i
      );
      return {
        items: nextItems,
        discountAmount: recalculateBillDiscount(nextItems, state.discountAmount, state.discountPercent),
      };
    });
  },

  updateBatch: (oldBatchId, newBatch) => {
    set((state) => {
      const source = state.items.find((i) => i.batchId === oldBatchId);
      if (!source) return state;

      const targetBatchId = newBatch.batchId ?? oldBatchId;
      const existingTarget =
        targetBatchId !== oldBatchId
          ? state.items.find((i) => i.batchId === targetBatchId)
          : undefined;

      let nextItems: CartItem[];
      if (existingTarget) {
        // Merge into existing batch row instead of creating duplicate batchId rows
        const maxStock = newBatch.availableStock ?? existingTarget.availableStock;
        const mergedQty = Math.min(existingTarget.quantity + source.quantity, maxStock);
        nextItems = state.items
          .filter((i) => i.batchId !== oldBatchId)
          .map((i) => {
            if (i.batchId === targetBatchId) {
              const unitPrice = newBatch.unitPrice ?? i.unitPrice;
              const discAmt =
                i.discountPercent && i.discountPercent > 0
                  ? (unitPrice * mergedQty * i.discountPercent) / 100
                  : Math.min(i.discountAmount || 0, unitPrice * mergedQty);
              return {
                ...i,
                ...newBatch,
                quantity: mergedQty,
                discountAmount: discAmt,
              };
            }
            return i;
          });
      } else {
        nextItems = state.items.map((i) => {
          if (i.batchId === oldBatchId) {
            const updated = { ...i, ...newBatch };
            updated.quantity = Math.min(i.quantity, Math.max(1, updated.availableStock));
            if (updated.discountPercent && updated.discountPercent > 0) {
              updated.discountAmount =
                (updated.unitPrice * updated.quantity * updated.discountPercent) / 100;
            } else if (updated.discountAmount) {
              updated.discountAmount = Math.min(
                updated.discountAmount,
                updated.unitPrice * updated.quantity
              );
            }
            return updated;
          }
          return i;
        });
      }

      return {
        items: nextItems,
        discountAmount: recalculateBillDiscount(nextItems, state.discountAmount, state.discountPercent),
      };
    });
  },

  updateItemDiscount: (batchId, amount, percent = 0, approvedBy, overrideToken) => {
    set((state) => {
      const nextItems = state.items.map((i) => {
        if (i.batchId === batchId) {
          const lineGross = i.unitPrice * i.quantity;
          const safeDiscount = Math.min(Math.max(0, amount), lineGross);
          return {
            ...i,
            discountAmount: safeDiscount,
            discountPercent: percent,
            managerApprovedBy: approvedBy ?? undefined,
            managerOverrideToken: overrideToken ?? undefined,
          };
        }
        return i;
      });
      return {
        items: nextItems,
        discountAmount: recalculateBillDiscount(nextItems, state.discountAmount, state.discountPercent),
      };
    });
  },

  removeItemDiscount: (batchId) => {
    set((state) => {
      const nextItems = state.items.map((i) =>
        i.batchId === batchId
          ? {
              ...i,
              discountAmount: 0,
              discountPercent: 0,
              managerApprovedBy: undefined,
              managerOverrideToken: undefined,
            }
          : i
      );
      return {
        items: nextItems,
        discountAmount: recalculateBillDiscount(nextItems, state.discountAmount, state.discountPercent),
      };
    });
  },

  setDiscount: (amount, percent = 0, discountId = null) =>
    set({ discountAmount: Math.max(0, amount), discountPercent: percent, discountId }),

  setManagerApprovedBillDiscount: (managerApprovedBillDiscount) =>
    set({ managerApprovedBillDiscount }),

  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),

  setTenderedAmount: (tenderedAmount) => set({ tenderedAmount: Math.max(0, tenderedAmount) }),

  setPaymentDetails: (details) => set((state) => ({ ...state, ...details })),

  setCustomer: (customer) => set({ customer }),

  setDoctor: (doctorName, doctorRegNo) => set({ doctorName, doctorRegNo }),

  clearCart: (clearParked = false) =>
    set((state) => ({
      items: [],
      discountAmount: 0,
      discountPercent: 0,
      discountId: null,
      managerApprovedBillDiscount: null,
      paymentMethod: "cash",
      tenderedAmount: 0,
      upiRef: "",
      chequeNo: "",
      chequeBank: "",
      chequeDate: new Date().toISOString().split("T")[0],
      customer: null,
      doctorName: "",
      doctorRegNo: "",
      parkedBills: clearParked ? [] : state.parkedBills,
    })),

  parkCurrentBill: (branchId = null) => {
    const {
      items,
      customer,
      discountAmount,
      discountPercent,
      discountId,
      managerApprovedBillDiscount,
      doctorName,
      doctorRegNo,
    } = get();
    if (items.length === 0) return null;

    const parkedId = `park_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newParked: ParkedBill = {
      id: parkedId,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      branchId,
      items: [...items],
      customer,
      discountAmount,
      discountPercent,
      discountId,
      managerApprovedBillDiscount,
      doctorName,
      doctorRegNo,
    };

    set((state) => ({
      parkedBills: [newParked, ...state.parkedBills],
    }));

    get().clearCart();
    return parkedId;
  },

  recallParkedBill: (parkedId, branchId = null) => {
    const { parkedBills, items } = get();
    const target = parkedBills.find((b) => b.id === parkedId);
    if (!target) return false;
    if (target.branchId && branchId && target.branchId !== branchId) {
      return false;
    }

    // Preserve active non-empty cart as a parked bill before recalling
    if (items.length > 0) {
      get().parkCurrentBill(branchId);
    }

    set((state) => ({
      items: target.items,
      customer: target.customer,
      discountAmount: target.discountAmount,
      discountPercent: target.discountPercent,
      discountId: target.discountId,
      managerApprovedBillDiscount: target.managerApprovedBillDiscount,
      doctorName: target.doctorName,
      doctorRegNo: target.doctorRegNo,
      parkedBills: state.parkedBills.filter((b) => b.id !== parkedId),
    }));
    return true;
  },

  discardParkedBill: (parkedId) => {
    set((state) => ({
      parkedBills: state.parkedBills.filter((b) => b.id !== parkedId),
    }));
  },

  // 1. Gross subtotal before any discounts
  getSubtotal: () => {
    return get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  },

  // 2. Total item-level discounts
  getTotalItemDiscounts: () => {
    return get().items.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
  },

  // 3. Subtotal after line item discounts
  getSubtotalAfterItemDiscounts: () => {
    const gross = get().getSubtotal();
    const itemDiscounts = get().getTotalItemDiscounts();
    return Math.max(0, gross - itemDiscounts);
  },

  // 4. Total discount (Item discounts + Bill-level discount)
  getTotalDiscount: () => {
    const afterItem = get().getSubtotalAfterItemDiscounts();
    const effectiveBillDisc = Math.min(afterItem, get().discountAmount);
    return get().getTotalItemDiscounts() + effectiveBillDisc;
  },

  // 5. Total GST: Calculated on taxable base after both item and bill discounts
  getTotalGst: () => {
    const afterItem = get().getSubtotalAfterItemDiscounts();
    const billDisc = Math.min(afterItem, get().discountAmount);
    const ratio = afterItem > 0 ? Math.max(0, afterItem - billDisc) / afterItem : 0;

    return get().items.reduce((sum, item) => {
      const lineGross = item.unitPrice * item.quantity;
      const lineNet = Math.max(0, lineGross - (item.discountAmount || 0)) * ratio;
      const taxable = lineNet / (1 + item.taxPercent / 100);
      return sum + (lineNet - taxable);
    }, 0);
  },

  // 6. Grand total: Subtotal after item discounts minus bill discount, rounded to 2 decimals
  getGrandTotal: () => {
    const afterItem = get().getSubtotalAfterItemDiscounts();
    const billDiscount = Math.min(afterItem, get().discountAmount);
    return Math.round(Math.max(0, afterItem - billDiscount) * 100) / 100;
  },

  getChangeDue: () => {
    const grandTotal = get().getGrandTotal();
    const tendered = get().tenderedAmount;
    return Math.max(0, tendered - grandTotal);
  },
}));
