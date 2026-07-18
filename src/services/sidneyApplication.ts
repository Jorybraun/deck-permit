import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { SidneyApplicationData } from '../types';
export type { SidneyApplicationData } from '../types';

export const SIDNEY_APPLICATION_URL = 'https://www.sidney.ca/wp-content/uploads/Building-Permit-Application-SF-2F-Demo-Accessory.pdf';
export const SIDNEY_APPLICATION_EDITION = 'April 2026';

export function validateSidneyApplication(data: SidneyApplicationData): string[] {
  const missing: string[] = [];
  if (!data.civicAddress.trim()) missing.push('civic address');
  if (!data.ownerName.trim()) missing.push('property owner name');
  if (!data.ownerAddress.trim()) missing.push('owner mailing address');
  if (!data.ownerCityProvince.trim()) missing.push('owner city and province');
  if (!data.ownerPostalCode.trim()) missing.push('owner postal code');
  if (!data.ownerPhone.trim()) missing.push('owner phone');
  if (!data.ownerEmail.trim()) missing.push('owner email');
  if (!data.projectDescription.trim()) missing.push('project description');
  if (!data.constructionValue.trim()) missing.push('construction value');
  return missing;
}

export async function buildSidneyApplicationPdf(data: SidneyApplicationData): Promise<Uint8Array> {
  const missing = validateSidneyApplication(data);
  if (missing.length) throw new Error(`Complete the following before generating: ${missing.join(', ')}.`);

  const response = await fetch('/api/sidney-application');
  if (!response.ok) throw new Error('The current Town of Sidney application template could not be downloaded.');

  const pdf = await PDFDocument.load(await response.arrayBuffer());
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const put = (name: string, value: string) => {
    const field = form.getTextField(name);
    field.setText(value.trim());
    field.setFontSize(value.length > 58 ? 7 : value.length > 36 ? 8 : 9);
  };

  put('Civic Address', data.civicAddress);
  put('Property Owner Name', data.ownerName);
  put('Company', data.ownerCompany);
  put('Address', data.ownerAddress);
  put('City  Province', data.ownerCityProvince);
  put('Postal Code', data.ownerPostalCode);
  put('Phone 1', data.ownerPhone);
  put('Email', data.ownerEmail);

  put('Contractor/Applicant Name', data.applicantName || data.ownerName);
  put('Company_2', data.applicantCompany);
  put('Business Licence   Municipality', data.applicantBusinessLicence);
  put('Address_2', data.applicantAddress || data.ownerAddress);
  put('City  Province_2', data.applicantCityProvince || data.ownerCityProvince);
  put('Postal Code_2', data.applicantPostalCode || data.ownerPostalCode);
  put('Phone 1_2', data.applicantPhone || data.ownerPhone);
  put('Email_2', data.applicantEmail || data.ownerEmail);

  form.getCheckBox('Check Box4').check(); // Addition
  form.getCheckBox('Check Box6').check(); // Deck
  put('Describe Project 1', data.projectDescription);
  put('Total value of all works for project', data.constructionValue.replace(/^\$\s*/, ''));
  put('Existing Total Floor Area m² per floor', data.existingFloorAreaSqm);
  put('Proposed Total Floor Area m² per floor', data.existingFloorAreaSqm);
  put('Proposed Building Area (m²)', data.deckAreaSqm);
  put('Proposed Number of Residential Units', 'No change');
  put('Proposed Number of Commercial Units', '0');

  put('IncludedSite Plan', 'Included');
  put('IncludedFloor Plan', 'Included');
  put('IncludedElevations', 'Included');
  put('IncludedBuilding Section', 'Included');
  put('IncludedProfessional Engineering', 'Pending review');
  put('Date', new Intl.DateTimeFormat('en-CA').format(new Date()));

  form.updateFieldAppearances(font);
  pdf.setTitle(`Town of Sidney building permit application — ${data.civicAddress}`);
  pdf.setSubject('Prefilled residential deck permit application; owner signature and checklist confirmation required.');
  pdf.setProducer('Deck Permit application using the official Town of Sidney April 2026 template');
  return pdf.save();
}

export async function downloadSidneyApplication(data: SidneyApplicationData): Promise<void> {
  const bytes = await buildSidneyApplicationPdf(data);
  const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sidney-deck-permit-application-${data.civicAddress.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
