// UPI deep link: opens the customer's UPI app with the venue's UPI ID, the exact amount and "KOT n" filled in.
export function upiLink(upiId: string, name: string, paise: number, note: string) {
  const p = new URLSearchParams({ pa: upiId, pn: name, am: (paise / 100).toFixed(2), cu: 'INR', tn: note });
  return `upi://pay?${p.toString()}`;
}
