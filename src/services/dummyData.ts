/**
 * Pools of realistic-looking fake data for dummy value generation.
 *
 * Design principles:
 * - Names are diverse (Anglo, Hispanic, South Asian, East Asian, African, European)
 * - Values look plausible at first glance but are clearly fake to anyone who checks
 * - No real addresses, routing numbers, or PII — only illustrative examples
 */

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

export const FIRST_NAMES_FEMALE: readonly string[] = [
  'Alice', 'Amara', 'Ana', 'Aria', 'Beatriz', 'Chloe', 'Clara', 'Dani',
  'Elena', 'Eliana', 'Emma', 'Fatima', 'Grace', 'Hana', 'Isabel', 'Jade',
  'Jasmine', 'Julia', 'Kayla', 'Layla', 'Leila', 'Lily', 'Luna', 'Maria',
  'Maya', 'Mei', 'Mia', 'Nadia', 'Natalia', 'Nina', 'Olivia', 'Priya',
  'Rina', 'Rosa', 'Sara', 'Sarah', 'Sasha', 'Sofia', 'Sophia', 'Tanisha',
  'Valentina', 'Vivian', 'Yuna', 'Zara', 'Zoe',
];

export const FIRST_NAMES_MALE: readonly string[] = [
  'Aaron', 'Adrian', 'Alex', 'Andre', 'Ben', 'Carlos', 'Chen', 'Daniel',
  'David', 'Diego', 'Dmitri', 'Elias', 'Ethan', 'Felix', 'Gabriel', 'Hassan',
  'Ivan', 'Jack', 'Javier', 'Jordan', 'Jose', 'Juan', 'Kai', 'Kevin',
  'Liam', 'Lucas', 'Luis', 'Marco', 'Marcus', 'Matthew', 'Max', 'Michael',
  'Miguel', 'Nathan', 'Noah', 'Omar', 'Oscar', 'Pablo', 'Peter', 'Rafael',
  'Ravi', 'Ryan', 'Samuel', 'Sebastian', 'Stefan', 'Thomas', 'Victor',
  'Wei', 'William', 'Yusuf',
];

export const FIRST_NAMES: readonly string[] = [
  ...FIRST_NAMES_FEMALE,
  ...FIRST_NAMES_MALE,
];

export const LAST_NAMES: readonly string[] = [
  'Adams', 'Aguilar', 'Ahmed', 'Alvarez', 'Anderson', 'Baker', 'Bauer',
  'Bennett', 'Brown', 'Campbell', 'Carter', 'Chang', 'Chen', 'Clark',
  'Cohen', 'Collins', 'Cooper', 'Davis', 'Diaz', 'Edwards', 'Evans',
  'Fisher', 'Flores', 'Foster', 'Garcia', 'Gonzalez', 'Green', 'Gupta',
  'Hall', 'Harris', 'Hernandez', 'Hill', 'Hughes', 'Jackson', 'Johnson',
  'Jones', 'Kelly', 'Kim', 'Kumar', 'Lee', 'Lewis', 'Li', 'Lin', 'Lopez',
  'Martin', 'Martinez', 'Miller', 'Mitchell', 'Moore', 'Morgan', 'Morris',
  'Murphy', 'Nguyen', 'Patel', 'Perez', 'Phillips', 'Price', 'Reed',
  'Rivera', 'Roberts', 'Robinson', 'Rodriguez', 'Ross', 'Russell',
  'Sanchez', 'Scott', 'Singh', 'Smith', 'Stewart', 'Sullivan', 'Taylor',
  'Thomas', 'Thompson', 'Torres', 'Turner', 'Walker', 'Wang', 'Ward',
  'White', 'Williams', 'Wilson', 'Wood', 'Wright', 'Young', 'Zhang',
];

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export const STREET_TYPES: readonly string[] = [
  'Street', 'Avenue', 'Boulevard', 'Drive', 'Lane', 'Road', 'Way',
  'Place', 'Court', 'Circle',
];

export const STREET_NAMES: readonly string[] = [
  'Maple', 'Oak', 'Cedar', 'Pine', 'Elm', 'Birch', 'Willow', 'Aspen',
  'Spruce', 'Walnut', 'Chestnut', 'Magnolia', 'Sycamore', 'Poplar',
  'Juniper', 'Highland', 'Hillside', 'Lakewood', 'Riverside', 'Sunset',
  'Sunrise', 'Valley', 'Meadow', 'Forest', 'Garden', 'Park', 'Ridge',
  'Summit', 'Harbor', 'Beacon', 'Lincoln', 'Washington', 'Jefferson',
  'Madison', 'Monroe',
];

/** City records with canonical US state abbreviation and ZIP prefix. */
export const CITIES: readonly { city: string; state: string; zipPrefix: string }[] = [
  { city: 'Springfield', state: 'IL', zipPrefix: '627' },
  { city: 'Franklin', state: 'TN', zipPrefix: '370' },
  { city: 'Riverside', state: 'CA', zipPrefix: '925' },
  { city: 'Greenville', state: 'SC', zipPrefix: '296' },
  { city: 'Burlington', state: 'VT', zipPrefix: '054' },
  { city: 'Salem', state: 'OR', zipPrefix: '973' },
  { city: 'Auburn', state: 'AL', zipPrefix: '368' },
  { city: 'Fairview', state: 'TX', zipPrefix: '750' },
  { city: 'Centerville', state: 'OH', zipPrefix: '454' },
  { city: 'Georgetown', state: 'KY', zipPrefix: '403' },
  { city: 'Lexington', state: 'NC', zipPrefix: '272' },
  { city: 'Bristol', state: 'VA', zipPrefix: '242' },
  { city: 'Hanover', state: 'PA', zipPrefix: '173' },
  { city: 'Milford', state: 'CT', zipPrefix: '064' },
  { city: 'Westfield', state: 'NJ', zipPrefix: '070' },
  { city: 'Lakewood', state: 'CO', zipPrefix: '802' },
  { city: 'Redwood City', state: 'CA', zipPrefix: '940' },
  { city: 'Meridian', state: 'ID', zipPrefix: '836' },
  { city: 'Bellevue', state: 'WA', zipPrefix: '980' },
  { city: 'Mesa', state: 'AZ', zipPrefix: '852' },
  { city: 'Naperville', state: 'IL', zipPrefix: '605' },
  { city: 'Overland Park', state: 'KS', zipPrefix: '662' },
  { city: 'Plano', state: 'TX', zipPrefix: '750' },
  { city: 'Chandler', state: 'AZ', zipPrefix: '852' },
  { city: 'Henderson', state: 'NV', zipPrefix: '890' },
  { city: 'Irvine', state: 'CA', zipPrefix: '926' },
  { city: 'Madison', state: 'WI', zipPrefix: '537' },
  { city: 'Lincoln', state: 'NE', zipPrefix: '685' },
  { city: 'Durham', state: 'NC', zipPrefix: '277' },
  { city: 'Raleigh', state: 'NC', zipPrefix: '276' },
  { city: 'Rochester', state: 'MN', zipPrefix: '559' },
  { city: 'Peoria', state: 'IL', zipPrefix: '616' },
  { city: 'Aurora', state: 'CO', zipPrefix: '800' },
  { city: 'Hialeah', state: 'FL', zipPrefix: '330' },
  { city: 'Garland', state: 'TX', zipPrefix: '750' },
];

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export const COMPANY_NAMES: readonly string[] = [
  'Acme Corporation', 'Apex Industries', 'Atlas Solutions', 'Blue Ridge LLC',
  'Brightfield Group', 'Cascade Partners', 'Cedar Point Ventures',
  'Clearwater Analytics', 'Crescent Capital', 'Delta Dynamics',
  'Emerald Bay Holdings', 'Falcon Ridge Co.', 'Frontier Systems',
  'Gateway Consulting', 'Granite Peak LLC', 'Horizon Enterprises',
  'Inland Capital Group', 'Iron Gate Partners', 'Keystone Advisors',
  'Lighthouse Analytics', 'Maple Leaf Holdings', 'Meridian Partners',
  'Northern Star Inc.', 'Oakwood Financial', 'Pacific Crest LLC',
];

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export const EMAIL_DOMAINS: readonly string[] = [
  'example.com', 'example.org', 'example.net',
  'mailtest.dev', 'testmail.io', 'fakeinbox.net',
  'gmail.com', 'yahoo.com', 'outlook.com',
  'hotmail.com', 'icloud.com', 'proton.me',
  'fastmail.com', 'zoho.com', 'mail.com',
];

export const EMAIL_LOCAL_PREFIXES: readonly string[] = [
  'user', 'test', 'contact', 'info', 'hello', 'admin', 'support',
  'noreply', 'demo', 'sample', 'account', 'no.reply', 'jdoe', 'jsmith',
];

// ---------------------------------------------------------------------------
// Medical record prefixes
// ---------------------------------------------------------------------------

export const MRN_PREFIXES: readonly string[] = [
  'MRN-', 'MR', 'PT-', 'PID-', 'REC-', 'HN-',
];

// ---------------------------------------------------------------------------
// Passport country letter codes (first char of passport number)
// ---------------------------------------------------------------------------

export const PASSPORT_LETTERS: readonly string[] = [
  'A', 'B', 'C', 'E', 'G', 'H', 'K', 'L', 'M', 'N',
  'P', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z',
];

// ---------------------------------------------------------------------------
// Base64 character set (for PEM body / JWT signature generation)
// ---------------------------------------------------------------------------

export const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const BASE64URL_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export const ALPHANUMERIC =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
