/**
 * Currency formatter for Pakistani Rupees (PKR)
 */
export const formatPKR = (amount: number): string => {
  const rounded = Math.round(amount);
  return `Rs. ${rounded.toLocaleString('en-US')}`;
};

export const CURRENCY_SYMBOL = 'Rs.';
