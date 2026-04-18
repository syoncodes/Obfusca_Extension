/**
 * 50 benchmark texts covering all required categories for the Obfusca
 * browser benchmark harness.
 *
 * Categories:
 *   clean        (10) — No sensitive data; used to measure false-positive rate
 *                       and baseline detection latency.
 *   single       (15) — Exactly one sensitive item per text.
 *   multi        (10) — Multiple sensitive item types in a single text.
 *   adversarial  (10) — Obfuscated/lightly encoded sensitive data that
 *                       challenges naive regex matching.
 *   long         ( 5) — 500+ character texts; stress-tests full-pipeline
 *                       tokenization and NER latency.
 *
 * Each entry has:
 *   id              Unique identifier for cross-referencing in reports.
 *   category        One of the five categories above.
 *   text            The raw input text.
 *   expectedCount   How many detections the regex stage alone should find.
 *   expectedTypes   Which DetectionType values should appear in results
 *                   (may be a superset of what regex catches alone).
 *   notes           Optional: why this case is interesting.
 */

export type BenchmarkCategory = 'clean' | 'single' | 'multi' | 'adversarial' | 'long';

export interface BenchmarkText {
  id: string;
  category: BenchmarkCategory;
  text: string;
  /** Number of detections expected from the regex stage (0 for clean texts). */
  expectedCount: number;
  /** Detection types expected to appear (regex + NER combined). */
  expectedTypes: string[];
  notes?: string;
}

// ---------------------------------------------------------------------------
// CLEAN (10) — no sensitive data
// ---------------------------------------------------------------------------

const CLEAN: BenchmarkText[] = [
  {
    id: 'clean-001',
    category: 'clean',
    text: 'Hi team, the weekly standup has been moved to Thursday at 2 PM. Please update your calendars.',
    expectedCount: 0,
    expectedTypes: [],
  },
  {
    id: 'clean-002',
    category: 'clean',
    text: 'The new feature was deployed to production successfully. No rollbacks required.',
    expectedCount: 0,
    expectedTypes: [],
  },
  {
    id: 'clean-003',
    category: 'clean',
    text: 'Please review the attached Q3 roadmap document and provide feedback by Friday.',
    expectedCount: 0,
    expectedTypes: [],
  },
  {
    id: 'clean-004',
    category: 'clean',
    text: 'Our system uptime for the past 30 days was 99.97%. Great work on reliability!',
    expectedCount: 0,
    expectedTypes: [],
    notes: 'Numbers present but not in sensitive patterns.',
  },
  {
    id: 'clean-005',
    category: 'clean',
    text: 'I have 3 action items from the retrospective: update docs, fix the CI pipeline, and schedule a design review.',
    expectedCount: 0,
    expectedTypes: [],
  },
  {
    id: 'clean-006',
    category: 'clean',
    text: 'The conference call dial-in is 1-800-555-0199. See the calendar invite for the access code.',
    expectedCount: 0,
    expectedTypes: [],
    notes: 'Phone number that should NOT match SSN or CC patterns.',
  },
  {
    id: 'clean-007',
    category: 'clean',
    text: 'We processed 12,450 transactions this week with an average value of $42.30.',
    expectedCount: 0,
    expectedTypes: [],
    notes: 'Monetary amounts and counts — no PII.',
  },
  {
    id: 'clean-008',
    category: 'clean',
    text: 'Regression test results: 847 passed, 0 failed, 3 skipped. Build #4201 is green.',
    expectedCount: 0,
    expectedTypes: [],
  },
  {
    id: 'clean-009',
    category: 'clean',
    text: 'The open-source license for this library is Apache 2.0. See the LICENSE file.',
    expectedCount: 0,
    expectedTypes: [],
  },
  {
    id: 'clean-010',
    category: 'clean',
    text: 'Error rate dropped from 0.42% to 0.08% after the config change. Monitoring for 24h.',
    expectedCount: 0,
    expectedTypes: [],
  },
];

// ---------------------------------------------------------------------------
// SINGLE (15) — exactly one sensitive item per text
// ---------------------------------------------------------------------------

const SINGLE: BenchmarkText[] = [
  {
    id: 'single-001',
    category: 'single',
    text: "Please verify your identity. Your Social Security Number is 456-78-9012.",
    expectedCount: 1,
    expectedTypes: ['ssn'],
  },
  {
    id: 'single-002',
    category: 'single',
    text: 'Charge the membership fee to 4111 1111 1111 1111 — standard Visa.',
    expectedCount: 1,
    expectedTypes: ['credit_card'],
  },
  {
    id: 'single-003',
    category: 'single',
    text: 'The production access key is AKIAIOSFODNN7EXAMPLE. Rotate it within 24 hours.',
    expectedCount: 1,
    expectedTypes: ['aws_key'],
  },
  {
    id: 'single-004',
    category: 'single',
    text: 'Set the OPENAI_API_KEY environment variable to sk-abcdefghijklmnopqrstuvwxyz123456 in CI.',
    expectedCount: 1,
    expectedTypes: ['api_key'],
    notes: 'sk- prefix API key.',
  },
  {
    id: 'single-005',
    category: 'single',
    text: 'The deployment key is:\n-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----',
    expectedCount: 1,
    expectedTypes: ['private_key'],
  },
  {
    id: 'single-006',
    category: 'single',
    text: 'Revoke the GitHub PAT immediately: ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890 was committed.',
    expectedCount: 1,
    expectedTypes: ['api_key'],
    notes: 'GitHub Personal Access Token.',
  },
  {
    id: 'single-007',
    category: 'single',
    text: "Patient's SSN on file: 123-45-6789. Please do not share outside the care team.",
    expectedCount: 1,
    expectedTypes: ['ssn'],
  },
  {
    id: 'single-008',
    category: 'single',
    text: 'Process the refund to Mastercard 5500 0000 0000 0004 — the charge was erroneous.',
    expectedCount: 1,
    expectedTypes: ['credit_card'],
  },
  {
    id: 'single-009',
    category: 'single',
    text: 'Use api_key=X9vKm3NqRpWzYjHs4tBcEaLuFoDiMbGe for the webhook authentication header.',
    expectedCount: 1,
    expectedTypes: ['api_key'],
    notes: 'Generic api_key= pattern.',
  },
  {
    id: 'single-010',
    category: 'single',
    text: 'The staging access key ASIAIOSFODNN7EXAMPLE has been rotated. Update your local config.',
    expectedCount: 1,
    expectedTypes: ['aws_key'],
    notes: 'ASIA- prefix STS temporary credentials.',
  },
  {
    id: 'single-011',
    category: 'single',
    text: "John's date of birth is March 3, 1987. We need this for the benefits enrollment.",
    expectedCount: 0,
    expectedTypes: ['name', 'date'],
    notes: 'NER-only detection — regex will find 0, NER should find name + date.',
  },
  {
    id: 'single-012',
    category: 'single',
    text: 'Please mail the contract to 42 Maple Street, Austin, TX 78701.',
    expectedCount: 0,
    expectedTypes: ['address'],
    notes: 'Address detection — NER only.',
  },
  {
    id: 'single-013',
    category: 'single',
    text: 'Discovery card: 6011 0009 9013 9424. Transaction approved at 14:32 UTC.',
    expectedCount: 1,
    expectedTypes: ['credit_card'],
    notes: 'Discover card number.',
  },
  {
    id: 'single-014',
    category: 'single',
    text: 'Her Amex ending in 371449635398431 was declined due to insufficient funds.',
    expectedCount: 1,
    expectedTypes: ['credit_card'],
    notes: 'American Express (15-digit).',
  },
  {
    id: 'single-015',
    category: 'single',
    text: 'The new OPENAI key is sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA for the prod env.',
    expectedCount: 1,
    expectedTypes: ['api_key'],
    notes: 'OpenAI project key with sk- prefix.',
  },
];

// ---------------------------------------------------------------------------
// MULTI (10) — multiple sensitive types in one text
// ---------------------------------------------------------------------------

const MULTI: BenchmarkText[] = [
  {
    id: 'multi-001',
    category: 'multi',
    text:
      "Employee onboarding: Sarah Connor's SSN is 321-54-9876 and her Visa is " +
      '4111111111111111. Her AWS access key is AKIAIOSFODNN7EXAMPLE.',
    expectedCount: 3,
    expectedTypes: ['ssn', 'credit_card', 'aws_key'],
  },
  {
    id: 'multi-002',
    category: 'multi',
    text:
      'The breach report contains the following credentials: API key ' +
      'sk-abcdefghijklmnopqrstuvwxyz1234 and private key -----BEGIN RSA PRIVATE KEY----- ' +
      'from the production repository.',
    expectedCount: 2,
    expectedTypes: ['api_key', 'private_key'],
  },
  {
    id: 'multi-003',
    category: 'multi',
    text:
      "Patient James Rodriguez (SSN: 555-12-3456) presented on 2025-03-14. " +
      "Insurance card: 4532015112830366. Diagnosis: Type 2 diabetes (ICD-10: E11).",
    expectedCount: 2,
    expectedTypes: ['ssn', 'credit_card', 'medical'],
    notes: 'Medical context — NER should additionally catch the medical condition.',
  },
  {
    id: 'multi-004',
    category: 'multi',
    text:
      'New hire packet for Mark Chen: DOB 1990-07-22, address 100 Main St Chicago IL 60601, ' +
      'emergency contact SSN 234-56-7890, start date 2025-05-01.',
    expectedCount: 1,
    expectedTypes: ['ssn', 'address', 'date'],
    notes: 'Structured HR data — mix of regex (SSN) and NER (address, dates).',
  },
  {
    id: 'multi-005',
    category: 'multi',
    text:
      'Rotate all credentials: GitHub token ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890, ' +
      'API secret api_key=V2luZG93c0FQSUtleUhlcmU1Njc4OTAxMjM0NTY3, ' +
      'and AWS key AKIAIOSFODNN7EXAMPLE were all pushed to the public repo.',
    expectedCount: 3,
    expectedTypes: ['api_key', 'aws_key'],
  },
  {
    id: 'multi-006',
    category: 'multi',
    text:
      "Legal settlement summary: Plaintiff Jane Doe (SSN 789-01-2345) is to receive " +
      "$2,400,000 (two million four hundred thousand dollars) by wire transfer to " +
      "routing number 021000021 account 1234567890123456 by March 31, 2025.",
    expectedCount: 1,
    expectedTypes: ['ssn', 'bank_account', 'name', 'money'],
    notes: 'Settlement record with financial and personal data.',
  },
  {
    id: 'multi-007',
    category: 'multi',
    text:
      'Export: user_id=4892, name=Alice Wang, email=alice@example.com, ' +
      'ssn=456-78-9012, cc=5425233430109903, api_key=sk-testKeyForObfusca12345678.',
    expectedCount: 3,
    expectedTypes: ['ssn', 'credit_card', 'api_key', 'name', 'email'],
    notes: 'CSV-style export with multiple PII fields.',
  },
  {
    id: 'multi-008',
    category: 'multi',
    text:
      "Dr. Patricia Hill's NPI is 1234567893. Her medical license in California (ML-45678) " +
      "covers her practice at 900 Oak Drive, Sacramento CA 95814. " +
      "Contact: phill@hospital.org. EIN: 12-3456789.",
    expectedCount: 0,
    expectedTypes: ['name', 'address', 'medical', 'org'],
    notes: 'Professional identity — NER-only detections.',
  },
  {
    id: 'multi-009',
    category: 'multi',
    text:
      'PCI audit finding: card 4916338506082832 was logged in plain text alongside ' +
      "cardholder SSN 678-90-1234 in the application's debug log on 2025-02-18.",
    expectedCount: 2,
    expectedTypes: ['credit_card', 'ssn'],
  },
  {
    id: 'multi-010',
    category: 'multi',
    text:
      'CI/CD secrets file:\n' +
      'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n' +
      'STRIPE_SECRET_KEY=sk-stripeTestKeyABCDEFGHIJKLMNOPQ\n' +
      'GH_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890\n' +
      'DB_PASS=my$uperS3cret!',
    expectedCount: 3,
    expectedTypes: ['aws_key', 'api_key'],
    notes: 'Env file with multiple credential types.',
  },
];

// ---------------------------------------------------------------------------
// ADVERSARIAL (10) — obfuscated or tricky sensitive data
// ---------------------------------------------------------------------------

const ADVERSARIAL: BenchmarkText[] = [
  {
    id: 'adv-001',
    category: 'adversarial',
    text: 'My SSN is four five six dash seven eight dash nine zero one two.',
    expectedCount: 0,
    expectedTypes: ['ssn'],
    notes: 'Spelled-out SSN — regex will miss, NER may catch contextual cue.',
  },
  {
    id: 'adv-002',
    category: 'adversarial',
    text: 'Card: 4111-1111-1111-1111 (valid Visa test number, intentionally included in docs).',
    expectedCount: 1,
    expectedTypes: ['credit_card'],
    notes: 'Explicitly labelled test card — still should be detected.',
  },
  {
    id: 'adv-003',
    category: 'adversarial',
    text: 'AWS key: A K I A I O S F O D N N 7 E X A M P L E (space-separated).',
    expectedCount: 0,
    expectedTypes: ['aws_key'],
    notes: 'Space-separated AWS key — regex will miss; tests NER robustness.',
  },
  {
    id: 'adv-004',
    category: 'adversarial',
    text: 'The reference number is 456789012 — please use it for your records.',
    expectedCount: 0,
    expectedTypes: [],
    notes: '9-digit number without separators — should NOT trigger SSN detection.',
  },
  {
    id: 'adv-005',
    category: 'adversarial',
    text:
      'Encoded credential (base64): c2stYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=\n' +
      '(Decode to get the API key)',
    expectedCount: 0,
    expectedTypes: ['api_key'],
    notes: 'Base64-encoded sk- key — regex miss; semantic cue present.',
  },
  {
    id: 'adv-006',
    category: 'adversarial',
    text: 'SSN: 000-00-0000 is used as a placeholder in test data. Do not process.',
    expectedCount: 0,
    expectedTypes: [],
    notes: 'All-zeros SSN — isValidSSN validator should reject it.',
  },
  {
    id: 'adv-007',
    category: 'adversarial',
    text:
      "The patient's social is 4 5 6 - 7 8 - 9 0 1 2. Keep strictly confidential.",
    expectedCount: 0,
    expectedTypes: ['ssn'],
    notes: 'Spaces within SSN digits — regex miss, NER context cue.',
  },
  {
    id: 'adv-008',
    category: 'adversarial',
    text: 'prod key: sk\u2011abcdefghijklmnopqrstuvwxyz1234 (non-breaking hyphen).',
    expectedCount: 0,
    expectedTypes: ['api_key'],
    notes: 'Unicode non-breaking hyphen instead of regular hyphen — evades regex.',
  },
  {
    id: 'adv-009',
    category: 'adversarial',
    text: '666-12-3456 is NOT a valid SSN — area code 666 is reserved.',
    expectedCount: 0,
    expectedTypes: [],
    notes: 'Area code 666 — isValidSSN must reject this.',
  },
  {
    id: 'adv-010',
    category: 'adversarial',
    text:
      'The card number in the screenshot was 4111 11** **** 1111 (partially masked). ' +
      'Full number was 4111111111111111 per the audit log.',
    expectedCount: 1,
    expectedTypes: ['credit_card'],
    notes: 'Mixed masked + unmasked — only the full number should be detected.',
  },
];

// ---------------------------------------------------------------------------
// LONG (5) — 500+ character texts
// ---------------------------------------------------------------------------

const LONG: BenchmarkText[] = [
  {
    id: 'long-001',
    category: 'long',
    text:
      'Dear John,\n\n' +
      'I am writing to follow up on our discussion regarding the upcoming data migration ' +
      'project scheduled for Q3. As agreed, the migration will involve moving all customer ' +
      'records from our legacy CRM system to the new Salesforce environment.\n\n' +
      'As part of the pre-migration audit, we identified that several records contain ' +
      'sensitive PII that must be handled in compliance with CCPA and GDPR. Specifically, ' +
      'the following data elements are affected:\n\n' +
      '  - Full legal names and date of birth\n' +
      '  - Social Security Numbers (e.g., 456-78-9012 for test record #TMP-00042)\n' +
      '  - Payment card data (Visa: 4111111111111111, last used 2024-11-30)\n\n' +
      'Please ensure that all engineers working on the migration have completed their ' +
      'annual security awareness training and have signed the updated data handling ' +
      'agreement before the migration window opens on July 14, 2025.\n\n' +
      'Best regards,\nCompliance Team',
    expectedCount: 2,
    expectedTypes: ['ssn', 'credit_card', 'name', 'date'],
    notes: '600+ char email with SSN and CC embedded in structured body.',
  },
  {
    id: 'long-002',
    category: 'long',
    text:
      '## Incident Report INC-2025-0892\n\n' +
      '**Severity:** Critical\n' +
      '**Detected:** 2025-04-02T03:12:44Z\n' +
      '**Reporter:** Automated SIEM alert\n\n' +
      '### Summary\n\n' +
      'A misconfigured CI/CD pipeline exposed repository secrets in the public build ' +
      'logs for approximately 47 minutes before the alert was triggered. The following ' +
      'secrets were visible in the log output:\n\n' +
      '```\n' +
      'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n' +
      'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n' +
      'STRIPE_SECRET=sk-live-stripeTestKeyABCDEFGHIJKLMNO\n' +
      '```\n\n' +
      '### Impact Assessment\n\n' +
      'The AWS key was used to make 3 API calls to S3 during the exposure window. ' +
      'No data exfiltration was detected. The Stripe key was not used. All secrets ' +
      'have been rotated as of 2025-04-02T04:01:00Z.\n\n' +
      '### Remediation Steps Taken\n\n' +
      '1. Disabled exposed IAM user immediately.\n' +
      '2. Rotated all exposed secrets.\n' +
      '3. Added secret masking to all CI pipeline steps.\n' +
      '4. Filed cloud trail review request with Cloud Security team.',
    expectedCount: 2,
    expectedTypes: ['aws_key', 'api_key'],
    notes: 'Incident report with embedded credential block — 700+ chars.',
  },
  {
    id: 'long-003',
    category: 'long',
    text:
      'PATIENT DISCHARGE SUMMARY\n\n' +
      'Patient: Maria Gomez    DOB: 1975-09-14    MRN: MGH-2025-089432\n' +
      'Admission: 2025-03-28   Discharge: 2025-04-01\n' +
      'Attending: Dr. R. Patel, MD (NPI: 1234567893)\n\n' +
      'PRIMARY DIAGNOSIS\n' +
      'Acute appendicitis (ICD-10: K37), treated with laparoscopic appendectomy.\n\n' +
      'SECONDARY FINDINGS\n' +
      'Mild hypertension (ICD-10: I10). Prescribed amlodipine 5mg once daily.\n\n' +
      'INSURANCE\n' +
      'Carrier: BlueCross BlueShield (Group: BCB-TX-4892, Member: 0012345678)\n' +
      'Payment card on file: 5500000000000004 (Mastercard, exp 07/27)\n\n' +
      'FOLLOW-UP\n' +
      'Return to Dr. Patel in 2 weeks (approx. 2025-04-15). Contact the office at ' +
      '(512) 555-0182 for any concerns. Prescriptions sent electronically to CVS ' +
      'at 1801 S Congress Ave, Austin TX 78704.\n\n' +
      'SSN on file: 789-01-2345 (required for Medicare billing).\n' +
      'HIPAA Authorization: signed 2025-03-28.',
    expectedCount: 2,
    expectedTypes: ['ssn', 'credit_card', 'name', 'date', 'medical', 'address'],
    notes: 'Medical discharge summary with SSN, CC, addresses — 750+ chars.',
  },
  {
    id: 'long-004',
    category: 'long',
    text:
      'From: alice@acme.com\n' +
      'To: security@acme.com\n' +
      'Subject: Urgent - leaked credentials in Slack export\n\n' +
      'Hi Security Team,\n\n' +
      'During our routine review of the Slack workspace export, I noticed that several ' +
      'engineers shared sensitive credentials in the #dev-general channel over the past ' +
      'three months. I have compiled a summary below for your review and immediate action.\n\n' +
      '1. On 2025-01-14, @dan posted: "For anyone needing quick access: ' +
      'AKIAIOSFODNN7EXAMPLE / secret in the 1Password vault under DevProd."\n\n' +
      '2. On 2025-02-03, @carol shared a .env snippet containing:\n' +
      '   PAYMENT_API_KEY=sk-paymentProcessorABC123456789XYZAB\n\n' +
      '3. On 2025-03-19, @bob posted a support note that included a customer SSN: ' +
      '456-78-9012 (customer ID CUST-00821) and their Visa card: 4111111111111111.\n\n' +
      'All of the above items should be considered compromised. I recommend immediate ' +
      'rotation and a review of Slack DLP policies to prevent future incidents.\n\n' +
      'Regards,\nAlice',
    expectedCount: 4,
    expectedTypes: ['aws_key', 'api_key', 'ssn', 'credit_card'],
    notes: 'Slack leak report — 4 different credential types, 800+ chars.',
  },
  {
    id: 'long-005',
    category: 'long',
    text:
      'CONFIDENTIAL — NOT FOR DISTRIBUTION\n\n' +
      'MERGER AGREEMENT TERM SHEET\n\n' +
      'Parties:\n' +
      '  Acquirer:  Apex Ventures LLC (EIN: 82-1234567), 500 Park Ave, New York NY 10022\n' +
      '  Target:    Bolt Dynamics Inc. (EIN: 47-9876543), 200 California St, SF CA 94111\n\n' +
      'Transaction Overview:\n' +
      'Apex Ventures LLC agrees to acquire 100% of the outstanding shares of Bolt Dynamics Inc. ' +
      'for a total consideration of $147,000,000 (one hundred forty-seven million US dollars), ' +
      'subject to the adjustments described herein.\n\n' +
      'Escrow:\n' +
      'Fifteen percent (15%) of the purchase price ($22,050,000) will be held in escrow for ' +
      '18 months following the closing date to satisfy indemnification claims.\n\n' +
      'Key Personnel Retention:\n' +
      'The CEO of Bolt Dynamics, Derek Haines (SSN: 321-65-9870), and the CTO, Yuki Tanaka ' +
      '(SSN: 987-65-4321), are required to remain employed for a minimum of 24 months post-close ' +
      'as a condition of the earnout.\n\n' +
      'Payment Instructions:\n' +
      'Wire transfer to: JPMorgan Chase, ABA: 021000021, Account: 4589201234567890.\n\n' +
      'This term sheet is non-binding except for the confidentiality and exclusivity clauses ' +
      'in sections 7 and 8. Governed by Delaware law.',
    expectedCount: 2,
    expectedTypes: ['ssn', 'name', 'address', 'org', 'money'],
    notes: 'Legal M&A document — SSNs of key personnel, financials, addresses — 900+ chars.',
  },
];

// ---------------------------------------------------------------------------
// Exported corpus
// ---------------------------------------------------------------------------

/** All 50 benchmark texts in canonical order. */
export const BENCHMARK_TEXTS: BenchmarkText[] = [
  ...CLEAN,
  ...SINGLE,
  ...MULTI,
  ...ADVERSARIAL,
  ...LONG,
];

export const BENCHMARK_TEXT_COUNT = BENCHMARK_TEXTS.length;

/** Texts grouped by category for selective benchmarking. */
export const BENCHMARK_BY_CATEGORY: Record<BenchmarkCategory, BenchmarkText[]> = {
  clean: CLEAN,
  single: SINGLE,
  multi: MULTI,
  adversarial: ADVERSARIAL,
  long: LONG,
};
