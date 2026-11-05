import { create } from "zustand";

export interface CartItem {
  medicineId: number;
  medicineName: string;
  batchId: number;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  availableStock: number;
  unitPrice: number; // MRP
  taxPercent: number;
  isLooseUnit?: boolean;
}

interface CartState {
  items: CartItem[];
  discountAmount: number;
  paymentMethod: "cash" | "upi" | "card" | "cheque" | "credit";
  customerId: number | null;
  customerName: string | null;
  doctorName: string;
  doctorRegNo: string;

  // Actions
  addItem: (item: CartItem) => void;
  removeItem: (batchId: number) => void;
  updateQuantity: (batchId: number, qty: number) => void;
  setDiscount: (amount: number) => void;
  setPaymentMethod: (method: CartState["paymentMethod"]) => void;
  setCustomer: (id: number | null, name: string | null) => void;
  setDoctor: (name: string, regNo: string) => void;
  clearCart: () => void;

  // Computed
  getSubtotal: () => number;
  getTotalGst: () => number;
  getGrandTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discountAmount: 0,
  paymentMethod: "cash",
  customerId: null,
  customerName: "Walk-in Customer",
  doctorName: "",
  doctorRegNo: "",

  addItem: (item) => {
    set((state) => {
      const existing = state.items.find((i) => i.batchId === item.batchId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.batchId === item.batchId
              ? { ...i, quantity: i.quantity + item.quantity }
              : i
          ),
        };
      }
      return { items: [...state.items, item] };
    });
  },

  removeItem: (batchId) => {
    set((state) => ({
      items: state.items.filter((i) => i.batchId !== batchId),
    }));
  },

  updateQuantity: (batchId, qty) => {
    set((state) => ({
      items: state.items.map((i) =>
        i.batchId === batchId ? { ...i, quantity: Math.max(1, qty) } : i
      ),
    }));
  },

  setDiscount: (discountAmount) => set({ discountAmount }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setCustomer: (customerId, customerName) => set({ customerId, customerName }),
  setDoctor: (doctorName, doctorRegNo) => set({ doctorName, doctorRegNo }),
  clearCart: () =>
    set({
      items: [],
      discountAmount: 0,
      paymentMethod: "cash",
      customerId: null,
      customerName: "Walk-in Customer",
      doctorName: "",
      doctorRegNo: "",
    }),

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
}));

