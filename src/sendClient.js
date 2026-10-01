export async function sendFormEmail({ name, company, phone }) {
  const res = await fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, company, phone }),
  });

  const result = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(result?.error || 'Request failed');
  }

  return result;
}
