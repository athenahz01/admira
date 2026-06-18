import { expect, test, type Page } from "@playwright/test";

const mitChanceResponse = {
  school: {
    unitid: 166683,
    name: "Massachusetts Institute of Technology",
    selectivity_tier: "elite",
    sat_25: 1520,
    sat_75: 1580,
    act_25: 34,
    act_75: 36,
    gpa_avg: null,
    test_policy: "required",
  },
  probability: {
    point: 0.0403255,
    calibrated: 0.032967,
    low: 0,
    high: 0.492967,
    width: 0.492967,
    coverage: 0.8,
  },
  band: {
    label: "reach",
    wide_band: true,
    note: "Public data cannot narrow this interval enough for a target/likely label.",
    input_confidence: "standard",
  },
  levers: {
    controllable: [
      {
        feature: "test_score",
        label: "Test score",
        note: "Can still move if the student has another SAT or ACT sitting before application deadlines.",
        logit_contribution: -0.061,
      },
      {
        feature: "application_round",
        label: "Application round",
        note: "Early strategy can change the school-specific odds context.",
        logit_contribution: -0.012,
      },
    ],
    fixed: [
      {
        feature: "gpa_to_date",
        label: "GPA to date",
        note: "Most of the academic record is already set by application season.",
        logit_contribution: 0,
      },
    ],
    unseen: [
      {
        feature: "essays",
        label: "Essays",
        note: "Public data cannot evaluate writing quality or application narrative.",
      },
      {
        feature: "recommendations",
        label: "Recommendations",
        note: "Teacher and counselor letters are not visible in the public-data model.",
      },
      {
        feature: "institutional_priorities",
        label: "Institutional priorities",
        note: "Major balance, class-shaping needs, and yield goals are not directly observable.",
      },
      {
        feature: "demonstrated_interest",
        label: "Demonstrated interest",
        note: "Some schools consider engagement, but public data rarely captures student-specific evidence.",
      },
    ],
  },
  rubric: {
    c7_factors: {
      _source: "2023-24 CDS Common Data Set",
      rigor: "Very Important",
      gpa: "Very Important",
      test_scores: "Very Important",
      essay: "Important",
      recommendations: "Important",
      extracurriculars: "Important",
    },
    gaps: {
      sat: { score: 1540, mid: 1550, gap: -0.22483333333333333 },
      act: { score: 35, mid: 35, gap: 0 },
      gpa: { score: 3.95, mid: null, gap: null },
    },
  },
  disclaimers: [
    "Synthetic public-data prior - not validated real-outcome accuracy.",
    "Essays, recommendations, and institutional priorities are not modeled.",
  ],
  model: {
    type: "public_prior_logistic_v1",
    version: "2026.06.16-phase2",
    honesty_label: "Synthetic public-data prior. Not validated real-outcome accuracy.",
  },
};

const authUser = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "student@example.com",
  email_confirmed_at: "2026-06-18T00:00:00.000Z",
  phone: "",
  confirmed_at: "2026-06-18T00:00:00.000Z",
  last_sign_in_at: "2026-06-18T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-06-18T00:00:00.000Z",
  updated_at: "2026-06-18T00:00:00.000Z",
};

const testAccessToken = "test-access-token";
const consentRecordId = "11111111-1111-4111-8111-111111111111";
const profileRecordId = "22222222-2222-4222-8222-222222222222";
const outcomeRecordId = "33333333-3333-4333-8333-333333333333";
const revokedAt = "2026-06-18T01:00:00.000Z";

const exportedOutcomeData = {
  consent_records: [
    {
      id: consentRecordId,
      subject_id: authUser.id,
      consent_version: "phase-7-capture-ui-v1",
      consent_text: "Test consent text long enough for export coverage.",
      purpose: "real_outcome_modeling",
      consented_at: "2026-06-18T00:00:00.000Z",
      revoked_at: null,
      created_at: "2026-06-18T00:00:00.000Z",
    },
  ],
  applicant_profiles: [
    {
      id: profileRecordId,
      subject_id: authUser.id,
      consent_record_id: consentRecordId,
      cycle_year: 2026,
    },
  ],
  application_outcomes: [
    {
      id: outcomeRecordId,
      subject_id: authUser.id,
      profile_id: profileRecordId,
      consent_record_id: consentRecordId,
      unitid: 166683,
      outcome: "admitted",
    },
  ],
  data_access_logs: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      subject_id: authUser.id,
      action: "exported",
      row_count: 3,
    },
  ],
};

function expectNoForbiddenKeys(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();

  expect(serialized).not.toContain("race");
  expect(serialized).not.toContain("ethnicity");
  expect(serialized).not.toContain("ethnic_origin");
  expect(serialized).not.toContain("racial_identity");
}

async function mockOutcomeStatus(page: Page, enabled: boolean) {
  await page.route("**/api/outcomes/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ enabled }),
    });
  });
}

async function mockSupabaseAuth(page: Page) {
  const corsHeaders = {
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
  };

  await page.route("https://fitty-test.supabase.co/auth/v1/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ headers: corsHeaders, status: 204 });
      return;
    }

    const url = route.request().url();

    if (url.includes("/token?grant_type=password")) {
      await route.fulfill({
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({
          access_token: testAccessToken,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "test-refresh-token",
          user: authUser,
        }),
      });
      return;
    }

    if (url.includes("/user")) {
      await route.fulfill({
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify(authUser),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({}),
    });
  });
}

async function signInOutcomePanel(page: Page) {
  const captureFlow = page.getByTestId("outcome-capture-flow");
  await captureFlow.getByLabel("Email").fill("student@example.com");
  await captureFlow.getByLabel("Password").fill("correct-horse-battery-staple");
  await captureFlow.getByRole("button", { name: "Sign in" }).click();
  await expect(captureFlow.getByText("Signed in")).toBeVisible();
  return captureFlow;
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/chance", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");

    expect(body).toMatchObject({
      act_score: 35,
      application_round: "regular",
      gpa: 3.95,
      sat_score: 1540,
      unitid: 166683,
    });
    expect(body).not.toHaveProperty("activityNote");
    expect(body).not.toHaveProperty("homeState");
    expect(body).not.toHaveProperty("intendedMajor");

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(mitChanceResponse),
    });
  });
});

test("keeps outcome capture closed when the server flag is disabled", async ({
  page,
}) => {
  let captureRequests = 0;

  await mockOutcomeStatus(page, false);
  await page.route(
    /\/api\/outcomes\/(consent|profile|application|export-my-data|revoke-consent|delete-my-data)$/,
    async (route) => {
      captureRequests += 1;
      await route.abort();
    },
  );

  await page.goto("/");

  await expect(page.getByTestId("outcome-capture-closed")).toContainText(
    "Outcome capture is not currently open",
  );
  await expect(page.getByTestId("outcome-capture-flow")).toHaveCount(0);
  await expect(page.getByTestId("outcome-data-controls")).toHaveCount(0);
  expect(captureRequests).toBe(0);
});

test("records consent, profile, and one outcome through the enabled capture flow", async ({
  page,
}) => {
  const captureBodies: Record<string, unknown> = {};

  await mockOutcomeStatus(page, true);
  await mockSupabaseAuth(page);
  await page.route(/\/api\/outcomes\/(consent|profile|application)$/, async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${testAccessToken}`);
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<
      string,
      unknown
    >;
    expectNoForbiddenKeys(body);

    const url = route.request().url();
    if (url.endsWith("/api/outcomes/consent")) {
      captureBodies.consent = body;
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({ consent_record: { id: consentRecordId } }),
      });
      return;
    }

    if (url.endsWith("/api/outcomes/profile")) {
      captureBodies.profile = body;
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({ applicant_profile: { id: profileRecordId } }),
      });
      return;
    }

    captureBodies.outcome = body;
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({ application_outcome: { id: outcomeRecordId } }),
    });
  });

  await page.goto("/");

  const captureFlow = await signInOutcomePanel(page);

  const consentCopy = await captureFlow.getByTestId("outcome-consent-text").innerText();
  const consentCheckbox = captureFlow.getByLabel(
    "I agree to share these optional records with Fitty.",
  );
  await expect(consentCheckbox).not.toBeChecked();
  await expect(
    captureFlow.getByRole("button", { name: "Record consent" }),
  ).toBeDisabled();
  await consentCheckbox.check();
  await captureFlow.getByRole("button", { name: "Record consent" }).click();

  await captureFlow.getByLabel("Cycle year", { exact: true }).fill("2026");
  await captureFlow.getByLabel("GPA").fill("3.92");
  await captureFlow.getByLabel("Intended major").fill("Computer science");
  await captureFlow
    .getByRole("group", { name: "Course rigor" })
    .getByRole("button", { name: "AP, IB, or dual enrollment" })
    .click();
  await captureFlow.getByLabel("SAT").fill("1510");
  await captureFlow.getByRole("textbox", { exact: true, name: "ACT" }).fill("34");
  await captureFlow
    .getByRole("group", { name: "Activities tier" })
    .getByRole("button", { name: "State" })
    .click();
  await captureFlow
    .getByRole("group", { name: "Demonstrated interest" })
    .getByRole("button", { name: "Moderate" })
    .click();
  await captureFlow.getByRole("button", { name: "Save profile" }).click();

  await captureFlow.getByLabel("Outcome school").fill("Massachusetts");
  await captureFlow
    .getByRole("button", { name: /Massachusetts Institute of Technology/ })
    .click();
  await captureFlow.getByLabel("Outcome cycle year").fill("2026");
  await captureFlow.getByRole("button", { name: "Save outcome" }).click();

  await expect(captureFlow.getByTestId("saved-outcomes")).toContainText(
    "Massachusetts Institute of Technology: Admitted",
  );
  await expect(captureFlow).not.toContainText(/race|ethnicity/i);

  expect(captureBodies.consent).toEqual({
    consent_version: "phase-7-capture-ui-v1",
    consent_text: consentCopy,
    purpose: "real_outcome_modeling",
  });
  expect(captureBodies.profile).toMatchObject({
    consent_record_id: consentRecordId,
    cycle_year: 2026,
    gpa: 3.92,
    course_rigor: "ap_ib_dual",
    sat_score: 1510,
    act_score: 34,
    test_submitted: true,
    activities_tier: "state",
    intended_major: "Computer science",
    application_round: "regular",
    demonstrated_interest: "moderate",
  });
  expect(captureBodies.outcome).toEqual({
    profile_id: profileRecordId,
    consent_record_id: consentRecordId,
    unitid: 166683,
    outcome: "admitted",
    application_round: "regular",
    cycle_year: 2026,
  });
});

test("exports, revokes, and deletes signed-in outcome data with confirmation", async ({
  page,
}) => {
  let exportRequests = 0;
  let revokeBody: Record<string, unknown> | null = null;
  let deleteRequests = 0;

  await mockOutcomeStatus(page, true);
  await mockSupabaseAuth(page);
  await page.route("**/api/outcomes/export-my-data", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe(`Bearer ${testAccessToken}`);
    exportRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(exportedOutcomeData),
    });
  });
  await page.route("**/api/outcomes/revoke-consent", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${testAccessToken}`);
    revokeBody = JSON.parse(route.request().postData() ?? "{}") as Record<
      string,
      unknown
    >;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        consent_record: {
          ...exportedOutcomeData.consent_records[0],
          revoked_at: revokedAt,
        },
      }),
    });
  });
  await page.route("**/api/outcomes/delete-my-data", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().headers().authorization).toBe(`Bearer ${testAccessToken}`);
    deleteRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        deleted: {
          consent_records: 1,
          applicant_profiles: 1,
          application_outcomes: 1,
          data_access_logs: 2,
        },
      }),
    });
  });

  await page.goto("/");
  await signInOutcomePanel(page);

  const controls = page.getByTestId("outcome-data-controls");
  await expect(controls).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await controls.getByRole("button", { name: "Export my data" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("fitty-my-data.json");
  expect(exportRequests).toBe(1);
  await expect(controls).toContainText("phase-7-capture-ui-v1");

  await controls.getByRole("button", { name: "Revoke" }).click();
  expect(revokeBody).toEqual({ consent_record_id: consentRecordId });
  await expect(controls).toContainText("Consent revoked");
  await expect(
    controls.getByText("No active consent records were found."),
  ).toBeVisible();

  const deleteButton = controls.getByRole("button", { name: "Delete my data" });
  await expect(controls).toContainText("It cannot be undone");
  await expect(deleteButton).toBeDisabled();
  await controls.getByLabel("Type DELETE to confirm").fill("DEL");
  await expect(deleteButton).toBeDisabled();
  expect(deleteRequests).toBe(0);

  await controls.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  expect(deleteRequests).toBe(1);
  await expect(controls.getByTestId("delete-counts")).toContainText(
    "1 consent records",
  );
  await expect(controls.getByTestId("delete-counts")).toContainText("2 access logs");
});

test("renders an honest elite-school result and methodology disclosure", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Admissions Almanac \| Fitty/);
  await page.getByLabel("GPA").fill("3.95");
  await page.getByLabel("SAT").fill("1540");
  await page.getByRole("textbox", { exact: true, name: "ACT" }).fill("35");
  await page.getByLabel("Search by school name").fill("Massachusetts");
  await page
    .getByRole("button", { name: /Massachusetts Institute of Technology/ })
    .click();

  await expect(page.getByTestId("result-card")).toContainText(
    "Massachusetts Institute of Technology",
  );
  await expect(page.getByTestId("range-band")).toBeVisible();
  await expect(page.getByText("Lever map")).toBeVisible();
  await expect(page.getByText("What we cannot see")).toBeVisible();
  await expect(page.getByText("C7 rubric grounding")).toBeVisible();
  await expect(page.getByText("Disclosures")).toBeVisible();
  await expect(page.getByText("Source: 2023-24 CDS Common Data Set")).toBeVisible();

  await expect(page.getByTestId("sub20-note")).toContainText(
    "Sub-20 selectivity limit",
  );
  await expect(page.getByText(/Public data cannot narrow this interval/)).toBeVisible();
  await expect(page.getByTestId("balance-warning")).toContainText(
    "Every school on your list is a reach",
  );
  await expect(page.getByText(/your chance/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();

  await page.getByRole("link", { exact: true, name: "Methodology" }).click();
  await expect(page).toHaveURL(/\/methodology$/);
  await expect(page).toHaveTitle(/Methodology \| Fitty/);
  await expect(
    page.getByRole("heading", { name: /hard accuracy ceiling/i }),
  ).toBeVisible();
  await expect(page.getByText(/below 20% admit rate/i)).toBeVisible();
  await expect(page.getByText(/Synthetic public-data prior/i).first()).toBeVisible();
  await expect(page.getByText(/Race and ethnicity are never used/i)).toBeVisible();
  await expect(page.getByText("Real-outcome calibration ledger.")).toBeVisible();
  await expect(page.getByText("fixture_contract_check")).toBeVisible();
  await expect(page.getByText("Change-course check")).toBeVisible();
});
