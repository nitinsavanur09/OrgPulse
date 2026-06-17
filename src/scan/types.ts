import type { ScanConfig } from './config'

export interface LimitsSignal {
  apiUsagePct:     number
  storageUsagePct: number
  fileUsagePct:    number
}

export interface SecuritySignal {
  healthCheckScore:   number
  failingCheckCount:  number
  criticalCheckCount: number
  guestUserRisk:      boolean
}

export interface FieldCompletenessSignal {
  objectName:      string
  totalRecords:    number
  completionRates: Record<string, number>
}

export interface DuplicateSignal {
  objectName:    string
  duplicateCount: number
  duplicateRate:  number
}

export interface AutomationSignal {
  totalActiveFlows:      number
  flowsWithNoFaultPath:  number
  legacyAutomationCount: number
  apexCoveragePct:       number
  highRiskObjects:       string[]
}

export interface KnowledgeSignal {
  articleCount:     number
  staleArticleCount: number
  topCaseReasons:   string[]
  coverageGapCount: number
}

export interface MetadataSignal {
  unusedFieldCount:      number
  abandonedPackageCount: number
}

export interface AdoptionSignal {
  loginRatePct:         number
  avgActivitiesPerUser: number
}

export interface CaseVolumeSignal {
  monthlyVolume: number
  topReasons:    Array<{ reason: string; count: number }>
}

export interface AllSignals {
  limits:      LimitsSignal
  security:    SecuritySignal
  dataQuality: FieldCompletenessSignal[]
  duplicates:  DuplicateSignal[]
  automation:  AutomationSignal
  knowledge:   KnowledgeSignal
  metadata:    MetadataSignal
  adoption:    AdoptionSignal
  caseVolume:  CaseVolumeSignal
  configUsed:  ScanConfig
}
