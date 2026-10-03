/**
 * ISO 3166-1 alpha-2 codes the API accepts, named in the reader's language by the browser's own
 * locale data. The code stays the value; only the label is localized.
 */
export const COUNTRY_CODES: readonly string[] = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS ' +
  'BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE ' +
  'EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM ' +
  'HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC ' +
  'LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA ' +
  'NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO ' +
  'TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

let names: Intl.DisplayNames | null | undefined;

export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([$localize.locale || 'en'], { type: 'region' });
    } catch {
      names = null;
    }
  }
  return names?.of(code) ?? code;
}

/** "City, Country" with the reader's own separator; either part may be missing. */
export function placeName(
  city: string | null | undefined,
  countryCode: string | null | undefined,
): string {
  const country = countryName(countryCode);
  if (city && country) return $localize`:@@directory.location:${city}:city:, ${country}:country:`;
  return city || country;
}

/** Codes sorted by their localized name, for pickers. */
export function sortedCountries(): { code: string; name: string }[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name, $localize.locale || 'en'),
  );
}
