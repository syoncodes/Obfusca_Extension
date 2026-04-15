/**
 * Dictionaries for Tier 1 NER detection.
 *
 * All arrays are `as const` for tree-shaking; unused dictionaries are
 * eliminated by the bundler.  Total size target: < 100 KB.
 *
 * Name coverage: Anglo-American, Hispanic/Latin, East Asian, South Asian,
 * Southeast Asian, Middle Eastern, African — reflecting realistic diversity
 * in English-language text.
 */

// ---------------------------------------------------------------------------
// Title prefixes (before a person name)
// ---------------------------------------------------------------------------

export const TITLE_PREFIXES = [
  'Dr', 'Mr', 'Mrs', 'Ms', 'Miss', 'Prof', 'Professor',
  'Rev', 'Reverend', 'Capt', 'Captain', 'Sgt', 'Sergeant',
  'Lt', 'Col', 'Gen', 'Maj', 'Adm', 'Cmdr', 'Cpl', 'Pvt',
  'Insp', 'Det', 'Atty', 'Hon', 'Sheikh', 'Imam', 'Rabbi',
  'Fr', 'Br', 'Sr', 'Deacon', 'Chancellor', 'Ambassador',
] as const;

// ---------------------------------------------------------------------------
// Name suffixes (after a person name)
// ---------------------------------------------------------------------------

export const NAME_SUFFIXES = [
  'Jr', 'Sr', 'II', 'III', 'IV', 'V',
  'Esq', 'PhD', 'MD', 'DO', 'JD', 'MBA', 'CPA', 'RN', 'NP', 'PA',
] as const;

// ---------------------------------------------------------------------------
// First names — top 200, diverse
// ---------------------------------------------------------------------------

export const FIRST_NAMES = [
  // Anglo-American male
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard',
  'Joseph', 'Thomas', 'Charles', 'Christopher', 'Daniel', 'Matthew',
  'Anthony', 'Mark', 'Donald', 'Paul', 'Steven', 'Andrew', 'Kenneth',
  'Joshua', 'Kevin', 'Brian', 'George', 'Timothy', 'Ronald', 'Edward',
  'Jason', 'Jeffrey', 'Ryan', 'Jacob', 'Gary', 'Nicholas', 'Eric',
  'Stephen', 'Jonathan', 'Brandon', 'Tyler', 'Aaron', 'Adam',

  // Anglo-American female
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth',
  'Susan', 'Jessica', 'Sarah', 'Karen', 'Nancy', 'Lisa', 'Betty',
  'Margaret', 'Sandra', 'Ashley', 'Dorothy', 'Kimberly', 'Emily',
  'Donna', 'Michelle', 'Carol', 'Amanda', 'Melissa', 'Deborah',
  'Stephanie', 'Rebecca', 'Sharon', 'Laura', 'Cynthia', 'Kathleen',
  'Amy', 'Angela', 'Anna', 'Brenda', 'Pamela', 'Emma', 'Nicole', 'Helen',

  // Hispanic / Latin American
  'Carlos', 'Juan', 'Luis', 'Miguel', 'Eduardo', 'Diego', 'Ricardo',
  'Fernando', 'Antonio', 'Jorge', 'Alejandro', 'Francisco', 'Rafael',
  'Pedro', 'Pablo', 'Gabriel', 'Roberto', 'Andres', 'Elena', 'Sofia',
  'Isabella', 'Valentina', 'Camila', 'Lucia', 'Rosa', 'Carmen',
  'Pilar', 'Daniela', 'Natalia', 'Ana',

  // East Asian
  'Wei', 'Jia', 'Min', 'Xin', 'Yang', 'Fang', 'Lin', 'Jin', 'Hui',
  'Mei', 'Hiroshi', 'Takeshi', 'Yuki', 'Kenji', 'Akira', 'Yoko',
  'Naomi', 'Haruki', 'Keiko', 'Soo', 'Ji', 'Hyun', 'Young', 'Seung',

  // South Asian
  'Ananya', 'Priya', 'Ravi', 'Arjun', 'Vikram', 'Sanjay', 'Sunita',
  'Venkat', 'Ramesh', 'Deepa', 'Kavya', 'Suresh', 'Amit', 'Neha',

  // Southeast Asian
  'Thanh', 'Linh', 'Minh', 'Thuy', 'Lan', 'Nam', 'Bao', 'Tuan',

  // Middle Eastern / North African
  'Mohammed', 'Ahmed', 'Ali', 'Omar', 'Hassan', 'Ibrahim', 'Yusuf',
  'Khalid', 'Abdullah', 'Tariq', 'Fatima', 'Aisha', 'Maryam', 'Nour',
  'Layla', 'Yasmin', 'Zainab', 'Leila', 'Rania', 'Rana',

  // Sub-Saharan African
  'Kwame', 'Kofi', 'Ama', 'Abena', 'Kwesi', 'Amara', 'Chioma',
  'Chidi', 'Emeka', 'Ngozi', 'Oluwaseun', 'Adebayo', 'Fatou',
  'Moussa', 'Aminata', 'Seydou', 'Abebe', 'Selam', 'Yonas', 'Tigist',
  'Kwabena', 'Efua', 'Nia', 'Zara', 'Tunde', 'Bisi', 'Kemi',
] as const;

// ---------------------------------------------------------------------------
// Last names — top 200, diverse
// ---------------------------------------------------------------------------

export const LAST_NAMES = [
  // Anglo-American
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis',
  'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson',
  'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson',
  'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Scott',
  'Adams', 'Mitchell', 'Parker', 'Carter', 'Collins', 'Turner',
  'Campbell', 'Morgan', 'Reed', 'Cook', 'Bell', 'Murphy', 'Bailey',
  'Cooper', 'Richardson', 'Cox', 'Howard', 'Ward', 'Peterson', 'Gray',
  'Watson', 'Brooks', 'Kelly', 'Sanders', 'Price', 'Bennett', 'Wood',
  'Barnes', 'Ross', 'Henderson', 'Coleman', 'Jenkins', 'Perry',
  'Powell', 'Hughes', 'Washington', 'James',

  // Hispanic / Latin American
  'Rodriguez', 'Martinez', 'Garcia', 'Lopez', 'Gonzalez', 'Hernandez',
  'Perez', 'Sanchez', 'Ramirez', 'Cruz', 'Flores', 'Torres', 'Morales',
  'Romero', 'Reyes', 'Vargas', 'Castillo', 'Mendez', 'Gutierrez',
  'Jimenez', 'Ruiz', 'Alvarez', 'Navarro', 'Delgado', 'Vega', 'Ramos',
  'Ortiz', 'Molina', 'Aguilar', 'Medina', 'Munoz', 'Chavez', 'Vasquez',
  'Diaz', 'Serrano', 'Fuentes', 'Soto', 'Rios', 'Pena', 'Rivera',

  // East / Southeast Asian
  'Chen', 'Wang', 'Zhang', 'Liu', 'Li', 'Yang', 'Huang', 'Zhao', 'Wu',
  'Zhou', 'Sun', 'Ma', 'Zheng', 'Kim', 'Park', 'Lee', 'Choi', 'Jung',
  'Kang', 'Tanaka', 'Yamamoto', 'Suzuki', 'Sato', 'Watanabe',
  'Kobayashi', 'Ito', 'Nakamura', 'Nguyen', 'Tran', 'Le', 'Pham',
  'Bui', 'Dang', 'Ho', 'Lam', 'Ngo', 'Vu', 'Do',

  // South Asian
  'Patel', 'Shah', 'Sharma', 'Singh', 'Gupta', 'Kumar', 'Verma',
  'Iyer', 'Nair', 'Reddy', 'Rao', 'Joshi', 'Mehta', 'Bose', 'Das',

  // Middle Eastern
  'Al-Rashid', 'Al-Hassan', 'Al-Farsi', 'Al-Sayed', 'Al-Amari',
  'Qureshi', 'Ansari', 'Malik', 'Abbasi', 'Hussain', 'Mirza', 'Khan',
  'Sheikh', 'Siddiqui', 'Baig', 'Chaudhary', 'Raza', 'Noor', 'Awan',

  // Sub-Saharan African
  'Okonkwo', 'Adeyemi', 'Osei', 'Mensah', 'Asante', 'Diallo',
  'Traore', 'Keita', 'Ndiaye', 'Mbeki', 'Okafor', 'Chukwu', 'Nwosu',
  'Mwangi', 'Kamau', 'Ochieng', 'Abebe', 'Desta', 'Bekele', 'Tesfaye',
  'Adesanya', 'Obi', 'Eze', 'Onuoha', 'Adamu', 'Lawal',
] as const;

// ---------------------------------------------------------------------------
// Known organizations (for lookup without suffix clues)
// ---------------------------------------------------------------------------

export const KNOWN_ORGS = [
  // Big Tech
  'Google', 'Apple', 'Microsoft', 'Amazon', 'Meta', 'Tesla', 'Netflix',
  'Uber', 'Airbnb', 'LinkedIn', 'Salesforce', 'Oracle', 'IBM', 'Intel',
  'Nvidia', 'Cisco', 'Adobe', 'Qualcomm', 'Broadcom', 'Palantir',
  'Snowflake', 'Databricks', 'Stripe', 'SpaceX', 'OpenAI', 'Anthropic',
  'Cohere', 'Waymo', 'DeepMind', 'Hugging Face',

  // Finance
  'Goldman Sachs', 'JPMorgan', 'Citibank', 'Citigroup', 'Merrill Lynch',
  'BlackRock', 'Vanguard', 'Fidelity', 'Berkshire Hathaway',
  'Charles Schwab', 'Visa', 'Mastercard', 'PayPal', 'Robinhood',
  'Morgan Stanley', 'Wells Fargo', 'Bank of America',

  // Education
  'MIT', 'Stanford', 'Yale', 'Princeton', 'Caltech', 'Oxford',
  'Cambridge', 'Harvard', 'NYU', 'UCLA', 'USC', 'Dartmouth', 'Cornell',
  'Duke', 'Vanderbilt', 'Georgetown', 'Tulane',

  // Health
  'Mayo Clinic', 'Cleveland Clinic', 'Johns Hopkins', 'Cedars-Sinai',
  'Kaiser Permanente', 'Pfizer', 'Moderna', 'BioNTech', 'AstraZeneca',
  'Merck', 'Roche', 'Novartis', 'Bayer', 'Abbott', 'Medtronic',

  // Government / Agency
  'FBI', 'CIA', 'NSA', 'CDC', 'FDA', 'EPA', 'IRS', 'SEC', 'FEMA',
  'DEA', 'ATF', 'DHS', 'DOJ', 'NATO', 'WHO', 'UNICEF', 'IMF',
  'World Bank', 'UN', 'NASA', 'DARPA', 'OSHA', 'FTC', 'FCC',

  // Media
  'CNN', 'BBC', 'MSNBC', 'Reuters', 'Bloomberg', 'AP', 'NPR',

  // Consulting / Professional
  'McKinsey', 'Bain', 'Deloitte', 'PwC', 'KPMG', 'Accenture',
  'Booz Allen', 'Gartner', 'Forrester',

  // Retail / Consumer
  'Walmart', 'Target', 'CVS', 'Walgreens', 'Costco', 'Amazon',

  // Other
  'Boeing', 'Lockheed Martin', 'Raytheon', 'Northrop Grumman',
  'Verizon', 'AT&T', 'T-Mobile', 'Comcast', 'Disney', 'Sony',
  'Samsung', 'Toyota', 'Honda', 'BMW', 'Mercedes', 'Volkswagen',
  'Red Cross', 'ACLU', 'Greenpeace', 'Amnesty International',
] as const;

// ---------------------------------------------------------------------------
// Medication names — top 200 generic names
// ---------------------------------------------------------------------------

export const DRUG_NAMES = [
  // Pain / NSAID
  'Acetaminophen', 'Ibuprofen', 'Aspirin', 'Naproxen', 'Celecoxib',
  'Diclofenac', 'Meloxicam', 'Ketorolac', 'Indomethacin', 'Piroxicam',

  // Antibiotics
  'Amoxicillin', 'Azithromycin', 'Doxycycline', 'Ciprofloxacin',
  'Levofloxacin', 'Trimethoprim', 'Nitrofurantoin', 'Clindamycin',
  'Metronidazole', 'Cephalexin', 'Ceftriaxone', 'Vancomycin',
  'Piperacillin', 'Meropenem', 'Clarithromycin', 'Erythromycin',
  'Tetracycline', 'Ampicillin', 'Cefazolin', 'Cefuroxime',

  // Antihypertensive
  'Lisinopril', 'Amlodipine', 'Losartan', 'Metoprolol', 'Atenolol',
  'Carvedilol', 'Bisoprolol', 'Propranolol', 'Diltiazem', 'Verapamil',
  'Nifedipine', 'Hydrochlorothiazide', 'Furosemide', 'Spironolactone',
  'Clonidine', 'Hydralazine', 'Benazepril', 'Ramipril', 'Enalapril',
  'Valsartan', 'Olmesartan', 'Irbesartan', 'Telmisartan', 'Candesartan',

  // Cholesterol
  'Atorvastatin', 'Simvastatin', 'Rosuvastatin', 'Pravastatin',
  'Lovastatin', 'Ezetimibe', 'Fenofibrate', 'Gemfibrozil',

  // Diabetes
  'Metformin', 'Glipizide', 'Glimepiride', 'Pioglitazone', 'Sitagliptin',
  'Empagliflozin', 'Dapagliflozin', 'Liraglutide', 'Semaglutide',
  'Insulin', 'Exenatide', 'Dulaglutide', 'Canagliflozin',

  // Mental health
  'Sertraline', 'Escitalopram', 'Fluoxetine', 'Bupropion', 'Alprazolam',
  'Clonazepam', 'Lorazepam', 'Zolpidem', 'Trazodone', 'Quetiapine',
  'Risperidone', 'Aripiprazole', 'Duloxetine', 'Venlafaxine', 'Paroxetine',
  'Citalopram', 'Mirtazapine', 'Lithium', 'Haloperidol', 'Olanzapine',
  'Lurasidone', 'Ziprasidone', 'Clozapine', 'Fluvoxamine', 'Desvenlafaxine',

  // Respiratory / Allergy
  'Albuterol', 'Montelukast', 'Fluticasone', 'Budesonide', 'Salmeterol',
  'Tiotropium', 'Ipratropium', 'Theophylline', 'Beclomethasone',
  'Mometasone', 'Cetirizine', 'Fexofenadine', 'Loratadine', 'Diphenhydramine',

  // Opioids / Pain management
  'Hydrocodone', 'Oxycodone', 'Morphine', 'Tramadol', 'Codeine',
  'Fentanyl', 'Buprenorphine', 'Naloxone', 'Naltrexone', 'Tapentadol',

  // Anticoagulants
  'Warfarin', 'Apixaban', 'Rivaroxaban', 'Dabigatran', 'Clopidogrel',
  'Heparin', 'Enoxaparin', 'Fondaparinux', 'Ticagrelor', 'Prasugrel',

  // Thyroid / Hormones
  'Levothyroxine', 'Methimazole', 'Propylthiouracil', 'Testosterone',
  'Estradiol', 'Progesterone', 'Medroxyprogesterone', 'Norethindrone',
  'Leuprolide', 'Goserelin',

  // Immunosuppressants / Rheumatology
  'Methotrexate', 'Hydroxychloroquine', 'Azathioprine', 'Prednisone',
  'Methylprednisolone', 'Dexamethasone', 'Prednisolone', 'Cyclosporine',
  'Tacrolimus', 'Mycophenolate',

  // Oncology
  'Tamoxifen', 'Letrozole', 'Anastrozole', 'Exemestane', 'Fulvestrant',
  'Cyclophosphamide', 'Paclitaxel', 'Docetaxel', 'Carboplatin', 'Cisplatin',
  'Oxaliplatin', 'Gemcitabine', 'Capecitabine', 'Imatinib', 'Trastuzumab',
  'Bevacizumab', 'Rituximab', 'Pembrolizumab', 'Nivolumab', 'Atezolizumab',
  'Ipilimumab', 'Venetoclax', 'Ibrutinib', 'Lenalidomide', 'Bortezomib',

  // GI
  'Omeprazole', 'Pantoprazole', 'Esomeprazole', 'Lansoprazole',
  'Ranitidine', 'Famotidine', 'Sucralfate', 'Mesalamine', 'Sulfasalazine',
  'Ondansetron', 'Metoclopramide', 'Loperamide',

  // Neurology / Seizures
  'Gabapentin', 'Pregabalin', 'Topiramate', 'Levetiracetam', 'Lamotrigine',
  'Phenytoin', 'Carbamazepine', 'Oxcarbazepine', 'Valproate',

  // Cognitive / Dementia
  'Memantine', 'Donepezil', 'Rivastigmine', 'Galantamine',

  // Urology
  'Finasteride', 'Dutasteride', 'Tamsulosin', 'Sildenafil', 'Tadalafil',
  'Vardenafil', 'Desmopressin', 'Oxybutynin', 'Tolterodine',

  // Bone / Metabolic
  'Alendronate', 'Risedronate', 'Ibandronate', 'Denosumab', 'Teriparatide',
  'Raloxifene', 'Calcitonin', 'Cholecalciferol', 'Ergocalciferol',

  // Antivirals / Antifungals / Antiparasitics
  'Oseltamivir', 'Acyclovir', 'Valacyclovir', 'Famciclovir',
  'Fluconazole', 'Itraconazole', 'Voriconazole', 'Ivermectin',
  'Albendazole', 'Mebendazole', 'Atovaquone', 'Hydroxychloroquine',
] as const;

// ---------------------------------------------------------------------------
// Medical conditions — top 100
// ---------------------------------------------------------------------------

export const MEDICAL_CONDITIONS = [
  // Cardiovascular
  'hypertension', 'atherosclerosis', 'heart failure', 'atrial fibrillation',
  'myocardial infarction', 'angina', 'arrhythmia', 'stroke',
  'pulmonary embolism', 'deep vein thrombosis', 'aortic aneurysm',
  'cardiomyopathy', 'endocarditis', 'coronary artery disease',

  // Endocrine / Metabolic
  'diabetes', 'hypothyroidism', 'hyperthyroidism', 'graves disease',
  'hashimotos thyroiditis', 'addisons disease', 'cushings syndrome',
  'polycystic ovary syndrome', 'hyperlipidemia', 'obesity',

  // Cancer (general)
  'cancer', 'leukemia', 'lymphoma', 'melanoma', 'carcinoma',
  'sarcoma', 'myeloma', 'glioblastoma', 'mesothelioma', 'adenocarcinoma',
  'tumor',

  // Cancer (specific)
  'breast cancer', 'lung cancer', 'colon cancer', 'prostate cancer',
  'ovarian cancer', 'pancreatic cancer', 'liver cancer', 'kidney cancer',
  'bladder cancer', 'thyroid cancer', 'cervical cancer',

  // Mental health
  'depression', 'anxiety', 'schizophrenia', 'bipolar disorder', 'ptsd',
  'ocd', 'adhd', 'autism', 'anorexia', 'bulimia', 'substance abuse',
  'insomnia', 'narcolepsy', 'panic disorder',

  // Neurological
  'alzheimers disease', 'parkinsons disease', 'epilepsy',
  'multiple sclerosis', 'als', 'dementia', 'migraines', 'vertigo',
  'tinnitus', 'neuropathy', 'cerebral palsy',

  // Respiratory
  'asthma', 'copd', 'emphysema', 'bronchitis', 'pneumonia', 'tuberculosis',
  'pulmonary fibrosis', 'sarcoidosis', 'cystic fibrosis', 'sleep apnea',

  // Gastrointestinal
  'crohns disease', 'ulcerative colitis', 'ibs', 'celiac disease', 'gerd',
  'cirrhosis', 'hepatitis', 'pancreatitis', 'appendicitis', 'diverticulitis',
  'gallstones', 'peptic ulcer',

  // Infectious
  'hiv', 'aids', 'sepsis', 'meningitis', 'encephalitis', 'influenza',

  // Musculoskeletal
  'rheumatoid arthritis', 'osteoarthritis', 'osteoporosis', 'fibromyalgia',
  'gout', 'lupus', 'scleroderma', 'ankylosing spondylitis',

  // Renal / Urological
  'kidney disease', 'renal failure', 'kidney stones',

  // Skin
  'psoriasis', 'eczema', 'dermatitis', 'acne', 'rosacea', 'vitiligo',
  'alopecia',

  // Other
  'anemia', 'glaucoma', 'cataracts', 'macular degeneration', 'retinopathy',
  'hearing loss', 'hypothyroidism', 'hyperthyroidism',
] as const;

// ---------------------------------------------------------------------------
// Medical procedures
// ---------------------------------------------------------------------------

export const MEDICAL_PROCEDURES = [
  'appendectomy', 'cholecystectomy', 'colectomy', 'colonoscopy',
  'biopsy', 'mri', 'ct scan', 'x-ray', 'ultrasound', 'echocardiogram',
  'angiogram', 'angioplasty', 'bypass surgery', 'stent placement',
  'catheterization', 'dialysis', 'chemotherapy', 'radiation therapy',
  'immunotherapy', 'transplant', 'mastectomy', 'hysterectomy',
  'laparoscopy', 'arthroscopy', 'endoscopy', 'bronchoscopy',
  'cystoscopy', 'spinal fusion', 'hip replacement', 'knee replacement',
  'tracheotomy', 'tonsillectomy', 'rhinoplasty', 'intubation',
  'lumbar puncture', 'eeg', 'ekg', 'ecg', 'pet scan',
  'bone marrow biopsy', 'lithotripsy', 'anesthesia', 'surgery',
  'operation', 'procedure', 'resection', 'excision', 'amputation',
] as const;

// ---------------------------------------------------------------------------
// Words that are commonly capitalized mid-sentence but are NOT person names
// Used to filter false positives in consecutive-caps person detection.
// ---------------------------------------------------------------------------

export const NON_NAME_CAPITALIZED_WORDS = new Set<string>([
  // Days of week
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',

  // Months
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
  'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',

  // Nationalities / languages
  'American', 'English', 'French', 'Spanish', 'Chinese', 'Japanese',
  'Korean', 'German', 'Italian', 'Russian', 'Arabic', 'Indian', 'Brazilian',
  'Mexican', 'Canadian', 'Australian', 'British', 'African', 'Asian',
  'European', 'Latin', 'Hispanic', 'Pacific', 'Nordic', 'Scandinavian',
  'Greek', 'Turkish', 'Iranian', 'Israeli', 'Nigerian', 'Egyptian',
  'Portuguese', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish',
  'Polish', 'Ukrainian', 'Czech', 'Hungarian', 'Romanian', 'Bulgarian',
  'Croatian', 'Serbian', 'Slovak', 'Thai', 'Vietnamese', 'Indonesian',
  'Filipino', 'Malay', 'Pakistani', 'Bangladeshi', 'Sri Lankan',

  // Geographic / Directional
  'North', 'South', 'East', 'West', 'Northern', 'Southern', 'Eastern',
  'Western', 'Northeast', 'Northwest', 'Southeast', 'Southwest', 'Central',
  'Upper', 'Lower', 'Greater', 'Downtown', 'Uptown', 'Midtown',

  // Countries / Regions (commonly appear mid-sentence)
  'America', 'Europe', 'Asia', 'Africa', 'Australia', 'Canada', 'China',
  'Japan', 'Korea', 'Germany', 'France', 'Italy', 'Spain', 'Russia',
  'India', 'Brazil', 'Mexico', 'Israel', 'Iran', 'Iraq', 'Egypt',
  'Nigeria', 'Kenya', 'Pakistan', 'Indonesia', 'Thailand', 'Vietnam',
  'Philippines', 'Malaysia', 'Singapore', 'Taiwan',

  // Street / location type words (avoid "Oak Street" → person)
  'Street', 'Avenue', 'Road', 'Drive', 'Lane', 'Boulevard', 'Court',
  'Place', 'Way', 'Circle', 'Loop', 'Trail', 'Highway', 'Freeway',
  'Parkway', 'Square', 'Plaza', 'Park', 'Bridge', 'Tunnel', 'Airport',
  'Station', 'Terminal',

  // Common capitalized proper nouns that aren't person names
  'Internet', 'God', 'Bible', 'Quran', 'Torah', 'Congress', 'Senate',
  'Parliament', 'Constitution', 'Republic', 'Kingdom', 'Empire',
  'Federal', 'State', 'County', 'City', 'Town', 'Village', 'District',

  // Org / institution type words (covered by org detector)
  'University', 'College', 'School', 'Institute', 'Academy', 'Hospital',
  'Clinic', 'Center', 'Centre', 'Foundation', 'Corporation', 'Company',
  'Agency', 'Bureau', 'Department', 'Division', 'Authority', 'Commission',
  'Association', 'Society', 'Organization', 'Council', 'Committee',
  'Ministry', 'Office', 'Service', 'Group', 'Network', 'Alliance',

  // Common Proper English words
  'Monday', 'Tuesday', 'Act', 'Bill', 'Law', 'Code', 'Article', 'Section',
  'Chapter', 'Title', 'Part', 'Amendment', 'Treaty', 'Agreement', 'Protocol',
  'Standard', 'Regulation', 'Policy', 'Program', 'Project', 'Plan', 'Report',

  // Tech / brand words
  'Android', 'iPhone', 'Windows', 'Linux', 'MacOS', 'Safari', 'Chrome',
  'Firefox', 'Slack', 'Zoom', 'Teams', 'Excel', 'PowerPoint', 'Outlook',
]);
