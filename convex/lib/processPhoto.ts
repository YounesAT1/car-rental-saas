"use node";
import sharp from "sharp";
import { MAX_PHOTO_BYTES, MAX_STORED_PHOTO_BYTES } from "../../src/lib/fleet";
export async function processPhoto(bytes: ArrayBuffer) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES)
    throw new Error("UPLOAD_INVALID");
  const input = Buffer.from(bytes);
  // Reject active/vector formats before invoking the decoder, regardless of MIME.
  const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  const png = input
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    input.toString("ascii", 0, 4) === "RIFF" &&
    input.toString("ascii", 8, 12) === "WEBP";
  if (!jpeg && !png && !webp) throw new Error("UPLOAD_INVALID");
  const decoder = sharp(input, {
    limitInputPixels: 24000000,
    failOn: "warning",
  });
  const info = await decoder.metadata();
  if (!["jpeg", "png", "webp"].includes(info.format) || (info.pages ?? 1) !== 1)
    throw new Error("UPLOAD_INVALID");
  const output = await decoder
    .autoOrient()
    .resize({
      width: 1920,
      height: 1920,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
  if (output.byteLength > MAX_STORED_PHOTO_BYTES)
    throw new Error("UPLOAD_INVALID");
  return output;
}
