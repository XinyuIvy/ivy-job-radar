export type FixedAnswer = {
  question: string;
  answer: string;
};

export type ApplicationAddress = {
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type ApplicationAward = {
  name: string;
  type: "individual" | "team" | "";
  date: string;
  issuer: string;
  descriptionZh: string;
  descriptionEn: string;
};

export type ApplicationPublication = {
  title: string;
  authorOrderZh: string;
  authorOrderEn: string;
  date: string;
  venue: string;
  bestVerifiedRank: string;
  jcrQuartile: string;
  casQuartile: string;
  ccfCategory: string;
  status: string;
  url: string;
  descriptionZh: string;
  descriptionEn: string;
};

export type ApplicationLanguage = {
  name: string;
  proficiency: string;
};

export type FixedApplicationProfile = {
  version: 1;
  dataRevision: number;
  defaultRegion: "US" | "CN";
  defaultLanguage: "en" | "zh";
  identity: {
    firstName: string;
    middleName: string;
    lastName: string;
    preferredName: string;
    email: string;
    chineseFullName: string;
    chineseFirstName: string;
    chineseLastName: string;
    chinesePreferredName: string;
    chineseEmail: string;
    usPhone: string;
    chinaPhone: string;
    wechat: string;
    nativePlaceZh: string;
    nativePlaceEn: string;
    birthPlaceZh: string;
    birthPlaceEn: string;
    genderZh: string;
    genderEn: string;
    ethnicityZh: string;
    ethnicityEn: string;
    dateOfBirth: string;
  };
  addresses: {
    us: ApplicationAddress;
    china: ApplicationAddress;
  };
  links: {
    linkedin: string;
    github: string;
    website: string;
  };
  eligibility: {
    age18: string;
    workAuthorizationUS: string;
    sponsorshipUS: string;
    visaStatusUS: string;
    workAuthorizationChina: string;
    relocation: string;
    remoteWork: string;
  };
  application: {
    availableStartDate: string;
    hearAboutUs: string;
  };
  awards: ApplicationAward[];
  publications: ApplicationPublication[];
  languages: ApplicationLanguage[];
  fixedAnswers: FixedAnswer[];
};

const emptyAddress: ApplicationAddress = {
  address1: "",
  address2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

export const emptyFixedApplicationProfile: FixedApplicationProfile = {
  version: 1,
  dataRevision: 0,
  defaultRegion: "US",
  defaultLanguage: "en",
  identity: {
    firstName: "",
    middleName: "",
    lastName: "",
    preferredName: "",
    email: "",
    chineseFullName: "",
    chineseFirstName: "",
    chineseLastName: "",
    chinesePreferredName: "",
    chineseEmail: "",
    usPhone: "",
    chinaPhone: "",
    wechat: "",
    nativePlaceZh: "",
    nativePlaceEn: "",
    birthPlaceZh: "",
    birthPlaceEn: "",
    genderZh: "",
    genderEn: "",
    ethnicityZh: "",
    ethnicityEn: "",
    dateOfBirth: "",
  },
  addresses: {
    us: { ...emptyAddress, country: "United States" },
    china: { ...emptyAddress, country: "中国" },
  },
  links: { linkedin: "", github: "", website: "" },
  eligibility: {
    age18: "",
    workAuthorizationUS: "",
    sponsorshipUS: "",
    visaStatusUS: "",
    workAuthorizationChina: "",
    relocation: "",
    remoteWork: "",
  },
  application: { availableStartDate: "", hearAboutUs: "" },
  awards: [],
  publications: [],
  languages: [],
  fixedAnswers: [],
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, maxLength = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function choice(value: unknown, allowed: readonly string[]) {
  const normalized = text(value, 40);
  return allowed.includes(normalized) ? normalized : "";
}

function address(value: unknown, fallbackCountry: string): ApplicationAddress {
  const source = record(value);
  return {
    address1: text(source.address1, 300),
    address2: text(source.address2, 300),
    city: text(source.city, 120),
    state: text(source.state, 120),
    postalCode: text(source.postalCode, 40),
    country: text(source.country, 120) || fallbackCountry,
  };
}

function rows<T>(value: unknown, build: (source: Record<string, unknown>) => T, maxRows = 40) {
  return (Array.isArray(value) ? value : [])
    .slice(0, maxRows)
    .map((item) => build(record(item)));
}

export function normalizeFixedApplicationProfile(value: unknown): FixedApplicationProfile {
  const source = record(value);
  const identity = record(source.identity);
  const addresses = record(source.addresses);
  const links = record(source.links);
  const eligibility = record(source.eligibility);
  const application = record(source.application);
  return {
    version: 1,
    dataRevision: Number.isFinite(Number(source.dataRevision)) ? Math.max(0, Math.trunc(Number(source.dataRevision))) : 0,
    defaultRegion: source.defaultRegion === "CN" ? "CN" : "US",
    defaultLanguage: source.defaultLanguage === "zh" || (!source.defaultLanguage && source.defaultRegion === "CN") ? "zh" : "en",
    identity: {
      firstName: text(identity.firstName, 120),
      middleName: text(identity.middleName, 120),
      lastName: text(identity.lastName, 120),
      preferredName: text(identity.preferredName, 120),
      email: text(identity.email, 320),
      chineseFullName: text(identity.chineseFullName, 160),
      chineseFirstName: text(identity.chineseFirstName, 120),
      chineseLastName: text(identity.chineseLastName, 120),
      chinesePreferredName: text(identity.chinesePreferredName, 120),
      chineseEmail: text(identity.chineseEmail, 320),
      usPhone: text(identity.usPhone, 60),
      chinaPhone: text(identity.chinaPhone, 60),
      wechat: text(identity.wechat, 120),
      nativePlaceZh: text(identity.nativePlaceZh || identity.nativePlace, 160),
      nativePlaceEn: text(identity.nativePlaceEn, 160),
      birthPlaceZh: text(identity.birthPlaceZh || identity.birthPlace, 160),
      birthPlaceEn: text(identity.birthPlaceEn, 160),
      genderZh: text(identity.genderZh || identity.gender, 80),
      genderEn: text(identity.genderEn, 80),
      ethnicityZh: text(identity.ethnicityZh || identity.ethnicity, 80),
      ethnicityEn: text(identity.ethnicityEn, 80),
      dateOfBirth: text(identity.dateOfBirth || identity.birthDate, 40),
    },
    addresses: {
      us: address(addresses.us, "United States"),
      china: address(addresses.china, "中国"),
    },
    links: {
      linkedin: text(links.linkedin, 500),
      github: text(links.github, 500),
      website: text(links.website, 500),
    },
    eligibility: {
      age18: choice(eligibility.age18, ["yes", "no"]),
      workAuthorizationUS: choice(eligibility.workAuthorizationUS, ["yes", "no"]),
      sponsorshipUS: choice(eligibility.sponsorshipUS, ["yes", "no"]),
      visaStatusUS: text(eligibility.visaStatusUS, 160),
      workAuthorizationChina: choice(eligibility.workAuthorizationChina, ["yes", "no"]),
      relocation: choice(eligibility.relocation, ["yes", "no"]),
      remoteWork: choice(eligibility.remoteWork, ["yes", "no"]),
    },
    application: {
      availableStartDate: text(application.availableStartDate, 80),
      hearAboutUs: text(application.hearAboutUs, 300),
    },
    awards: rows(source.awards, (item) => ({
      name: text(item.name, 500),
      type: /team|group|团队/i.test(text(item.type || item.category, 160)) ? "team" as const
        : /individual|个人/i.test(text(item.type || item.category, 160)) ? "individual" as const : "" as const,
      date: text(item.date, 40),
      issuer: text(item.issuer, 300),
      descriptionZh: text(item.descriptionZh || item.description_zh || item.description, 2_000),
      descriptionEn: text(item.descriptionEn || item.description_en, 2_000),
    })),
    publications: rows(source.publications, (item) => ({
      title: text(item.title, 1_000),
      authorOrderZh: text(item.authorOrderZh || item.author_order_zh || item.authorOrder, 160),
      authorOrderEn: text(item.authorOrderEn || item.author_order_en, 160),
      date: text(item.date, 40),
      venue: text(item.venue, 500),
      bestVerifiedRank: text(item.bestVerifiedRank || item.best_verified_rank || item.level, 120),
      jcrQuartile: text(item.jcrQuartile || item.jcr_quartile, 120),
      casQuartile: text(item.casQuartile || item.cas_quartile, 120),
      ccfCategory: text(item.ccfCategory || item.ccf_category, 120),
      status: text(item.status, 200),
      url: text(item.url, 1_000),
      descriptionZh: text(item.descriptionZh || item.description_zh || item.description, 3_000),
      descriptionEn: text(item.descriptionEn || item.description_en, 3_000),
    })),
    languages: rows(source.languages, (item) => ({
      name: text(item.name, 120),
      proficiency: text(item.proficiency, 120),
    }), 20),
    fixedAnswers: rows(source.fixedAnswers, (item) => ({
      question: text(item.question, 500),
      answer: text(item.answer, 3_000),
    }), 60),
  };
}

export function hasStoredFixedApplicationProfile(value: unknown) {
  const source = record(value);
  return source.version === 1 || Object.keys(source).length > 0;
}

export function profileFromGlobalAutofill(value: unknown): FixedApplicationProfile {
  const source = record(value);
  const identity = record(source.identity);
  return normalizeFixedApplicationProfile({
    defaultRegion: "US",
    defaultLanguage: "en",
    identity: {
      firstName: identity.first_name_en,
      middleName: identity.middle_name_en,
      lastName: identity.last_name_en,
      preferredName: identity.preferred_name,
      email: identity.email,
      chineseFullName: identity.full_name_zh || identity.name_zh,
      chineseFirstName: identity.first_name_zh || identity.given_name_zh,
      chineseLastName: identity.last_name_zh || identity.family_name_zh,
      chinesePreferredName: identity.preferred_name_zh,
      chineseEmail: identity.email_zh || identity.email,
      usPhone: identity.phone_us || identity.phone,
      chinaPhone: identity.phone_cn || identity.phone,
      wechat: identity.wechat,
      nativePlaceZh: identity.native_place_zh || identity.native_place,
      nativePlaceEn: identity.native_place_en,
      birthPlaceZh: identity.birth_place_zh || identity.birth_place,
      birthPlaceEn: identity.birth_place_en,
      genderZh: identity.gender_zh || identity.gender,
      genderEn: identity.gender_en,
      ethnicityZh: identity.ethnicity_zh || identity.ethnicity,
      ethnicityEn: identity.ethnicity_en,
      dateOfBirth: identity.date_of_birth,
    },
    awards: (Array.isArray(source.awards) ? source.awards : []).map((award) => {
      const row = record(award);
      return {
        name: row.name,
        type: row.type || row.category,
        date: row.date || row.year,
        issuer: row.issuer,
        descriptionZh: row.description_zh || row.description || row.summary,
        descriptionEn: row.description_en,
      };
    }),
    publications: (Array.isArray(source.publications) ? source.publications : []).map((publication) => {
      const row = record(publication);
      return {
        title: row.title || row.name,
        authorOrderZh: row.author_order_zh || row.author_order || row.authorship,
        authorOrderEn: row.author_order_en,
        date: row.publication_date || row.date || row.year,
        venue: row.venue || row.journal || row.publisher,
        bestVerifiedRank: row.best_verified_rank || row.level || row.tier,
        jcrQuartile: row.jcr_quartile,
        casQuartile: row.cas_quartile,
        ccfCategory: row.ccf_category,
        status: row.status,
        url: row.url,
        descriptionZh: row.description_zh || row.details || row.description || row.citation,
        descriptionEn: row.description_en,
      };
    }),
    languages: (Array.isArray(source.languages) ? source.languages : []).map((language) => {
      const row = record(language);
      return { name: row.language || row.name, proficiency: row.proficiency };
    }),
  });
}

export function mergeFixedApplicationProfile(
  globalProfile: Record<string, unknown>,
  fixedProfile: FixedApplicationProfile,
) {
  const useChinese = fixedProfile.defaultLanguage === "zh";
  const selectedPhone = useChinese
    ? fixedProfile.identity.chinaPhone || fixedProfile.identity.usPhone
    : fixedProfile.identity.usPhone || fixedProfile.identity.chinaPhone;
  const selectedEmail = useChinese
    ? fixedProfile.identity.chineseEmail || fixedProfile.identity.email
    : fixedProfile.identity.email || fixedProfile.identity.chineseEmail;
  const identity = record(globalProfile.identity);
  const awards = fixedProfile.awards.filter((item) => item.name || item.descriptionZh || item.descriptionEn).map((item) => ({
    name: item.name,
    type: item.type,
    category: item.type,
    year: item.date,
    date: item.date,
    issuer: item.issuer,
    description: useChinese ? item.descriptionZh || item.descriptionEn : item.descriptionEn || item.descriptionZh,
    description_zh: item.descriptionZh,
    description_en: item.descriptionEn,
    summary: useChinese ? item.descriptionZh || item.descriptionEn : item.descriptionEn || item.descriptionZh,
  }));
  const publications = fixedProfile.publications.filter((item) => item.title || item.descriptionZh || item.descriptionEn).map((item) => ({
    title: item.title,
    author_order: useChinese ? item.authorOrderZh || item.authorOrderEn : item.authorOrderEn || item.authorOrderZh,
    author_order_zh: item.authorOrderZh,
    author_order_en: item.authorOrderEn,
    publication_date: item.date,
    date: item.date,
    venue: item.venue,
    level: item.bestVerifiedRank,
    best_verified_rank: item.bestVerifiedRank,
    jcr_quartile: item.jcrQuartile,
    cas_quartile: item.casQuartile,
    ccf_category: item.ccfCategory,
    status: item.status,
    url: item.url,
    details: useChinese ? item.descriptionZh || item.descriptionEn : item.descriptionEn || item.descriptionZh,
    description: useChinese ? item.descriptionZh || item.descriptionEn : item.descriptionEn || item.descriptionZh,
    description_zh: item.descriptionZh,
    description_en: item.descriptionEn,
  }));
  const languages = fixedProfile.languages.filter((item) => item.name).map((item) => ({
    language: item.name,
    proficiency: item.proficiency,
    aliases: [item.name],
  }));
  return {
    ...globalProfile,
    identity: {
      ...identity,
      first_name_en: fixedProfile.identity.firstName || identity.first_name_en,
      middle_name_en: fixedProfile.identity.middleName || identity.middle_name_en,
      last_name_en: fixedProfile.identity.lastName || identity.last_name_en,
      preferred_name: fixedProfile.identity.preferredName || identity.preferred_name,
      full_name_zh: fixedProfile.identity.chineseFullName || identity.full_name_zh,
      first_name_zh: fixedProfile.identity.chineseFirstName || identity.first_name_zh,
      last_name_zh: fixedProfile.identity.chineseLastName || identity.last_name_zh,
      preferred_name_zh: fixedProfile.identity.chinesePreferredName || identity.preferred_name_zh,
      email: selectedEmail || identity.email,
      email_en: fixedProfile.identity.email || identity.email_en,
      email_zh: fixedProfile.identity.chineseEmail || identity.email_zh,
      phone: selectedPhone || identity.phone,
      phone_us: fixedProfile.identity.usPhone,
      phone_cn: fixedProfile.identity.chinaPhone,
      wechat: fixedProfile.identity.wechat || identity.wechat,
      native_place: useChinese ? fixedProfile.identity.nativePlaceZh || fixedProfile.identity.nativePlaceEn : fixedProfile.identity.nativePlaceEn || fixedProfile.identity.nativePlaceZh,
      native_place_zh: fixedProfile.identity.nativePlaceZh,
      native_place_en: fixedProfile.identity.nativePlaceEn,
      birth_place: useChinese ? fixedProfile.identity.birthPlaceZh || fixedProfile.identity.birthPlaceEn : fixedProfile.identity.birthPlaceEn || fixedProfile.identity.birthPlaceZh,
      birth_place_zh: fixedProfile.identity.birthPlaceZh,
      birth_place_en: fixedProfile.identity.birthPlaceEn,
      gender: useChinese ? fixedProfile.identity.genderZh || fixedProfile.identity.genderEn : fixedProfile.identity.genderEn || fixedProfile.identity.genderZh,
      gender_zh: fixedProfile.identity.genderZh,
      gender_en: fixedProfile.identity.genderEn,
      ethnicity: useChinese ? fixedProfile.identity.ethnicityZh || fixedProfile.identity.ethnicityEn : fixedProfile.identity.ethnicityEn || fixedProfile.identity.ethnicityZh,
      ethnicity_zh: fixedProfile.identity.ethnicityZh,
      ethnicity_en: fixedProfile.identity.ethnicityEn,
      date_of_birth: fixedProfile.identity.dateOfBirth || identity.date_of_birth,
    },
    fixed_application: fixedProfile,
    ...(awards.length ? { awards } : {}),
    ...(publications.length ? { publications } : {}),
    ...(languages.length ? { languages } : {}),
  };
}
