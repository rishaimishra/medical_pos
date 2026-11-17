/**
 * Indian Currency Number-to-Words Converter for GST Tax Invoices
 * 
 * Complies with Indian Accounting Standards and GST Invoicing Norms:
 * - Format: "Rupees [X] [Lakh/Thousand/Hundred] and [Y] Paise Only"
 * - Supports amounts up to 99,99,99,999.99 (99 Crore)
 */

const ONES: string[] = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS: string[] = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function convertLessThanThousand(num: number): string {
  let result = "";

  if (num >= 100) {
    result += ONES[Math.floor(num / 100)] + " Hundred ";
    num %= 100;
  }

  if (num > 0) {
    if (num < 20) {
      result += ONES[num] + " ";
    } else {
      result += TENS[Math.floor(num / 10)] + " ";
      if (num % 10 > 0) {
        result += ONES[num % 10] + " ";
      }
    }
  }

  return result.trim();
}

/**
 * Converts a positive number to Indian currency words.
 *
 * @example
 * numberToIndianWords(1540.50) // "Rupees One Thousand Five Hundred Forty and Fifty Paise Only"
 * numberToIndianWords(0) // "Rupees Zero Only"
 * numberToIndianWords(100000) // "Rupees One Lakh Only"
 */
export function numberToIndianWords(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return "Rupees Zero Only";
  }

  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const rupeePart = Math.floor(rounded);
  const paisePart = Math.round((rounded - rupeePart) * 100);

  if (rupeePart === 0 && paisePart === 0) {
    return "Rupees Zero Only";
  }

  let words = "";

  if (rupeePart > 0) {
    let num = rupeePart;

    const crore = Math.floor(num / 10000000);
    num %= 10000000;

    const lakh = Math.floor(num / 100000);
    num %= 100000;

    const thousand = Math.floor(num / 1000);
    num %= 1000;

    const remainder = num;

    if (crore > 0) {
      words += convertLessThanThousand(crore) + " Crore ";
    }

    if (lakh > 0) {
      words += convertLessThanThousand(lakh) + " Lakh ";
    }

    if (thousand > 0) {
      words += convertLessThanThousand(thousand) + " Thousand ";
    }

    if (remainder > 0) {
      words += convertLessThanThousand(remainder) + " ";
    }

    words = words.trim();
  }

  let result = "Rupees " + (words || "Zero");

  if (paisePart > 0) {
    const paiseWords = convertLessThanThousand(paisePart);
    result += " and " + paiseWords + " Paise";
  }

  return result.trim() + " Only";
}
