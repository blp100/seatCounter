export function nextLabels(
  existingCount: number,
  countNeeded: number
): string[] {
  const labels: string[] = [];
  for (let i = 0; i < countNeeded; i++) {
    labels.push(indexToLabel(existingCount + i));
  }
  return labels;
}

// A..Z, AA..AZ, BA..BZ, ...
function indexToLabel(n: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let s = "";
  let x = n;
  do {
    s = alphabet[x % 26] + s;
    x = Math.floor(x / 26) - 1;
  } while (x >= 0);
  return s;
}
