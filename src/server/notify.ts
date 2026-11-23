import { config } from './config';
import { config as serverConfig } from './config';
import { serviceClient as createServiceClient } from './supabase';

type ChannelStatus = 'sent' | 'skipped' | 'failed';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function sendEmail(to: string | null | undefined, subject: string, text: string, link?: string): Promise<ChannelStatus> {
  const { resendApiKey, from } = serverConfig.email;
  if (!resendApiKey || !from || !to) return 'skipped';
  const url = link ? `${config.siteUrl}${link}` : config.siteUrl;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1d2a20">
    <div style="background:#064421;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;font-weight:bold">N&amp;D Nature Healthy Food</div>
    <div style="background:#FFFDF4;padding:24px;border:1px solid #DDF5C9;border-top:0;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 12px;color:#126B35">${escapeHtml(subject)}</h2>
      <p style="line-height:1.6;white-space:pre-line">${escapeHtml(text)}</p>
      <p><a href="${url}" style="display:inline-block;background:#126B35;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">View details</a></p>
    </div></div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text: `${text}\n\n${url}`, html }),
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

async function sendWhatsApp(phoneE164: string | null | undefined, text: string): Promise<ChannelStatus> {
  const { token, phoneNumberId, template, lang } = serverConfig.whatsapp;
  if (!token || !phoneNumberId || !template || !phoneE164) return 'skipped';
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneE164.replace('+', ''),
        type: 'template',
        template: { name: template, language: { code: lang }, components: [{ type: 'body', parameters: [{ type: 'text', text: text.slice(0, 900) }] }] },
      }),
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Stores an in-app notification and attempts email / WhatsApp delivery when configured.
 * Channel results are recorded honestly ("skipped" when a provider is not configured).
 * Never throws — notifications must not break the order flow.
 */
export async function notifyCustomer(userId: string, title: string, body: string, link?: string) {
  try {
    const svc = createServiceClient();
    const { data: profile } = await svc.from('profiles').select('email, phone').eq('id', userId).maybeSingle();
    const [email, whatsapp] = await Promise.all([
      sendEmail(profile?.email, title, body, link),
      sendWhatsApp(profile?.phone, `${title}\n${body}`),
    ]);
    await svc.from('notifications').insert({ user_id: userId, audience: 'customer', title, body, link, channel_status: { email, whatsapp } });
  } catch (e) {
    console.error('notifyCustomer failed', (e as Error).message);
  }
}

export async function notifyAdmins(title: string, body: string, link?: string) {
  try {
    const svc = createServiceClient();
    const email = await sendEmail(serverConfig.email.adminTo, title, body, link);
    await svc.from('notifications').insert({ user_id: null, audience: 'admin', title, body, link, channel_status: { email } });
  } catch (e) {
    console.error('notifyAdmins failed', (e as Error).message);
  }
}
