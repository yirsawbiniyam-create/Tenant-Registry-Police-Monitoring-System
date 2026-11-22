export const FIELD_LIMITS = {
  ID_MAX: 128,
  NAME_MAX: 150,
  PHONE_MAX: 30,
  EMAIL_MAX: 160,
  FAYDA_MAX: 60,
  CITY_MAX: 100,
  WOREDA_MAX: 100,
  KEBELE_MAX: 100,
  HOUSE_MAX: 60,
  OCCUPATION_MAX: 120,
  REASON_MAX: 1000,
  DESCRIPTION_MAX: 2000,
  IMAGE_MAX: 350000,
  LOGO_MAX: 450000,
  USERNAME_PATTERN: /^[a-zA-Z0-9_.\-]+$/,
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
} as const;

export type JurisdictionLevel = 'regional' | 'city' | 'woreda' | 'kebele';
export type MaritalStatus = 'married' | 'single';
export type LivingArrangement = 'alone' | 'with_others';
export type TenantIdType = 'fayda' | 'police_digital';
export type RecordType = 'arrested' | 'suspect' | 'convicted' | 'released';

export interface BrandingSetting {
  commissionName: string;
  subtitle?: string;
  logoDataUrl: string;
  regionalFlagDataUrl?: string;
  ethiopianFlagDataUrl?: string;
  updatedByUid: string;
  updatedAt: unknown;
}

export interface AdminCredential {
  credId: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  isDefaultPassword: boolean;
  updatedByUid: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface Jurisdiction {
  id: string;
  region?: string;
  zone?: string;
  city: string;
  woreda: string;
  kebele: string;
  createdByUid: string;
  createdAt: unknown;
}

export interface PoliceOfficer {
  officerId: string;
  fullName: string;
  rank: string;
  badgeNumber: string;
  phone: string;
  username: string;
  officerEmail?: string;
  passwordHash: string;
  passwordSalt: string;
  jurisdictionLevel: JurisdictionLevel;
  city: string;
  woreda: string;
  kebele: string;
  active: boolean;
  createdByUid: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface Landlord {
  landlordId: string;
  ownerUid: string;
  fullName: string;
  phone: string;
  region?: string;
  zone?: string;
  city: string;
  woreda: string;
  kebele: string;
  houseNumber: string;
  roomCount: number;
  faydaId: string;
  idFrontImage: string;
  idBackImage: string;
  passwordHash: string;
  passwordSalt: string;
  status: 'active' | 'replaced' | 'suspended';
  replacedByLandlordId?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface Tenant {
  tenantId: string;
  landlordId: string;
  landlordUid: string;
  landlordName: string;
  landlordPhone: string;
  region?: string;
  zone?: string;
  city: string;
  woreda: string;
  kebele: string;
  houseNumber: string;
  roomLabel: string;
  fullName: string;
  phone: string;
  maritalStatus: MaritalStatus;
  livingArrangement: LivingArrangement;
  coResidents: string[];
  occupation: string;
  isPoliceTenant: boolean;
  idType: TenantIdType;
  idNumber: string;
  idFrontImage: string;
  idBackImage: string;
  portraitImage?: string;
  moveInDate: string;
  status: 'active' | 'moved_out';
  replacedTenantId?: string;
  replacedTenantName?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface WantedPerson {
  wantedId: string;
  fullName: string;
  phone: string;
  faydaId: string;
  photoImage?: string;
  reason: string;
  caseNumber: string;
  priority: 'critical' | 'high' | 'medium';
  status: 'active' | 'captured' | 'closed';
  reportedByOfficerId?: string;
  reportedByName: string;
  createdByUid: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface WantedAlert {
  alertId: string;
  wantedId: string;
  wantedName: string;
  tenantId: string;
  tenantName: string;
  tenantPhone?: string;
  landlordId: string;
  landlordName: string;
  landlordPhone: string;
  city: string;
  woreda: string;
  kebele: string;
  houseNumber?: string;
  matchType: string;
  status: 'unread' | 'acknowledged' | 'resolved';
  createdByUid: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CriminalRecord {
  recordId: string;
  personName: string;
  phone?: string;
  faydaId?: string;
  photoImage?: string;
  recordType: RecordType;
  offenseTitle: string;
  description: string;
  city: string;
  woreda: string;
  kebele: string;
  stationName: string;
  incidentDate: string;
  recordedByOfficerId?: string;
  recordedByName: string;
  createdByUid: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export type ActivityActionType =
  | 'landlord_registered'
  | 'landlord_address_changed'
  | 'landlord_replaced'
  | 'tenant_registered'
  | 'tenant_moved_out'
  | 'password_reset'
  | 'wanted_registered'
  | 'criminal_record_added'
  | 'criminal_record_updated'
  | 'officer_created'
  | 'officer_updated'
  | 'user_deleted'
  | 'record_deleted'
  | 'logo_updated'
  | 'admin_credentials_updated';

export interface ActivityHistory {
  historyId: string;
  actorUid: string;
  actorRole: 'admin' | 'police' | 'landlord';
  actorName: string;
  actionType: ActivityActionType;
  subjectType: 'landlord' | 'tenant' | 'officer' | 'wanted' | 'criminal_record' | 'system';
  subjectId: string;
  subjectName: string;
  subjectPhone?: string;
  subjectIdNumber?: string;
  city: string;
  woreda: string;
  kebele: string;
  details: string;
  createdAt: unknown;
}

export type ActivePortalSession =
  | { role: 'admin'; displayName: string; email: string; adminUsername: string }
  | { role: 'police'; officer: PoliceOfficer }
  | { role: 'landlord'; landlord: Landlord };
