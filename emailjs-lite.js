// emailjs-lite.js — minimal EmailJS REST client.
// Service workers can't load the official EmailJS browser SDK (it expects
// a window object), so this calls their public REST API directly instead.

async function sendEmailJS({ publicKey, serviceId, templateId, params }) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: params,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EmailJS error (${res.status}): ${text}`);
  }

  return res.text();
}
