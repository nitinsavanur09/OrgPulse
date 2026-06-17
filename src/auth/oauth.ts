import 'dotenv/config'
import * as jsforce from 'jsforce'

if (!process.env.SF_CLIENT_ID || !process.env.SF_CLIENT_SECRET || !process.env.SF_REDIRECT_URI) {
  throw new Error('SF_CLIENT_ID, SF_CLIENT_SECRET, and SF_REDIRECT_URI must be set in .env')
}

export const oauth2 = new jsforce.OAuth2({
  loginUrl:     process.env.SF_LOGIN_URL ?? 'https://login.salesforce.com',
  clientId:     process.env.SF_CLIENT_ID,
  clientSecret: process.env.SF_CLIENT_SECRET,
  redirectUri:  process.env.SF_REDIRECT_URI,
})
