import * as fs from 'fs'
import * as path from 'path'
import type { ReportData } from './json-schema'

// Load template once at module init — not per call
const TEMPLATE_PATH = path.join(__dirname, '../../templates/orgpulse-v2.html')
let _template: string | null = null

function getTemplate(): string {
  if (!_template) {
    _template = fs.readFileSync(TEMPLATE_PATH, 'utf8')
  }
  return _template
}

export function generateReport(data: ReportData): string {
  const template = getTemplate()
  const script = `<script>window.REPORT_DATA=${JSON.stringify(data)}<\/script>`
  return template.replace('</head>', script + '\n</head>')
}
