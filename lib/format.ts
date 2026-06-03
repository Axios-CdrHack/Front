export function formatIpAmount(minorUnits: number) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(minorUnits / 100)} IP`;
}

export function compactAddress(address: string) {
  if (!address.startsWith("0x") || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
