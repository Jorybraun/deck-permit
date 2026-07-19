import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildSidneyApplicationPdf, validateSidneyApplication, type SidneyApplicationData } from './sidneyApplication';

const complete: SidneyApplicationData = {
  civicAddress: '2423 Lovell Avenue, Sidney, BC',
  ownerName: 'Owner Name', ownerCompany: '', ownerAddress: '2423 Lovell Avenue', ownerCityProvince: 'Sidney, BC', ownerPostalCode: 'V8L 2J4', ownerPhone: '250-555-0100', ownerEmail: 'owner@example.com',
  applicantName: '', applicantCompany: '', applicantBusinessLicence: '', applicantAddress: '', applicantCityProvince: '', applicantPostalCode: '', applicantPhone: '', applicantEmail: '',
  projectDescription: 'Construct an attached residential wood deck.', constructionValue: '25000', existingFloorAreaSqm: '', deckAreaSqm: '20.8', authorizeTownTitleSearch: true,
};

describe('Sidney application validation', () => {
  it('accepts the owner-as-applicant minimum', () => expect(validateSidneyApplication(complete)).toEqual([]));
  it('reports the owner fields required by the official application', () => {
    const errors = validateSidneyApplication({ ...complete, ownerName: '', ownerEmail: '', constructionValue: '' });
    expect(errors).toEqual(['property owner name', 'owner email', 'construction value']);
  });

  it('prefills the official field names and preserves an editable PDF', async () => {
    const template = await PDFDocument.create();
    const page = template.addPage();
    const form = template.getForm();
    const textFields = [
      'Civic Address', 'Property Owner Name', 'Company', 'Address', 'City  Province', 'Postal Code', 'Phone 1', 'Email',
      'Contractor/Applicant Name', 'Company_2', 'Business Licence   Municipality', 'Address_2', 'City  Province_2', 'Postal Code_2', 'Phone 1_2', 'Email_2',
      'Describe Project 1', 'Total value of all works for project', 'Existing Total Floor Area m² per floor', 'Proposed Total Floor Area m² per floor',
      'Proposed Building Area (m²)', 'Proposed Number of Residential Units', 'Proposed Number of Commercial Units',
      'IncludedSite Plan', 'IncludedFloor Plan', 'IncludedElevations', 'IncludedBuilding Section', 'IncludedProfessional Engineering', 'Date',
    ];
    textFields.forEach((name, index) => form.createTextField(name).addToPage(page, { x: 10, y: 10 + index * 2, width: 100, height: 10 }));
    form.createCheckBox('Check Box4').addToPage(page, { x: 120, y: 20, width: 10, height: 10 });
    form.createCheckBox('Check Box6').addToPage(page, { x: 140, y: 20, width: 10, height: 10 });
    form.createCheckBox('Check Box10').addToPage(page, { x: 160, y: 20, width: 10, height: 10 });
    const bytes = await template.save();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'application/pdf' } });
    try {
      const output = await buildSidneyApplicationPdf(complete);
      const resultForm = (await PDFDocument.load(output)).getForm();
      expect(resultForm.getTextField('Civic Address').getText()).toBe(complete.civicAddress);
      expect(resultForm.getTextField('Property Owner Name').getText()).toBe(complete.ownerName);
      expect(resultForm.getTextField('Contractor/Applicant Name').getText()).toBe(complete.ownerName);
      expect(resultForm.getTextField('Proposed Building Area (m²)').getText()).toBe('20.8');
      expect(resultForm.getCheckBox('Check Box4').isChecked()).toBe(true);
      expect(resultForm.getCheckBox('Check Box6').isChecked()).toBe(true);
      expect(resultForm.getCheckBox('Check Box10').isChecked()).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
