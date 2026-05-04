import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
  try {
    const { email, imageBase64 } = await request.json();
    if (!email || !imageBase64) {
      return NextResponse.json({ error: 'Missing email or image data' }, { status: 400 });
    }

    let transporter;

    if (!process.env.SMTP_HOST) {
      console.log('No SMTP credentials found in .env, generating Ethereal Test Account...');
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } else {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const mailOptions = {
      from: process.env.SMTP_FROM || 'photobooth@example.com',
      to: email,
      cc: 'sjp2technology@gmail.com',
      subject: 'Your Pictures - ST. JOHN PAUL II PARISH PHOTOBOOTH',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #fcfcfc; border-radius: 12px; border: 1px solid #eee;">
          <div style="text-align: center; margin-bottom: 25px;">
            <h1 style="color: #40E0D0; margin: 0; font-size: 24px;">ST. JOHN PAUL II PARISH PHOTOBOOTH</h1>
          </div>
          <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); border-top: 4px solid #40E0D0; color: #444; font-size: 15px; line-height: 1.6;">
            <p>Dear Beloved,</p>
            <p>Great job being part of our special celebration here at St. John Paul II Parish!</p>
            <p>You shared smiles, joy, and meaningful moments — and we're grateful you captured them at our photobooth. These photos are a small reminder of the beautiful memories we created together in faith and community.</p>
            <p>Your photostrip is attached to this email. Feel free to share these moments with your family and friends!</p>
            <p style="text-align: center; margin: 25px 0; font-size: 16px; font-weight: bold; color: #b59f5f;">✨ Your photostrip is attached!</p>
            <p>Let's continue spreading joy and love — you may also share your photos and tag us:</p>
            <p style="text-align: center; font-weight: 600; color: #40E0D0; margin: 20px 0;">#StJohnPaulIIParish #FaithInEveryMoment #BlessedMemories</p>
            <p style="text-align: center;">✨</p>
            <p style="text-align: center; font-style: italic; color: #666; margin: 25px 0;">"Life with Christ is a wonderful adventure."<br>— St. John Paul II</p>
            <p style="margin-top: 30px; font-weight: 600;">With love and blessings,<br>St. John Paul II Parish Team</p>
          </div>
          <div style="text-align: center; margin-top: 25px; color: #aaa; font-size: 12px;">
            <p>Powered by SJP2 Technology</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: 'photobooth.jpg',
          content: buffer,
        },
      ],
    };

    const info = await transporter.sendMail(mailOptions);
    
    if (!process.env.SMTP_HOST) {
      console.log("Preview your test email here: %s", nodemailer.getTestMessageUrl(info));
    }

    return NextResponse.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Email sending error:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
