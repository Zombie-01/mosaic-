import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import sharp from "sharp";

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file = data.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const filename = `${timestamp}-${randomId}.jpg`;

    // Ensure uploads directory exists
    const uploadsDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    // Convert to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate thumbnails using Sharp
    const image = sharp(buffer);

    // Get original dimensions
    const metadata = await image.metadata();
    const aspectRatio = metadata.width! / metadata.height!;

    // Generate thumbnail (150px max dimension)
    const thumbSize = 150;
    const thumbWidth =
      aspectRatio > 1 ? thumbSize : Math.round(thumbSize * aspectRatio);
    const thumbHeight =
      aspectRatio > 1 ? Math.round(thumbSize / aspectRatio) : thumbSize;

    const thumbnailBuffer = await image
      .resize(thumbWidth, thumbHeight, { fit: "cover" })
      .jpeg({ quality: 70 })
      .toBuffer();

    // Generate preview (400px max dimension)
    const previewSize = 400;
    const previewWidth =
      aspectRatio > 1 ? previewSize : Math.round(previewSize * aspectRatio);
    const previewHeight =
      aspectRatio > 1 ? Math.round(previewSize / aspectRatio) : previewSize;

    const previewBuffer = await image
      .resize(previewWidth, previewHeight, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Save original as high-res
    const highResBuffer = await image.jpeg({ quality: 90 }).toBuffer();

    // Save all versions
    const basePath = join(uploadsDir, filename.replace(".jpg", ""));
    await writeFile(`${basePath}-thumb.jpg`, thumbnailBuffer);
    await writeFile(`${basePath}-preview.jpg`, previewBuffer);
    await writeFile(`${basePath}-highres.jpg`, highResBuffer);

    // Return URLs
    const baseUrl = `/uploads/${filename.replace(".jpg", "")}`;
    return NextResponse.json({
      thumbnail: `${baseUrl}-thumb.jpg`,
      preview: `${baseUrl}-preview.jpg`,
      highres: `${baseUrl}-highres.jpg`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
