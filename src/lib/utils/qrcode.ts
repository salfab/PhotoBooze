/**
 * QR code generation utilities.
 */

import QRCode from 'qrcode';
import { QR_CODE_CONFIG } from '@/lib/constants';

export interface QrCodeOptions {
  /** Width of the QR code in pixels */
  width?: number;
}

/**
 * Generate a QR code data URL for a party join link.
 * 
 * @param partyId - The party ID
 * @param joinToken - The join token for the party
 * @param origin - The origin URL (e.g., window.location.origin)
 * @param options - Optional configuration
 * @returns A data URL string for the QR code image
 */
export async function generatePartyQrCode(
  partyId: string,
  joinToken: string,
  origin: string,
  options: QrCodeOptions = {}
): Promise<string> {
  const joinUrl = `${origin}/join/${partyId}?token=${joinToken}`;
  return generateQrCodeDataUrl(joinUrl, options);
}

/**
 * Generate a QR code data URL for any URL.
 * 
 * @param url - The URL to encode
 * @param options - Optional configuration
 * @returns A data URL string for the QR code image
 */
export async function generateQrCodeDataUrl(
  url: string,
  options: QrCodeOptions = {}
): Promise<string> {
  const { width = QR_CODE_CONFIG.width } = options;
  
  return QRCode.toDataURL(url, {
    width,
    margin: QR_CODE_CONFIG.margin,
    color: QR_CODE_CONFIG.color,
  });
}

/**
 * Build a party join URL.
 * 
 * @param partyId - The party ID
 * @param joinToken - The join token for the party
 * @param origin - The origin URL (e.g., window.location.origin)
 * @returns The full join URL
 */
export function buildJoinUrl(
  partyId: string,
  joinToken: string,
  origin: string
): string {
  return `${origin}/join/${partyId}?token=${joinToken}`;
}
