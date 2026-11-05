import API from "./axios";

// Full saved referral record for a referrer — used by the form to auto-fill
// hospital name, address, mail and notes when a referrer is picked.
export interface ReferralRecordDetails {
  referred_by: string;
  referral_contact: string;
  referral_branch_name: string;
  referral_address: string;
  referral_mail: string;
  referral_notes: string;
}

export const referralApi = {
  // Returns distinct referral_type values from the referral master table.
  getTypes: async (): Promise<string[]> => {
    const res = await API.get("/referral/types");
    return res.data?.data ?? [];
  },

  // Returns distinct referred_by / referral_contact / referral_branch_name /
  // referral_address / referral_mail / referral_notes values, and sync maps,
  // for the given referral_type (each referral type keeps its own option pool).
  // nameToDetails / contactToDetails map a referrer (by name / by contact) to
  // its full saved record for auto-fill. Used to populate the dependent dropdowns.
  getOptions: async (type: string): Promise<{
    referred_by: string[];
    referral_contact: string[];
    referral_branch_name: string[];
    referral_address: string[];
    referral_mail: string[];
    referral_notes: string[];
    nameToContacts: Record<string, string[]>;
    contactToNames: Record<string, string[]>;
    nameToDetails: Record<string, ReferralRecordDetails>;
    contactToDetails: Record<string, ReferralRecordDetails>;
  }> => {
    const res = await API.get("/referral/options", { params: { type } });
    return res.data?.data ?? {
      referred_by: [],
      referral_contact: [],
      referral_branch_name: [],
      referral_address: [],
      referral_mail: [],
      referral_notes: [],
      nameToContacts: {},
      contactToNames: {},
      nameToDetails: {},
      contactToDetails: {},
    };
  },
};
