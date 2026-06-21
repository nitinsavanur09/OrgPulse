import * as fs   from 'fs'
import * as path from 'path'

// ── Seed data ──────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','William','Barbara',
  'David','Elizabeth','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen',
  'Christopher','Lisa','Daniel','Nancy','Matthew','Betty','Anthony','Margaret','Mark','Sandra',
  'Donald','Ashley','Steven','Dorothy','Paul','Kimberly','Andrew','Emily','Kenneth','Donna',
  'Joshua','Michelle','Kevin','Carol','Brian','Amanda','George','Melissa','Edward','Deborah',
  'Ronald','Stephanie','Timothy','Rebecca','Jason','Sharon','Jeffrey','Laura','Ryan','Cynthia',
]

const LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
  'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
  'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
  'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
  'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts',
  'Phillips','Evans','Turner','Torres','Parker','Collins','Edwards','Stewart','Flores','Morris',
  'Nguyen','Murphy','Rivera','Cook','Rogers','Morgan','Peterson','Cooper','Reed','Bailey',
  'Bell','Gomez','Kelly','Howard','Ward','Cox','Diaz','Richardson','Wood','Watson',
]

const INSURANCE_COMPANIES = [
  'Sunrise Financial Group','Meridian Life Partners','Pacific Coast Assurance',
  'BlueSky Protection Services','Cornerstone Risk Management','Evergreen Coverage Co.',
  'Pinnacle Insurance Brokers','Heritage Mutual Group','Coastal Risk Advisors',
  'Summit Protection Alliance','Lighthouse Insurance Services','Cascade Financial Security',
  'Premier Risk Solutions','Horizon Assurance Group','Keystone Benefits Co.',
  'Streamline Coverage Partners','Apex Insurance Holdings','Valley Risk Management',
  'Crestview Financial Services','Lakeside Protection Group','Sterling Risk Partners',
  'Westpoint Insurance Alliance','Clearwater Benefits Group','Redwood Assurance Co.',
  'Oakridge Financial Partners',
]

const MANUFACTURING_COMPANIES = [
  'Apex Industrial Systems','Precision Components Ltd','Granite Manufacturing Co.',
  'Ironclad Production Group','Velocity Parts & Assembly','Summit Engineering Works',
  'BlueForge Manufacturing','Strata Industrial Solutions','Crestline Fabrication Inc.',
  'Meridian Parts Systems','Ridgeline Manufacturing Group','Cascade Production Works',
  'CoreTech Assembly Co.','Highpoint Industrial Ltd','Streamline Parts & Components',
  'Keystone Manufacturing Alliance','Pacific Fabrication Systems','Pinnacle Parts Group',
  'Centennial Industrial Co.','Northgate Manufacturing Inc.','Lakeside Engineering Works',
  'Thornton Components Group','Broadfield Production Inc.','Sterling Assembly Systems',
  'Clearwater Industrial Corp.',
]

const INDUSTRIES_INSURANCE = [
  'Insurance','Financial Services','Banking','Healthcare','Real Estate',
  'Government','Non-profit','Education','Retail','Technology',
]

const INDUSTRIES_MANUFACTURING = [
  'Manufacturing','Industrial','Construction','Engineering','Transportation',
  'Utilities','Technology','Healthcare','Retail','Wholesale',
]

const STAGES = [
  'Prospecting','Qualification','Needs Analysis','Value Proposition',
  'Id. Decision Makers','Perception Analysis','Proposal/Price Quote',
  'Negotiation/Review','Closed Won','Closed Lost',
]

const CASE_STATUSES = ['New','Working','Escalated','Closed']
const PRIORITIES = ['High','Medium','Low']
const LEAD_SOURCES = ['Web','Phone Inquiry','Partner Referral','Purchased List','Trade Show','Other']
const LEAD_STATUSES = ['New','Working','Converted','Unqualified','Nurturing']
const TASK_STATUSES = ['Completed','Not Started','In Progress']

const TITLES_INSURANCE = [
  'Claims Adjuster','Underwriter','Policy Analyst','Account Manager','Customer Service Rep',
  'Senior Underwriter','Claims Manager','Risk Analyst','Benefits Coordinator','Agent',
  'Branch Manager','Sales Representative','Policy Administrator','Compliance Officer','Actuary',
]

const TITLES_MANUFACTURING = [
  'Sales Manager','Account Executive','Business Development Manager','Regional Sales Director',
  'Sales Engineer','Key Account Manager','Territory Manager','Inside Sales Rep',
  'Product Manager','Supply Chain Analyst','Operations Manager','Procurement Specialist',
  'Technical Sales Representative','Channel Manager','Customer Success Manager',
]

const TASK_SUBJECTS_INSURANCE = [
  'Follow up on claim status','Policy renewal call','Send coverage documentation',
  'Schedule client review','Process address change','Verify beneficiary details',
  'Send premium invoice','Discuss policy amendment','Review claim appeal',
  'Annual account review','Confirm payment receipt','Escalation follow-up',
  'Underwriting document request','Welcome call — new policy','Policy cancellation review',
  'Coverage question follow-up','Fraud investigation note','Agent transfer completed',
  'Risk assessment meeting','General enquiry resolved',
]

const TASK_SUBJECTS_MANUFACTURING = [
  'Follow up on order status','Product demo scheduled','Send quote revision',
  'Contract review meeting','Technical spec call','Delivery confirmation',
  'Invoice dispute follow-up','Warranty claim initiated','Installation support scheduled',
  'Quarterly business review','Return processing started','Credit memo issued',
  'Backorder notification sent','Custom order specification','Compliance documentation sent',
  'Pipeline review completed','Product spec clarification','Account renewal discussion',
  'Shipping damage claim filed','New lead qualification call',
]

const NOVASTAR_CASE_REASONS = [
  ['Billing Issue', 313],
  ['Policy Change', 226],
  ['Claim Status', 209],
  ['Coverage Question', 174],
  ['Payment Problem', 157],
  ['Cancellation Request', 122],
  ['Document Request', 122],
  ['Renewal Query', 104],
  ['Fraud Report', 70],
  ['Beneficiary Update', 70],
  ['Premium Dispute', 52],
  ['Address Change', 52],
  ['New Claim', 52],
  ['Claim Denial Appeal', 35],
  ['Agent Transfer', 35],
  ['Underwriting Question', 26],
  ['Risk Assessment', 26],
  ['Policy Lapse', 17],
  ['Early Termination', 17],
  ['General Enquiry', 8],
]

const PRECISIONTECH_CASE_REASONS = [
  ['Order Delay', 304],
  ['Wrong Item Shipped', 236],
  ['Defective Product', 202],
  ['Invoice Dispute', 160],
  ['Return Request', 143],
  ['Warranty Claim', 118],
  ['Shipping Damage', 101],
  ['Product Spec Question', 84],
  ['Installation Support', 67],
  ['Delivery Not Received', 50],
  ['Partial Shipment', 42],
  ['Quote Discrepancy', 34],
  ['Contract Amendment', 27],
  ['Price Dispute', 22],
  ['Technical Documentation', 18],
  ['Credit Request', 15],
  ['Backorder Status', 12],
  ['Custom Order Issue', 10],
  ['Compliance Question', 8],
  ['General Enquiry', 6],
]

const PRODUCT_FAMILIES = ['Precision Parts','Assembly Systems','Raw Materials','Tooling & Fixtures','Safety Equipment']
const QUOTE_STATUSES   = ['Draft','Needs Review','In Review','Approved','Rejected','Presented','Accepted','Denied']
const CONTRACT_STATUSES = ['Draft','In Approval Process','Activated','Expired','Terminated']
const EMAIL_STATUSES   = ['New','Read','Replied','Sent','Draft']

// ── Utilities ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]
}

function dateOffset(daysBack: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

function futureDateOffset(daysForward: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysForward)
  return d.toISOString().slice(0, 10)
}

// Returns blank if (i mod blankEvery) === 0, otherwise returns value
function maybeBlank(value: string, fillPct: number, i: number): string {
  if (fillPct >= 100) return value
  const blankEvery = Math.round(100 / (100 - fillPct))
  return (i % blankEvery) === 0 ? '' : value
}

function writeCSV(filePath: string, headers: string[], rows: string[][]): void {
  const lines = [
    headers.join(','),
    ...rows.map(r => r.map(cell => {
      if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
        return `"${cell.replace(/"/g, '""')}"`
      }
      return cell
    }).join(',')),
  ]
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
  console.log(`  ✓ Written: ${path.relative(process.cwd(), filePath)} (${rows.length} rows)`)
}

function extId(prefix: string, i: number): string {
  return `${prefix}${String(i + 1).padStart(6, '0')}`
}

// ── Generators ─────────────────────────────────────────────────────────────────

interface ScenarioConfig {
  name:           string
  outDir:         string
  companies:      string[]
  industries:     string[]
  titles:         string[]
  taskSubjects:   string[]
  caseReasons:    [string, number][]
  emailStatuses?: string[]
  // row counts
  accountRows:    number
  contactRows:    number
  leadRows:       number
  oppRows:        number
  caseRows:       number
  taskRows:       number
  // optional sales objects
  productRows?:   number
  quoteRows?:     number
  contractRows?:  number
  // quality profiles (fill %)
  contactEmailFill:   number
  contactPhoneFill:   number
  contactTitleFill:   number
  contactAccountFill: number
  accountIndustryFill:number
  accountPhoneFill:   number
  accountCityFill:    number
  accountCountryFill: number
  accountWebsiteFill: number
  caseReasonFill:     number
  casePriorityFill:   number
  caseContactFill:    number
  caseAccountFill:    number
  leadEmailFill:      number
  leadPhoneFill:      number
  leadSourceFill:     number
  oppAmountFill:      number
  oppAccountFill:     number
  // duplicate injection for contacts (0 = no duplicates)
  contactDupPct:  number
}

function generateAccounts(cfg: ScenarioConfig): void {
  const headers = ['ExternalId','Name','Industry','Phone','BillingCity','BillingState','BillingCountry','Website']
  const cities  = ['Chicago','Houston','Phoenix','Philadelphia','San Antonio','San Diego','Dallas','San Jose']
  const states  = ['IL','TX','AZ','PA','TX','CA','TX','CA']
  const rows: string[][] = []

  for (let i = 0; i < cfg.accountRows; i++) {
    const company = pick(cfg.companies, i)
    const suffix  = i >= cfg.companies.length ? ` ${Math.floor(i / cfg.companies.length) + 1}` : ''
    const cityIdx = i % cities.length

    rows.push([
      extId('ACC', i),
      `${company}${suffix}`,
      maybeBlank(pick(cfg.industries, i), cfg.accountIndustryFill, i),
      maybeBlank(`+1-${String(200 + (i % 800)).padStart(3,'0')}-${String(1000 + (i % 9000)).slice(1)}-${String(1000 + (i * 7 % 9000)).slice(1)}`, cfg.accountPhoneFill, i),
      maybeBlank(cities[cityIdx], cfg.accountCityFill, i),
      states[cityIdx],
      maybeBlank('United States', cfg.accountCountryFill, i),
      maybeBlank(`https://www.${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`, cfg.accountWebsiteFill, i),
    ])
  }

  writeCSV(path.join(cfg.outDir, 'accounts.csv'), headers, rows)
}

function generateContacts(cfg: ScenarioConfig): void {
  const headers = ['ExternalId','FirstName','LastName','Email','Phone','Title','Account_ExternalId__c']
  const rows: string[][] = []

  const uniqueCount = Math.round(cfg.contactRows * (1 - cfg.contactDupPct / 100))
  const dupCount    = cfg.contactRows - uniqueCount

  for (let i = 0; i < cfg.contactRows; i++) {
    // Inject duplicates: last dupCount rows reuse names from early rows
    const srcIdx  = i < uniqueCount ? i : (i - uniqueCount) % Math.min(uniqueCount, dupCount)
    const first   = pick(FIRST_NAMES, srcIdx)
    const last    = pick(LAST_NAMES,  srcIdx + 7)
    const acctIdx = srcIdx % cfg.accountRows

    // Duplicates get different email/phone (different source record) but same name
    const emailBase = `${first.toLowerCase()}.${last.toLowerCase()}${i > 0 ? `.${i}` : ''}@${pick(cfg.companies, acctIdx).toLowerCase().replace(/[^a-z0-9]/g, '')}.com`

    rows.push([
      extId('CON', i),
      first,
      last,
      maybeBlank(emailBase, cfg.contactEmailFill, i),
      maybeBlank(`+1-${String(200 + (i % 800)).padStart(3,'0')}-${String(1000 + (i % 9000)).slice(1)}-${String(1000 + (i * 3 % 9000)).slice(1)}`, cfg.contactPhoneFill, i),
      maybeBlank(pick(cfg.titles, i), cfg.contactTitleFill, i),
      maybeBlank(extId('ACC', acctIdx), cfg.contactAccountFill, i),
    ])
  }

  writeCSV(path.join(cfg.outDir, 'contacts.csv'), headers, rows)
}

function generateLeads(cfg: ScenarioConfig): void {
  const headers = ['ExternalId','FirstName','LastName','Company','Email','Phone','LeadSource','Status']
  const rows: string[][] = []

  for (let i = 0; i < cfg.leadRows; i++) {
    const first   = pick(FIRST_NAMES, i + 5)
    const last    = pick(LAST_NAMES,  i + 12)
    const company = pick(cfg.companies, i + 3)

    rows.push([
      extId('LEAD', i),
      first,
      last,
      company,
      maybeBlank(`${first.toLowerCase()}.${last.toLowerCase()}@${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`, cfg.leadEmailFill, i),
      maybeBlank(`+1-${String(300 + (i % 700)).padStart(3,'0')}-${String(2000 + (i % 8000)).slice(1)}-${String(2000 + (i * 5 % 8000)).slice(1)}`, cfg.leadPhoneFill, i),
      maybeBlank(pick(LEAD_SOURCES, i), cfg.leadSourceFill, i),
      pick(LEAD_STATUSES, i),
    ])
  }

  writeCSV(path.join(cfg.outDir, 'leads.csv'), headers, rows)
}

function generateOpportunities(cfg: ScenarioConfig): void {
  const headers = ['ExternalId','Name','Account_ExternalId__c','StageName','CloseDate','Amount']
  const rows: string[][] = []

  for (let i = 0; i < cfg.oppRows; i++) {
    const acctIdx    = i % cfg.accountRows
    const company    = pick(cfg.companies, acctIdx)
    const daysForward = 30 + (i % 540)
    const amount     = String(5000 + ((i * 137) % 995000))

    rows.push([
      extId('OPP', i),
      `${company} — ${pick(['Renewal','Expansion','New Business','Upgrade','Upsell'], i)} ${new Date().getFullYear()}`,
      maybeBlank(extId('ACC', acctIdx), cfg.oppAccountFill, i),
      pick(STAGES, i),
      futureDateOffset(daysForward),
      maybeBlank(amount, cfg.oppAmountFill, i),
    ])
  }

  writeCSV(path.join(cfg.outDir, 'opportunities.csv'), headers, rows)
}

function generateCases(cfg: ScenarioConfig): void {
  const headers = ['ExternalId','Subject','Status','Priority','Reason','Account_ExternalId__c','Contact_ExternalId__c']
  const rows: string[][] = []

  // Build reason distribution array
  const reasonPool: string[] = []
  for (const [reason, count] of cfg.caseReasons) {
    for (let j = 0; j < count; j++) reasonPool.push(reason)
  }
  const filledCaseCount = Math.round(cfg.caseRows * cfg.caseReasonFill / 100)

  for (let i = 0; i < cfg.caseRows; i++) {
    const acctIdx    = i % cfg.accountRows
    const contIdx    = i % cfg.contactRows
    const reason     = i < filledCaseCount ? reasonPool[i % reasonPool.length] : ''
    const subject    = reason ? `${reason} — Case ${i + 1}` : `General enquiry — Case ${i + 1}`

    rows.push([
      extId('CASE', i),
      subject,
      pick(CASE_STATUSES, i),
      maybeBlank(pick(PRIORITIES, i), cfg.casePriorityFill, i),
      reason,
      maybeBlank(extId('ACC', acctIdx), cfg.caseAccountFill, i),
      maybeBlank(extId('CON', contIdx), cfg.caseContactFill, i),
    ])
  }

  writeCSV(path.join(cfg.outDir, 'cases.csv'), headers, rows)
}

function generateTasks(cfg: ScenarioConfig): void {
  const headers = ['ExternalId','Subject','Status','ActivityDate','Description']
  const rows: string[][] = []

  for (let i = 0; i < cfg.taskRows; i++) {
    const daysBack = Math.floor(i * 89 / cfg.taskRows)
    rows.push([
      extId('TASK', i),
      pick(cfg.taskSubjects, i),
      pick(TASK_STATUSES, i),
      dateOffset(daysBack),
      '',
    ])
  }

  writeCSV(path.join(cfg.outDir, 'tasks.csv'), headers, rows)
}

// ── Sales Cloud-only objects ───────────────────────────────────────────────────

function generateProducts(cfg: ScenarioConfig): void {
  if (!cfg.productRows) return
  const headers = ['ExternalId','Name','ProductCode','Family','IsActive','Description']
  const rows: string[][] = []

  for (let i = 0; i < cfg.productRows; i++) {
    const family = maybeBlank(pick(PRODUCT_FAMILIES, i), 64, i)
    const code   = maybeBlank(`PT-${String(1000 + i)}`, 78, i)
    rows.push([
      extId('PROD', i),
      `${family || 'Component'} Model ${String.fromCharCode(65 + (i % 26))}${i + 1}`,
      code,
      family,
      'true',
      '',
    ])
  }

  writeCSV(path.join(cfg.outDir, 'products.csv'), headers, rows)
}

function generateQuotes(cfg: ScenarioConfig): void {
  if (!cfg.quoteRows) return
  const headers = ['ExternalId','Name','Status','ExpirationDate','Account_ExternalId__c']
  const rows: string[][] = []

  for (let i = 0; i < cfg.quoteRows; i++) {
    const acctIdx    = i % cfg.accountRows
    const daysForward = 30 + (i % 90)

    rows.push([
      extId('QUOT', i),
      `Quote-${String(i + 1).padStart(5,'0')}`,
      pick(QUOTE_STATUSES, i),
      maybeBlank(futureDateOffset(daysForward), 55, i),
      maybeBlank(extId('ACC', acctIdx), 68, i),
    ])
  }

  writeCSV(path.join(cfg.outDir, 'quotes.csv'), headers, rows)
}

function generateContracts(cfg: ScenarioConfig): void {
  if (!cfg.contractRows) return
  const headers = ['ExternalId','ContractNumber','Status','StartDate','Account_ExternalId__c']
  const rows: string[][] = []

  for (let i = 0; i < cfg.contractRows; i++) {
    const acctIdx  = i % cfg.accountRows
    const daysBack = 30 + (i % 1060)

    rows.push([
      extId('CONT', i),
      `CTR-${String(10000 + i)}`,
      pick(CONTRACT_STATUSES, i),
      maybeBlank(dateOffset(daysBack), 72, i),
      maybeBlank(extId('ACC', acctIdx), 82, i),
    ])
  }

  writeCSV(path.join(cfg.outDir, 'contracts.csv'), headers, rows)
}

// ── Service Cloud-only objects ─────────────────────────────────────────────────

function generateEmailMessages(cfg: ScenarioConfig, emailRows: number): void {
  if (!cfg.emailStatuses) return
  const headers = ['ExternalId','Status','FromAddress','ToAddress','Subject']
  const rows: string[][] = []

  for (let i = 0; i < emailRows; i++) {
    const contIdx = i % cfg.contactRows
    const first   = pick(FIRST_NAMES, contIdx)
    const last    = pick(LAST_NAMES, contIdx + 7)

    rows.push([
      extId('EM', i),
      pick(EMAIL_STATUSES, i),
      `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      'service@novastarinsurance.com',
      `Re: ${pick(NOVASTAR_CASE_REASONS, i)[0]}`,
    ])
  }

  writeCSV(path.join(cfg.outDir, 'email_messages.csv'), headers, rows)
}

// ── Scenario definitions ───────────────────────────────────────────────────────

const NOVASTAR: ScenarioConfig = {
  name:           'NovaStar Insurance Group',
  outDir:         path.join(process.cwd(), 'data/demo/scenario-a-novastar/csv'),
  companies:      INSURANCE_COMPANIES,
  industries:     INDUSTRIES_INSURANCE,
  titles:         TITLES_INSURANCE,
  taskSubjects:   TASK_SUBJECTS_INSURANCE,
  caseReasons:    NOVASTAR_CASE_REASONS,
  emailStatuses:  EMAIL_STATUSES,
  // row counts
  accountRows:    500,
  contactRows:    3000,
  leadRows:       600,
  oppRows:        1200,
  caseRows:       3000,
  taskRows:       2000,
  // quality — Insurance: good data, some gaps
  contactEmailFill:    82,
  contactPhoneFill:    65,
  contactTitleFill:    58,
  contactAccountFill:  94,
  accountIndustryFill: 74,
  accountPhoneFill:    68,
  accountCityFill:     82,
  accountCountryFill:  77,
  accountWebsiteFill:  64,
  caseReasonFill:      58,
  casePriorityFill:    67,
  caseContactFill:     71,
  caseAccountFill:     88,
  leadEmailFill:       84,
  leadPhoneFill:       71,
  leadSourceFill:      82,
  oppAmountFill:       84,
  oppAccountFill:      92,
  contactDupPct:       3.4,
}

const PRECISIONTECH: ScenarioConfig = {
  name:           'PrecisionTech Manufacturing',
  outDir:         path.join(process.cwd(), 'data/demo/scenario-b-precisiontech/csv'),
  companies:      MANUFACTURING_COMPANIES,
  industries:     INDUSTRIES_MANUFACTURING,
  titles:         TITLES_MANUFACTURING,
  taskSubjects:   TASK_SUBJECTS_MANUFACTURING,
  caseReasons:    PRECISIONTECH_CASE_REASONS,
  // row counts
  accountRows:    500,
  contactRows:    4000,
  leadRows:       400,
  oppRows:        800,
  caseRows:       2000,
  taskRows:       1500,
  productRows:    150,
  quoteRows:      400,
  contractRows:   300,
  // quality — Manufacturing: poor data from ERP migration
  contactEmailFill:    38,
  contactPhoneFill:    28,
  contactTitleFill:    20,
  contactAccountFill:  65,
  accountIndustryFill: 45,
  accountPhoneFill:    41,
  accountCityFill:     55,
  accountCountryFill:  50,
  accountWebsiteFill:  32,
  caseReasonFill:      38,
  casePriorityFill:    42,
  caseContactFill:     48,
  caseAccountFill:     66,
  leadEmailFill:       52,
  leadPhoneFill:       38,
  leadSourceFill:      44,
  oppAmountFill:       55,
  oppAccountFill:      68,
  contactDupPct:       11.2,
}

// ── Main ───────────────────────────────────────────────────────────────────────

function generateScenario(cfg: ScenarioConfig): void {
  console.log(`\nGenerating ${cfg.name}...`)
  generateAccounts(cfg)
  generateContacts(cfg)
  generateLeads(cfg)
  generateOpportunities(cfg)
  generateCases(cfg)
  generateTasks(cfg)
  if (cfg.productRows)  generateProducts(cfg)
  if (cfg.quoteRows)    generateQuotes(cfg)
  if (cfg.contractRows) generateContracts(cfg)
  if (cfg.emailStatuses) generateEmailMessages(cfg, 500)
}

generateScenario(NOVASTAR)
generateScenario(PRECISIONTECH)
console.log('\n✓ All demo CSV files written.\n')
