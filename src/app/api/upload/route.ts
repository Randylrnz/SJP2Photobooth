import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json();
    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Initialize Google Drive API client using Service Account
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // The folder ID where uploads will be saved
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.replace(/"/g, '');
    console.log("Drive Upload Debug - Folder ID:", folderId);
    console.log("Drive Upload Debug - Service Email:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);

    // Convert base64 to buffer and stream
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const stream = Readable.from(buffer);

    const fileMetadata = {
      name: `photobooth-${Date.now()}.jpg`,
      parents: folderId ? [folderId] : undefined,
    };

    const media = {
      mimeType: 'image/jpeg',
      body: stream,
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    return NextResponse.json({ success: true, fileId: file.data.id, link: file.data.webViewLink });
  } catch (error) {
    console.error('Google Drive Upload Error:', error);
    return NextResponse.json({ error: 'Failed to upload to Google Drive' }, { status: 500 });
  }
}
