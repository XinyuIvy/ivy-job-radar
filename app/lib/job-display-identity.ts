import {
  isPlaceholderJobTitle,
  normalizeJobIdentityText,
  normalizeJobLocation,
  sameLogicalJob,
  type JobIdentityInput,
} from "./job-identity";

export function sameDisplayedJob(left: JobIdentityInput, right: JobIdentityInput) {
  if (sameLogicalJob(left, right)) return true;

  const leftCompany = normalizeJobIdentityText(left.company);
  const rightCompany = normalizeJobIdentityText(right.company);
  const leftTitle = normalizeJobIdentityText(left.title);
  const rightTitle = normalizeJobIdentityText(right.title);
  if (
    !leftCompany
    || leftCompany !== rightCompany
    || !leftTitle
    || leftTitle !== rightTitle
    || isPlaceholderJobTitle(left.title)
    || isPlaceholderJobTitle(right.title)
  ) {
    return false;
  }

  const leftLocation = normalizeJobLocation(left.location);
  const rightLocation = normalizeJobLocation(right.location);
  return leftLocation === rightLocation;
}
