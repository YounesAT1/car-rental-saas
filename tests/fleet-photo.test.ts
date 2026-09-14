// @vitest-environment node
import { expect, test } from "vitest";
import sharp from "sharp";
import { processPhoto } from "../convex/lib/processPhoto";
const buffer = (bytes: Buffer) => Uint8Array.from(bytes).buffer;
test("photo decoder strips metadata and produces bounded WebP pixels", async () => {
  const original = await sharp({
    create: { width: 2000, height: 100, channels: 3, background: "blue" },
  })
    .jpeg()
    .withMetadata()
    .toBuffer();
  const result = await processPhoto(buffer(original));
  const meta = await sharp(result).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.width).toBe(1920);
  expect(meta.exif).toBeUndefined();
  expect(meta.icc).toBeUndefined();
});
test("photo decoder rejects active content, fake signatures, corrupt and oversized inputs", async () => {
  for (const input of [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    Buffer.from([0xff, 0xd8, 0xff, 1, 2]),
    Buffer.alloc(3 * 1024 * 1024 + 1),
  ])
    await expect(processPhoto(buffer(input))).rejects.toThrow();
});
