
export function formatNumber(value: number, decimals: number = 0): string {
  // Use "ko-KR" for standard 3-digit comma separation.
  // Default to 0 decimals for KRW (integers), but allow override.
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}
