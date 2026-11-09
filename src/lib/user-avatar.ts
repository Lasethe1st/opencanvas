/** House & tree painting — https://unsplash.com/photos/a-painting-of-a-house-and-a-tree-4ewHoDJOSf4 */
export const USER_AVATAR_SRC =
  'https://images.unsplash.com/photo-1699391202798-bec3f1c894bc?w=96&h=96&fit=crop&auto=format&q=80';

/** Art stand-ins for people in a shared chat (no profile photos yet). Unsplash, abstract paintings, one per person. */
const ART = [
  'photo-1605721911519-3dfeb3be25e7', // red, blue and yellow abstract painting
  'photo-1541512416146-3cf58d6b27cc', // black and white paint texture
  'photo-1618331833071-ce81bd50d300', // blue, white and yellow abstract painting
  'photo-1541961017774-22349e4a1262', // abstract painting
  'photo-1602464729960-f95937746b68', // yellow, red and white abstract painting
  'photo-1533208087231-c3618eab623c', // abstract art painting
  'photo-1699391202798-bec3f1c894bc', // house & tree painting
];

/** The same person always gets the same picture. */
export function artAvatarSrc(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `https://images.unsplash.com/${ART[h % ART.length]}?w=96&h=96&fit=crop&auto=format&q=80`;
}
