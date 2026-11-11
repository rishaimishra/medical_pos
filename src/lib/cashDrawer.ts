/**
 * Electronic Cash Drawer Kick Trigger & ESC/POS Command Generator (MODULE 2.5.2)
 *
 * Provides:
 * 1. Standard ESC/POS solenoid pulse byte sequences (Epson Pin 2 & 5, Star Micronics BEL).
 * 2. Hardware kick trigger via Web Audio register chime and ESC/POS byte generator.
 * 3. Client & server-side drawer trigger helpers with audit recording.
 */

import { playCashDrawerSound } from "./audioBeep";

// ESC/POS Command Sequences for RJ11 / RJ12 Cash Drawer Solenoids
export const ESC_POS_COMMANDS = {
  // ESC p 0 25 250 : Drawer Pin 2 (standard 50ms ON, 500ms OFF pulse)
  EPSON_PIN_2: [0x1b, 0x70, 0x00, 0x19, 0xfa],
  // ESC p 1 25 250 : Drawer Pin 5 (secondary drawer / alternative pin)
  EPSON_PIN_5: [0x1b, 0x70, 0x01, 0x19, 0xfa],
  // BEL (\x07) : Star Micronics / Citizen cash drawer kick
  STAR_BEL: [0x07],
  // ESC BEL : TVS / Posiflex auxiliary drawer pulse
  POSIFLEX_AUX: [0x1b, 0x07, 0x0b, 0x37],
} as const;

/**
 * Returns a Uint8Array containing standard ESC/POS pulse bytes
 * that can be transmitted directly to any thermal receipt printer via Web Serial,
 * Raw TCP, or Bluetooth SPP to open the cash drawer.
 */
export function getEscPosCashDrawerKickBytes(): Uint8Array {
  // Combine Pin 2 pulse, Pin 5 pulse, and Star BEL to guarantee compatibility across all drawer brands
  const combined = [
    ...ESC_POS_COMMANDS.EPSON_PIN_2,
    ...ESC_POS_COMMANDS.EPSON_PIN_5,
    ...ESC_POS_COMMANDS.STAR_BEL,
  ];
  return new Uint8Array(combined);
}

/**
 * Returns the hex string representation of the ESC/POS kick command
 */
export function getEscPosCashDrawerKickHex(): string {
  const bytes = getEscPosCashDrawerKickBytes();
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Returns the Base64 representation of the ESC/POS kick command for raw print spoolers
 */
export function getEscPosCashDrawerKickBase64(): string {
  const bytes = getEscPosCashDrawerKickBytes();
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export interface CashDrawerKickOptions {
  silent?: boolean;
  reason?: string;
  recordAudit?: boolean;
}

/**
 * MODULE 2.5.2: Triggers cash drawer kick.
 * 1. Plays mechanical cash register chime & latch sound via Web Audio API.
 * 2. Emits a custom window event "pos:cash-drawer-kick" for connected hardware sidecars.
 * 3. Optionally records a manual kick event in the server audit log.
 */
export async function triggerCashDrawerKick(options: CashDrawerKickOptions = {}): Promise<{
  success: boolean;
  commandHex: string;
  timestamp: string;
}> {
  const { silent = false, reason = "Sale tender finalized", recordAudit = false } = options;

  // 1. Play audio chime if not explicitly silenced
  if (!silent) {
    try {
      playCashDrawerSound();
    } catch {
      // Audio autoplay policy fallback
    }
  }

  const commandHex = getEscPosCashDrawerKickHex();
  const timestamp = new Date().toISOString();

  // 2. Dispatch client-side custom event for hardware listener or thermal printer driver
  if (typeof window !== "undefined") {
    try {
      const event = new CustomEvent("pos:cash-drawer-kick", {
        detail: {
          commandHex,
          bytes: Array.from(getEscPosCashDrawerKickBytes()),
          reason,
          timestamp,
        },
      });
      window.dispatchEvent(event);
    } catch {
      // Ignore
    }
  }

  // 3. Record audit trail if requested (e.g. manual cashier kick from top bar)
  if (recordAudit && typeof fetch !== "undefined") {
    try {
      fetch("/api/admin/pos/cash-drawer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }).catch(() => {
        // Non-blocking
      });
    } catch {
      // Non-blocking
    }
  }

  return {
    success: true,
    commandHex,
    timestamp,
  };
}
