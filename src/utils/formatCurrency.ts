/**
 * Currency formatter for Pakistani Rupees (PKR)
 */
export const formatPKR = (paisa: number): string => {
  if (paisa == null) return 'Unknown';
  const amount = paisa / 100;
  return `Rs. ${amount.toLocaleString('en-US', { minimumFractionDigits: paisa % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

export const CURRENCY_SYMBOL = 'Rs.';
