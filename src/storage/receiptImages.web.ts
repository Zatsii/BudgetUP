// Web has no persistent file system, and blob: URLs from the file picker die on reload, so
// receipt photos aren't stored on web. The receipt still prefills the form.

export async function saveReceiptImage(_sourceUri: string): Promise<string | null> {
  return null;
}

export function resolveReceiptImageUri(_path: string | null | undefined): string | null {
  return null;
}

export function deleteReceiptImage(_path: string | null | undefined): void {}
