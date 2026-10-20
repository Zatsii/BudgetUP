import { Directory, File, Paths } from 'expo-file-system';

import { newId } from '@/utils/id';

// Picker and manipulator results live in the cache, which the OS may clear, so receipts are
// copied into the app's documents directory when the expense is saved.
//
// The database stores a path RELATIVE to the documents directory ("receipts/<uuid>.jpg"). On iOS
// the absolute container path changes when the app is updated or reinstalled, so absolute
// file:// URIs saved earlier would stop resolving. resolveReceiptImageUri() rebuilds the URI.

const RECEIPTS_DIR = 'receipts';

function receiptsDir(): Directory {
  const dir = new Directory(Paths.document, RECEIPTS_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Copies a normalised receipt photo into app storage. Returns the relative path to store. */
export async function saveReceiptImage(sourceUri: string): Promise<string | null> {
  const name = `${newId()}.jpg`; // getReceiptImage() always produces JPEG
  await new File(sourceUri).copy(new File(receiptsDir(), name));
  return `${RECEIPTS_DIR}/${name}`;
}

/** File URI for a stored path. Accepts legacy absolute file:// values too. */
export function resolveReceiptImageUri(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('file:')) return path;
  return new File(Paths.document, path).uri;
}

/** Removes a stored receipt photo. Missing files are ignored. */
export function deleteReceiptImage(path: string | null | undefined): void {
  const uri = resolveReceiptImageUri(path);
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best effort: a leftover file only wastes space.
  }
}
