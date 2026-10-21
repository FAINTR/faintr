// Keep the actual checkout and the operator's unpaid probe on the same terms.
export const policyVersion = '2026-10-21';
export function checkoutTerms(plan: string): Record<string, string> {
  return {
    'consent_collection[terms_of_service]': 'required',
    'metadata[faintr_terms_version]': policyVersion,
    'custom_text[submit][message]': plan === 'monthly'
      ? '$3.99 USD charged each month until you cancel. Cancel in FAINTR > VIP > Manage billing before the next renewal; access continues through the paid period. Refund requests: skaggshood@gmail.com. Applicable consumer rights still apply.'
      : '$10 USD once, with no recurring charge. Access applies to this FAINTR account for as long as these features are offered. Refund requests: skaggshood@gmail.com. Applicable consumer rights still apply.',
  };
}
