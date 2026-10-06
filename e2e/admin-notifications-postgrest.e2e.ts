import { expect, test, type APIRequestContext } from "@playwright/test";

function localSupabase() {
  const url = process.env.E2E_SUPABASE_URL ?? "";
  const key = process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/i.test(url)) {
    throw new Error(`Refusing admin_notifications E2E against non-local Supabase URL: ${url || "<missing>"}`);
  }
  if (!key) throw new Error("Missing local E2E Supabase publishable/anon key");
  return { url, key };
}

async function signIn(
  request: APIRequestContext,
  email: string | undefined,
  password: string | undefined,
) {
  const { url, key } = localSupabase();
  if (!email || !password) throw new Error("Missing seeded local E2E identity credentials");

  const response = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    data: { email, password },
  });
  expect(response.status(), `local sign-in for ${email}`).toBe(200);
  const body = (await response.json()) as {
    access_token?: string;
    user?: { id?: string };
  };
  if (!body.access_token || !body.user?.id) {
    throw new Error(`Local auth response for ${email} did not contain an access token and user id`);
  }
  return { token: body.access_token, userId: body.user.id };
}

async function queryNotifications(
  request: APIRequestContext,
  token: string,
  recipientId: string,
) {
  const { url, key } = localSupabase();
  return request.get(
    `${url}/rest/v1/admin_notifications?select=*&recipient_id=eq.${encodeURIComponent(recipientId)}&order=created_at.desc&limit=50`,
    { headers: { apikey: key, Authorization: `Bearer ${token}` } },
  );
}

test("clean local replay exposes admin_notifications only through the Organizer RLS contract", async ({ request }) => {
  const organizer = await signIn(
    request,
    process.env.E2E_ORGANIZER_EMAIL,
    process.env.E2E_ORGANIZER_PASSWORD,
  );
  const country = await signIn(
    request,
    process.env.E2E_COUNTRY_EMAIL,
    process.env.E2E_COUNTRY_PASSWORD,
  );

  const organizerResponse = await queryNotifications(request, organizer.token, organizer.userId);
  expect(organizerResponse.status(), "Organizer PostgREST query must reach RLS rather than fail privileges").toBe(200);
  expect(Array.isArray(await organizerResponse.json())).toBe(true);

  const countryOwnResponse = await queryNotifications(request, country.token, country.userId);
  expect(countryOwnResponse.status(), "non-Organizer request should be filtered by RLS, not gain Organizer privileges").toBe(200);
  expect(await countryOwnResponse.json()).toEqual([]);

  const countryOrganizerResponse = await queryNotifications(request, country.token, organizer.userId);
  expect(countryOrganizerResponse.status()).toBe(200);
  expect(await countryOrganizerResponse.json()).toEqual([]);
});
