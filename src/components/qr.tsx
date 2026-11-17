import QRCode from "qrcode";

/** Código QR renderizado en el servidor como SVG. */
export async function QR({ value, size = 220, className }: { value: string; size?: number; className?: string }) {
  const svg = await QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", width: size });
  return <div className={className} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
