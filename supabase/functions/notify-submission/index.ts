import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SubmissionPayload = {
  submission_type?: string;
  name?: string;
  email?: string;
  phone?: string;
  property_of_interest?: string | null;
  details?: string | null;
  submitted_at?: string;
};

function toSms(payload: SubmissionPayload) {
  return [
    `New ${payload.submission_type || 'submission'}`,
    payload.name ? `Name: ${payload.name}` : '',
    payload.phone ? `Phone: ${payload.phone}` : (payload.email ? `Email: ${payload.email}` : ''),
    payload.property_of_interest ? `Property: ${payload.property_of_interest}` : '',
    'Check admin dashboard.'
  ].filter(Boolean).join(' | ').slice(0, 320);
}

function toEmailHtml(payload: SubmissionPayload) {
  return `
    <h2>New ${payload.submission_type || 'Website Submission'}</h2>
    <p><strong>Name:</strong> ${payload.name || 'N/A'}</p>
    <p><strong>Email:</strong> ${payload.email || 'N/A'}</p>
    <p><strong>Phone:</strong> ${payload.phone || 'N/A'}</p>
    <p><strong>Property:</strong> ${payload.property_of_interest || 'N/A'}</p>
    <p><strong>Details:</strong><br/>${(payload.details || 'N/A').replace(/\n/g, '<br/>')}</p>
    <p><strong>Submitted:</strong> ${payload.submitted_at || new Date().toISOString()}</p>
  `;
}

async function sendEmail(payload: SubmissionPayload) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL');
  const toEmail = Deno.env.get('NOTIFY_TO_EMAIL');
  if (!resendApiKey || !fromEmail || !toEmail) return { skipped: true, reason: 'email_env_missing' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + resendApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: `New ${payload.submission_type || 'website'} submission`,
      html: toEmailHtml(payload),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email failed: ${response.status} ${body}`);
  }

  return { sent: true };
}

async function sendSms(payload: SubmissionPayload) {
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioFrom = Deno.env.get('TWILIO_FROM_NUMBER');
  const twilioTo = Deno.env.get('NOTIFY_TO_SMS');
  if (!twilioSid || !twilioToken || !twilioFrom || !twilioTo) return { skipped: true, reason: 'sms_env_missing' };

  const auth = btoa(`${twilioSid}:${twilioToken}`);
  const body = new URLSearchParams({
    To: twilioTo,
    From: twilioFrom,
    Body: toSms(payload),
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SMS failed: ${response.status} ${text}`);
  }

  return { sent: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let payload: SubmissionPayload = {};
  try {
    payload = await req.json();
  } catch (_err) {
    return new Response(JSON.stringify({ error: 'Invalid payload' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const result: Record<string, unknown> = { ok: true };
  try {
    result.email = await sendEmail(payload);
  } catch (error) {
    console.error(error);
    result.email = { sent: false };
  }

  try {
    result.sms = await sendSms(payload);
  } catch (error) {
    console.error(error);
    result.sms = { sent: false };
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
