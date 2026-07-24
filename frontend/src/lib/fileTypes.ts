// Fayl turlarini aniqlash uchun markaziy joy.
// Yangi format qo'shish kerak bo'lsa — faqat shu yerni tahrirlang.

// Brauzer o'zi ko'rsata oladigan rasm formatlari (HEIC serverda JPEG'ga aylantiriladi).
export const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif']

// Kamera RAW formatlari — brauzer ko'rsata olmaydi, server /preview orqali JPEG beradi.
// Canon (CR2/CR3), Nikon (NEF), Sony (ARW), Adobe (DNG).
export const RAW_EXTS = ['cr2', 'cr3', 'nef', 'arw', 'dng']

// 3D model formatlari (Three.js ko'rsatadi).
export const MODEL3D_EXTS = ['stl', 'obj', 'ply']

export function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function isRawName(name: string): boolean {
  return RAW_EXTS.includes(fileExt(name))
}

export function isImageName(name: string, isImage?: boolean): boolean {
  return Boolean(isImage) || IMAGE_EXTS.includes(fileExt(name))
}

// Rasm sifatida ko'rsatsa bo'ladigan har qanday fayl (oddiy rasm yoki RAW preview).
export function isViewableImage(name: string, isImage?: boolean): boolean {
  return isImageName(name, isImage) || isRawName(name)
}

export function isModel3d(name: string): boolean {
  return MODEL3D_EXTS.includes(fileExt(name))
}

// Berilgan fayl url'i uchun ko'rsatishga yaroqli manba: RAW bo'lsa /preview.
export function displaySrcUrl(url: string, name: string): string {
  return isRawName(name) ? `${url}/preview` : url
}
