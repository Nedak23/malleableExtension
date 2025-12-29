import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Helper to set CORS headers
function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers on all responses
  setCorsHeaders(res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (message.length > 5000) {
    return res.status(400).json({ error: 'Message is too long (max 5000 characters)' });
  }

  const toEmail = process.env.FEEDBACK_TO_EMAIL;
  if (!toEmail) {
    console.error('FEEDBACK_TO_EMAIL environment variable not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    await resend.emails.send({
      from: 'MalleableWeb Feedback <onboarding@resend.dev>',
      to: toEmail,
      subject: 'MalleableWeb Extension Feedback',
      text: `New feedback from MalleableWeb extension:\n\n${message.trim()}`,
      html: `
        <h2>MalleableWeb Extension Feedback</h2>
        <p>New feedback received:</p>
        <blockquote style="border-left: 3px solid #0066cc; padding-left: 16px; margin: 16px 0; color: #333;">
          ${message.trim().replace(/\n/g, '<br>')}
        </blockquote>
        <hr>
        <p style="color: #666; font-size: 12px;">
          Sent from MalleableWeb browser extension
        </p>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to send feedback email:', error);
    return res.status(500).json({ error: 'Failed to send feedback' });
  }
}
