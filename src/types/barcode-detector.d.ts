/**
 * Minimal typings for the Barcode Detection API (Shape Detection).
 * Not included in all TypeScript `lib.dom` versions yet.
 */
export {};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: readonly string[] }): BarcodeDetectorInstance;
  getSupportedFormats(): Promise<string[]>;
}

interface BarcodeDetectorInstance {
  detect(image: ImageBitmapSource): Promise<Array<{ format: string; rawValue: string }>>;
}
