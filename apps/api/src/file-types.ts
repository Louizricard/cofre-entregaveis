export const FILE_MAX = 2n * 1024n ** 3n;
export const QUOTA_MAX = 10n * 1024n ** 3n;
export const PART_SIZE = 8 * 1024 * 1024;
export const extensions: Record<string, string[]> = {
 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'], 'application/pdf': ['pdf'],
 'video/mp4': ['mp4'], 'audio/mpeg': ['mp3'], 'audio/wav': ['wav'], 'application/zip': ['zip'],
};
export function validDeclaredType(name: string, mime: string) { return extensions[mime]?.includes(name.split('.').pop()!.toLowerCase()) ?? false; }
export function matchesSignature(bytes: Uint8Array, mime: string) {
 const b = Buffer.from(bytes);
 switch (mime) {
  case 'image/png': return b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  case 'image/jpeg': return b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255;
  case 'application/pdf': return b.subarray(0, 5).toString() === '%PDF-';
  case 'application/zip': return b.length >= 4 && b[0] === 80 && b[1] === 75 && ((b[2] === 3 && b[3] === 4) || (b[2] === 5 && b[3] === 6));
  case 'image/webp': return b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
  case 'audio/wav': return b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WAVE';
  case 'video/mp4': return b.subarray(4, 8).toString() === 'ftyp';
  case 'audio/mpeg': return b.subarray(0, 3).toString() === 'ID3' || (b.length >= 2 && b[0] === 255 && (b[1] & 0xe0) === 0xe0);
  default: return false;
 }
}
