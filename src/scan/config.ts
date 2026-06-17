export interface ObjectScanConfig {
  apiName:          string
  label:            string
  fields:           string[]
  checkDuplicates?: boolean
  duplicateFields?: string[]
  minRecords?:      number
  tier:             'tier1' | 'tier2' | 'tier3'
}

export interface ScanConfig {
  agentforceUseCase:    'service' | 'sales' | 'field_service' | 'custom'
  objects:              ObjectScanConfig[]
  maxCustomObjects:     number
  adoptionLookbackDays: number
}

export const DEFAULT_CONFIG: ScanConfig = {
  agentforceUseCase:    'service',
  maxCustomObjects:     20,
  adoptionLookbackDays: 90,
  objects: [
    // Tier 1 — always scanned, every use case
    {
      tier: 'tier1', apiName: 'Contact', label: 'Contact',
      fields: ['Email', 'Phone', 'Title', 'AccountId', 'FirstName', 'LastName'],
      checkDuplicates: true, duplicateFields: ['Name', 'Email'], minRecords: 0,
    },
    {
      tier: 'tier1', apiName: 'Account', label: 'Account',
      fields: ['Industry', 'Phone', 'BillingCity', 'BillingCountry', 'Website'],
      checkDuplicates: true, duplicateFields: ['Name'], minRecords: 0,
    },
    {
      tier: 'tier1', apiName: 'Lead', label: 'Lead',
      fields: ['Email', 'Phone', 'Company', 'LeadSource', 'Status'],
      checkDuplicates: false, minRecords: 0,
    },
    {
      tier: 'tier1', apiName: 'Opportunity', label: 'Opportunity',
      fields: ['CloseDate', 'StageName', 'Amount', 'AccountId'],
      checkDuplicates: false, minRecords: 0,
    },
    {
      tier: 'tier1', apiName: 'Case', label: 'Case',
      fields: ['Reason', 'Status', 'ContactId', 'AccountId', 'Priority'],
      checkDuplicates: false, minRecords: 0,
    },
    // Note: Knowledge domain is handled by src/scan/knowledge.ts, not field completeness
  ],
}

export const USE_CASE_OBJECTS: Record<ScanConfig['agentforceUseCase'], ObjectScanConfig[]> = {
  service: [
    {
      tier: 'tier2', apiName: 'Case', label: 'Case',
      fields: ['Reason', 'Status', 'Priority', 'ContactId'],
      checkDuplicates: false, minRecords: 100,
    },
    {
      tier: 'tier2', apiName: 'EmailMessage', label: 'Email Message',
      fields: ['Status', 'FromAddress'],
      checkDuplicates: false, minRecords: 100,
    },
  ],
  sales: [
    {
      tier: 'tier2', apiName: 'Quote', label: 'Quote',
      fields: ['Status', 'ExpirationDate', 'AccountId'],
      checkDuplicates: false, minRecords: 100,
    },
    {
      tier: 'tier2', apiName: 'Contract', label: 'Contract',
      fields: ['Status', 'StartDate', 'AccountId'],
      checkDuplicates: false, minRecords: 100,
    },
    {
      tier: 'tier2', apiName: 'Product2', label: 'Product',
      fields: ['IsActive', 'Family', 'ProductCode'],
      checkDuplicates: false, minRecords: 100,
    },
  ],
  field_service: [
    {
      tier: 'tier2', apiName: 'WorkOrder', label: 'Work Order',
      fields: ['Status', 'AccountId', 'ContactId'],
      checkDuplicates: false, minRecords: 100,
    },
    {
      tier: 'tier2', apiName: 'ServiceAppointment', label: 'Service Appointment',
      fields: ['Status', 'FSL__Scheduled_Start__c'],
      checkDuplicates: false, minRecords: 100,
    },
    {
      tier: 'tier2', apiName: 'Asset', label: 'Asset',
      fields: ['Status', 'AccountId', 'SerialNumber'],
      checkDuplicates: false, minRecords: 100,
    },
  ],
  custom: [],
}

export function loadConfig(overrides?: Partial<ScanConfig>): ScanConfig {
  const base = { ...DEFAULT_CONFIG }
  if (!overrides) return base

  const useCase = overrides.agentforceUseCase ?? base.agentforceUseCase
  const tier2Objects = USE_CASE_OBJECTS[useCase] ?? []

  return {
    ...base,
    ...overrides,
    objects: [
      ...base.objects.filter(o => o.tier === 'tier1'),
      ...tier2Objects,
      ...(overrides.objects?.filter(o => o.tier === 'tier3') ?? []),
    ],
  }
}
