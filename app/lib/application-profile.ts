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
  type: string;
  date: string;
  issuer: string;
  description: string;
};

export type ApplicationPublication = {
  title: string;
  authorOrder: string;
  date: string;
  venue: string;
  level: string;
  status: string;
  url: string;
  description: string;
};

export type ApplicationLanguage = {
  name: string;
  proficiency: string;
};

export type FixedApplicationProfile = {
  version: 1;
  defaultRegion: "US" | "CN";
  identity: {
    firstName: string;
    middleName: string;
    lastName: string;
    preferredName: string;
    email: string;
    usPhone: string;
    chinaPhone: string;
    wechat: string;
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
  defaultRegion: "US",
  identity: {
    firstName: "",
    middleName: "",
    lastName: "",
    preferredName: "",
    email: "",
    usPhone: "",
    chinaPhone: "",
    wechat: "",
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
    defaultRegion: source.defaultRegion === "CN" ? "CN" : "US",
    identity: {
      firstName: text(identity.firstName, 120),
      middleName: text(identity.middleName, 120),
      lastName: text(identity.lastName, 120),
      preferredName: text(identity.preferredName, 120),
      email: text(identity.email, 320),
      usPhone: text(identity.usPhone, 60),
      chinaPhone: text(identity.chinaPhone, 60),
      wechat: text(identity.wechat, 120),
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
      type: text(item.type, 160),
      date: text(item.date, 40),
      issuer: text(item.issuer, 300),
      description: text(item.description, 2_000),
    })),
    publications: rows(source.publications, (item) => ({
      title: text(item.title, 1_000),
      authorOrder: text(item.authorOrder, 160),
      date: text(item.date, 40),
      venue: text(item.venue, 500),
      level: text(item.level, 120),
      status: text(item.status, 200),
      url: text(item.url, 1_000),
      description: text(item.description, 3_000),
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
    identity: {
      firstName: identity.first_name_en,
      middleName: identity.middle_name_en,
      lastName: identity.last_name_en,
      preferredName: identity.preferred_name,
      email: identity.email,
      usPhone: identity.phone_us || identity.phone,
      chinaPhone: identity.phone_cn || identity.phone,
      wechat: identity.wechat,
    },
    awards: (Array.isArray(source.awards) ? source.awards : []).map((award) => {
      const row = record(award);
      return {
        name: row.name,
        type: row.type || row.category,
        date: row.date || row.year,
        issuer: row.issuer,
        description: row.description || row.summary,
      };
    }),
    publications: (Array.isArray(source.publications) ? source.publications : []).map((publication) => {
      const row = record(publication);
      return {
        title: row.title || row.name,
        authorOrder: row.author_order || row.authorship,
        date: row.publication_date || row.date || row.year,
        venue: row.venue || row.journal || row.publisher,
        level: row.level || row.tier,
        status: row.status,
        url: row.url,
        description: row.details || row.description || row.citation,
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
  const selectedPhone = fixedProfile.defaultRegion === "CN"
    ? fixedProfile.identity.chinaPhone || fixedProfile.identity.usPhone
    : fixedProfile.identity.usPhone || fixedProfile.identity.chinaPhone;
  const identity = record(globalProfile.identity);
  const awards = fixedProfile.awards.filter((item) => item.name || item.description).map((item) => ({
    name: item.name,
    type: item.type,
    category: item.type,
    year: item.date,
    date: item.date,
    issuer: item.issuer,
    description: item.description,
    summary: item.description,
  }));
  const publications = fixedProfile.publications.filter((item) => item.title || item.description).map((item) => ({
    title: item.title,
    author_order: item.authorOrder,
    publication_date: item.date,
    date: item.date,
    venue: item.venue,
    level: item.level,
    status: item.status,
    url: item.url,
    details: item.description,
    description: item.description,
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
      email: fixedProfile.identity.email || identity.email,
      phone: selectedPhone || identity.phone,
      phone_us: fixedProfile.identity.usPhone,
      phone_cn: fixedProfile.identity.chinaPhone,
      wechat: fixedProfile.identity.wechat || identity.wechat,
    },
    fixed_application: fixedProfile,
    ...(awards.length ? { awards } : {}),
    ...(publications.length ? { publications } : {}),
    ...(languages.length ? { languages } : {}),
  };
}
