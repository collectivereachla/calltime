/** Roman numeral for act/scene labels. toRoman(3) => "III". */
export function toRoman(n: number): string {
  if (!Number.isFinite(n) || n < 1) return "";
  const map: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let r = "", x = Math.floor(n);
  for (const [v, s] of map) while (x >= v) { r += s; x -= v; }
  return r;
}
